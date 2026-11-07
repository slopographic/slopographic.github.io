/* A favicon set for a website from one picture: favicon.ico (16, 32 and 48 px in one file), PNG icons for browsers,
 * Apple and Android, a web app manifest and the <link> tags to paste, in one ZIP. The picture is fitted into a square
 * (centred, the rest transparent or the colour chosen). Drawing is browser only (image.js); the text files are pure.
 *   FAVICON_PNGS                         [file name, size] of the PNG icons
 *   manifestJson({ name, color }) / headTags({ color }) -> text   the site.webmanifest and the tags for the page's <head>
 *   faviconZip(file, kind, { name, color, background, padding }) -> Blob */
import { decodeSource, makeCanvas, canvasToBlob } from './image.js';
import { encodeIcoImages } from './ico.js';
import { writeZip } from '../../../shared/office/zip.js';

export const FAVICON_PNGS = [['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['favicon-48x48.png', 48], ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192], ['android-chrome-512x512.png', 512]];
const ICO_SIZES = [16, 32, 48];
const HEX = /^#[0-9a-f]{6}$/i;

export function manifestJson({ name = '', color = '#ffffff' } = {}) {
  const c = HEX.test(color) ? color : '#ffffff';
  const icons = [192, 512].map((s) => ({ src: `/android-chrome-${s}x${s}.png`, sizes: `${s}x${s}`, type: 'image/png' }));
  return JSON.stringify({ name: name || 'My site', short_name: (name || 'My site').slice(0, 12), icons, theme_color: c, background_color: c, display: 'standalone' }, null, 2) + '\n'; // i18n-ignore: written into the manifest
}

export function headTags({ color = '#ffffff' } = {}) {
  return ['<link rel="icon" href="/favicon.ico" sizes="48x48">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${HEX.test(color) ? color : '#ffffff'}">`].join('\n') + '\n';
}

/** One square PNG of the picture. Apple fills transparency with black, so its icon gets the background colour always. */
async function squarePng(src, size, { background, padding, opaque }) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const fill = background && background !== 'transparent' ? background : opaque ? '#ffffff' : '';
  if (fill) { g.fillStyle = fill; g.fillRect(0, 0, size, size); }
  const inner = size * (1 - 2 * Math.min(0.3, Math.max(0, padding)));
  const k = Math.min(inner / src.w, inner / src.h), w = src.w * k, h = src.h * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src.source, (size - w) / 2, (size - h) / 2, w, h);
  return new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer());
}

export async function faviconZip(file, kind, { name = '', color = '#ffffff', background = 'transparent', padding = 0 } = {}) {
  const src = await decodeSource(file, kind);
  try {
    const pad = (Number(padding) || 0) / 100, entries = [], made = new Map();
    for (const [path, size] of FAVICON_PNGS) {
      const png = await squarePng(src, size, { background, padding: pad, opaque: path.startsWith('apple') });
      if (!path.startsWith('apple')) made.set(size, png);
      entries.push({ path, data: png });
    }
    const ico = encodeIcoImages(ICO_SIZES.map((s) => ({ png: made.get(s), width: s, height: s })));
    entries.unshift({ path: 'favicon.ico', data: ico });
    entries.push({ path: 'site.webmanifest', data: manifestJson({ name, color }) }, { path: 'head-tags.html', data: headTags({ color }) });
    return await writeZip(entries);
  } finally {
    src.close();
  }
}
