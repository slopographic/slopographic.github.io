// The pixel size of a JPEG file, read from its frame header (no image library): { width, height }, or null when the
// file is missing or not a JPEG. Used by tools/seo/landing.mjs so a landing page's video and screenshot get the width
// and height of their poster (no layout shift when it loads). Tests: tests/seo/seo.landing.test.mjs.
import { readFileSync, existsSync } from 'node:fs';

/** Start-of-frame markers (C0-CF but DHT C4, JPG C8 and DAC CC) hold the height and width. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function jpegSize(file) {
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }   // fill byte
    if (SOF.has(m)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }   // no length
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
