// Renders tools/og/share-card.html to og-share.png (1200 x 630) with the local Chromium.
// Run: node tools/og/render.mjs   (no network: the card loads only the repo's own files)
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'og-share.png');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(here, 'share-card.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'png' });
  console.log('wrote', out);
} finally {
  await browser.close();
}
