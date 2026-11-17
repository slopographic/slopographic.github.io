#!/usr/bin/env node
// Writes garden-sample.pdf, the two-page PDF of the Drive version tests (tests/drive/versions.test.html,
// tests/drive/purge-versions.test.html) and the convert dialog's contrast check (tests/a11y/components.js).
// Made with the vendored pdf-lib, with a fixed date and a seeded random (pdf-lib names each font resource with a random
// suffix), so the same pdf-lib writes the same bytes:   node tests/drive/fixtures/make-garden-sample.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { PDFDocument, StandardFonts, rgb } = createRequire(import.meta.url)('../../../vendor/pdf-lib/pdf-lib.min.js');

const PAGES = [
  ['Garden Notes', 'Tomatoes like sun, and plenty of it.', 'Water early in the morning, before the heat.',
    'Basil grows faster on a warm windowsill.', 'Mulch keeps the soil damp and the weeds down.',
    'Check the rain gauge every morning before breakfast.'],
  ['Chapter Two: Soil', 'Good soil holds water without turning to mud.', 'Compost is ready when it smells like a forest floor.',
    'Turn the beds in spring, not in winter.', 'Always label your seed packets with the date.'],
];
const DATE = new Date('2026-11-03T00:00:00Z');

let seed = 20261103;   // mulberry32
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const doc = await PDFDocument.create();
doc.setCreationDate(DATE);
doc.setModificationDate(DATE);
const bold = await doc.embedFont(StandardFonts.HelveticaBold), regular = await doc.embedFont(StandardFonts.Helvetica);
const ink = rgb(0.1, 0.1, 0.1);
PAGES.forEach(([title, ...lines], i) => {
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: rgb(0.85, 0.88, 0.92) });
  page.drawText(title, { x: 48, y: 800, size: 22, font: bold, color: ink });
  lines.forEach((line, j) => page.drawText(line, { x: 48, y: j ? 716 - 26 * j : 730, size: j ? 12 : 14, font: regular, color: ink }));
  page.drawCircle({ x: 520, y: 150, size: 40, color: rgb(0.25, 0.45, 0.75) });
  page.drawText(String(i + 1), { x: 56, y: 40, size: 9, font: bold, color: ink });
});
writeFileSync(path.join(HERE, 'garden-sample.pdf'), await doc.save());
