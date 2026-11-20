// Reads the simple front matter the registries use: `key: value` lines, with values that
// are bare words, JSON strings or one-line lists like `[G-0001, D-0002]`.
import { readFileSync } from 'node:fs';

export const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

export function parse(text) {
  const body = text.replace(/\r\n/g, '\n');
  const fm = body.match(/^---\n([\s\S]*?)\n---/)?.[1];
  const fields = {};
  if (fm === undefined) return { hasFrontMatter: false, fields, body };
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"')) {
      // A JSON string, optionally followed by a comment.
      const quoted = v.match(/^"(?:[^"\\]|\\.)*"/)?.[0];
      try {
        v = JSON.parse(quoted ?? v);
      } catch {
        v = v.replace(/^"|"$/g, '');
      }
    } else {
      v = v.replace(/(^|\s+)#.*$/, '').trim();
      if (/^\[.*\]$/.test(v))
        v = v
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
    }
    fields[m[1]] = v;
  }
  return { hasFrontMatter: true, fields, body };
}

export const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const triple = (v) => {
  const m = String(v ?? '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : undefined;
};
export const isVersion = (v) => triple(v) !== undefined;
export function compareVersions(a, b) {
  const [x, y] = [triple(a), triple(b)];
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
