// Unpacks the release archives `harness backend` downloads (G-0032): zip (PocketBase, and Go
// on Windows) and tar.gz (Go elsewhere), without a dependency or a system tool. Entries that
// would land outside the destination are refused; links are skipped.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { gunzipSync, inflateRawSync } from 'node:zlib';

// The path an entry would get under `dest`, or an error for one that leaves it.
export function safePath(dest, name) {
  const clean = name.replace(/\\/g, '/');
  if (clean.startsWith('/') || /^[A-Za-z]:/.test(clean) || clean.split('/').includes('..'))
    throw new Error(`the archive holds an entry outside its folder: ${name}`);
  const root = resolve(dest);
  const path = resolve(root, clean);
  if (path !== root && !path.startsWith(root + sep)) throw new Error(`the archive holds an entry outside its folder: ${name}`);
  return path;
}

function put(dest, entry) {
  const path = safePath(dest, entry.name);
  if (entry.dir) {
    mkdirSync(path, { recursive: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, entry.data);
  if (entry.mode & 0o111) {
    try {
      chmodSync(path, entry.mode & 0o777);
    } catch {
      // Not every file system has modes.
    }
  }
}

// [{ name, dir, mode, data }] of a zip archive, read through its central directory.
export function zipEntries(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('zip64 archives are not supported');
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('a damaged zip archive');
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const external = buf.readUInt32LE(at + 38);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    const unixMode = (external >>> 16) & 0xffff;
    if ((unixMode & 0o170000) === 0o120000) continue; // a link
    const dir = name.endsWith('/');
    let data = Buffer.alloc(0);
    if (!dir) {
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('a damaged zip archive');
      const from = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.subarray(from, from + size);
      if (method === 0) data = raw;
      else if (method === 8) data = inflateRawSync(raw);
      else throw new Error(`${name}: compression method ${method} is not supported`);
    }
    entries.push({ name, dir, mode: unixMode & 0o777, data });
  }
  return entries;
}

const field = (block, from, length) => block.toString('utf8', from, from + length).replace(/\0.*$/s, '');
const octal = (block, from, length) => parseInt(field(block, from, length).trim() || '0', 8);

// [{ name, dir, mode, data }] of a tar archive (ustar, with PAX and GNU long names).
export function tarEntries(buf) {
  const entries = [];
  let at = 0;
  let longName;
  while (at + 512 <= buf.length) {
    const header = buf.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const data = buf.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = field(data, 0, data.length);
      continue;
    }
    if (type === 'x') {
      for (const record of data.toString('utf8').split('\n')) {
        const m = record.match(/^\d+ path=(.*)$/s);
        if (m) longName = m[1];
      }
      continue;
    }
    if (type === 'g') continue;
    const prefix = field(header, 257, 6) === 'ustar' ? field(header, 345, 155) : '';
    const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    longName = undefined;
    if (type === '5') entries.push({ name, dir: true, mode: octal(header, 100, 8), data: Buffer.alloc(0) });
    else if (type === '0' || type === '7') entries.push({ name, dir: false, mode: octal(header, 100, 8), data: Buffer.from(data) });
    // Links and special files are skipped.
  }
  return entries;
}

export function extractZip(buf, dest) {
  for (const e of zipEntries(buf)) put(dest, e);
}

export function extractTarGz(buf, dest) {
  for (const e of tarEntries(gunzipSync(buf))) put(dest, e);
}

export const extract = (file, buf, dest) => (file.endsWith('.zip') ? extractZip(buf, dest) : extractTarGz(buf, dest));
