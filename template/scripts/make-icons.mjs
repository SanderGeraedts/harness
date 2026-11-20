// Draws the app icons into public/icons: three bars in the accent colour (D-0003).
// Run: pnpm run icons. Change the shape or the colours here, then run it again.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BACKGROUND = '#1c1c1e'
const ACCENT = '__ACCENT__'

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const BG = rgb(BACKGROUND)
const FG = rgb(ACCENT)

/** The bars, in unit coordinates (0..1): [x, y, width, height], each with round ends. */
const BARS = [
  [0.24, 0.27, 0.52, 0.1],
  [0.24, 0.45, 0.52, 0.1],
  [0.24, 0.63, 0.34, 0.1],
]

function inShape(x, y) {
  return BARS.some(([bx, by, w, h]) => {
    const r = h / 2
    const cx = Math.min(Math.max(x, bx + r), bx + w - r)
    return (x - cx) ** 2 + (y - (by + r)) ** 2 <= r * r
  })
}

function inRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** maskable: full-bleed background and the shape inside the 80% safe zone. */
function png(size, { maskable }) {
  const ss = 4 // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size
          const y = (py + (sy + 0.5) / ss) / size
          if (!maskable && !inRoundedSquare(x, y, 0.2)) continue
          const s = maskable ? 0.75 : 1
          if (inShape((x - 0.5) / s + 0.5, (y - 0.5) / s + 0.5)) fg++
          else bg++
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4
      for (let i = 0; i < 3; i++) raw[o + i] = bg + fg ? Math.round((BG[i] * bg + FG[i] * fg) / (bg + fg)) : 0
      raw[o + 3] = Math.round(((bg + fg) / (ss * ss)) * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const bars = BARS.map(([x, y, w, h]) => `<rect x="${x * 100}" y="${y * 100}" width="${w * 100}" height="${h * 100}" rx="${h * 50}"/>`).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="20" fill="${BACKGROUND}"/>
<g fill="${ACCENT}">${bars}</g>
</svg>
`

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('icon-192.png', out), png(192, { maskable: false }))
writeFileSync(new URL('icon-512.png', out), png(512, { maskable: false }))
writeFileSync(new URL('icon-maskable-512.png', out), png(512, { maskable: true }))
writeFileSync(new URL('icon.svg', out), svg)
console.log('icons written to public/icons')
