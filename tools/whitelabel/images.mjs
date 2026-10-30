#!/usr/bin/env node
// The raster images of a white-label build, rendered from its own files in headless Chromium (Playwright): the PWA icons
// (assets/icons/icon-192.png, icon-512.png, and icon-maskable-512.png: the mark at 72 % on the ink colour, inside the
// launcher mask's safe zone) from brand/mark.svg, favicon.ico (16 px from favicon.svg, the tab drawing,
// which a mascot overlay draws small; 32 and 48 px from brand/mark.svg), and the share card og-share.png (1200 x 630) from
// brand/brand.json (name, tagline, colours) and brand/mark.svg.
//   node tools/whitelabel/images.mjs <build dir>
// Node only. Tests: tests/node/whitelabel-build.test.mjs (the ICO container).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** An .ico file that holds PNG images (every browser reads PNG-in-ICO). pngs: [{ size, data }]. */
export function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** The share card's HTML: the mark, the name and the tagline on the brand's ink colour. */
export function cardHtml(brand, markSvg) {
  const c = brand.colors;
  return `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:${c.ink};color:${c.paper};font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box">
<div style="width:120px;height:120px">${markSvg.replace('<svg ', '<svg width="120" height="120" ')}</div>
<h1 style="font-size:76px;font-weight:700;margin:40px 0 16px;letter-spacing:-1px">${esc(brand.name)}</h1>
<p style="font-size:32px;line-height:1.35;margin:0;max-width:960px;opacity:.85">${esc(brand.tagline)}</p>
<div style="position:absolute;left:0;right:0;bottom:0;height:12px;background:${c.accent}"></div></body></html>`;
}

/** The maskable icon's HTML (512 px): the mark at 72 % of the square, centred on the brand's ink colour. */
export function maskableHtml(brand, markSvg) {
  const mark = markSvg.replace(/^<svg\b[^>]*>/, (t) => t.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', '<svg width="368" height="368"'));
  return `<!doctype html><body style="margin:0;width:512px;height:512px;background:${brand.colors.ink};display:grid;place-items:center">${mark}</body>`;
}

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* the repo's own copy next */ }
  return createRequire(pathToFileURL(path.join(ROOT, 'package.json')).href)('playwright');
}

export async function render(dir) {
  const small = readFileSync(path.join(dir, 'favicon.svg'), 'utf8'), svg = readFileSync(path.join(dir, 'brand/mark.svg'), 'utf8');
  const brand = JSON.parse(readFileSync(path.join(dir, 'brand/brand.json'), 'utf8'));
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const png = async (size, from = svg) => {
      await page.setViewportSize({ width: size, height: size });
      const sized = from.replace(/^<svg\b[^>]*>/, (t) => t.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', `<svg width="${size}" height="${size}"`));
      await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${sized}</body>`);
      return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    };
    mkdirSync(path.join(dir, 'assets/icons'), { recursive: true });
    for (const s of [192, 512]) writeFileSync(path.join(dir, `assets/icons/icon-${s}.png`), await png(s));
    await page.setViewportSize({ width: 512, height: 512 });
    await page.setContent(maskableHtml(brand, svg));
    writeFileSync(path.join(dir, 'assets/icons/icon-maskable-512.png'), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 512, height: 512 } }));
    writeFileSync(path.join(dir, 'favicon.ico'), ico([{ size: 16, data: await png(16, small) }, { size: 32, data: await png(32) }, { size: 48, data: await png(48) }]));
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(cardHtml(brand, svg));
    writeFileSync(path.join(dir, 'og-share.png'), await page.screenshot({ type: 'png' }));
  } finally { await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.error('usage: images.mjs <build dir>'); process.exit(2); }
  await render(path.resolve(process.argv[2]));
}
