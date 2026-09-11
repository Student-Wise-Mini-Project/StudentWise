/**
 * Generate the PWA icon set from one SVG.
 *
 *   npm run gen:icons
 *
 * Rerunnable on purpose: when the visual identity from Claude Design lands, the
 * icon changes in one place and this regenerates every size, rather than someone
 * exporting six PNGs by hand and getting one of them slightly wrong.
 *
 * Three shapes, because they are genuinely different pictures:
 *   - `pwa-192` / `pwa-512`  the icon as drawn, transparent corners allowed
 *   - `pwa-maskable-512`     the same mark inside the 80% safe zone, on a full
 *                            bleed background -- Android crops maskable icons to
 *                            a circle, and an un-padded icon loses its edges
 *   - `apple-touch-icon-180` no transparency and no rounding: iOS applies its own
 *                            mask, and a pre-rounded icon gets rounded twice
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/icons')

// Kept in step with src/styles/theme.css by hand: an SVG cannot read a CSS token.
const ACCENT = '#2440c9'
const INK = '#ffffff'

/** The mark: three ledger lines, the last one short — a split that is not equal. */
function mark({ size, padding, background, rounded }) {
  const inner = size - padding * 2
  const stroke = inner * 0.1
  const gap = inner * 0.26
  const top = padding + inner * 0.22
  const x1 = padding + inner * 0.14
  const x2 = padding + inner * 0.86
  const x3 = padding + inner * 0.55

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded}" fill="${background}"/>
  <g stroke="${INK}" stroke-width="${stroke}" stroke-linecap="round">
    <path d="M${x1} ${top}H${x2}"/>
    <path d="M${x1} ${top + gap}H${x2}"/>
    <path d="M${x1} ${top + gap * 2}H${x3}"/>
  </g>
</svg>`)
}

const TARGETS = [
  { name: 'pwa-192.png', size: 192, padding: 0, rounded: 42 },
  { name: 'pwa-512.png', size: 512, padding: 0, rounded: 112 },
  // Maskable: the mark sits inside the middle 80%, so a circular crop keeps it.
  { name: 'pwa-maskable-512.png', size: 512, padding: 51, rounded: 0 },
  // iOS masks it itself, so this one is square -- and flattened, because Safari
  // composites any alpha channel over black rather than over the icon colour.
  { name: 'apple-touch-icon-180.png', size: 180, padding: 0, rounded: 0, opaque: true },
]

await mkdir(OUT, { recursive: true })

for (const target of TARGETS) {
  const svg = mark({ ...target, background: ACCENT })
  const pipeline = sharp(svg)
  if (target.opaque) pipeline.flatten({ background: ACCENT })
  const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
  await writeFile(resolve(OUT, target.name), png)
  console.log(`  ${target.name.padEnd(26)} ${target.size}x${target.size}  ${png.length} bytes`)
}

console.log(`\nWrote ${TARGETS.length} icons to public/icons/.`)
