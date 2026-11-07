/* Slop Colors' headless operation, for Slop Workflows and every app's AI panel (registry: shared/ops/registry.js):
 *   colors.palette   a picture in, its main colours out as a palette file: Slop Colors' own seeded k-means
 *                    (colors/js/core/kmeans.js, on a copy at most 400 px wide, as the app does) and its writers
 *                    (colors/js/core/formats.js: CSS variables, Tailwind config, JSON, GIMP .gpl; colors/js/core/ase.js: .ase).
 *                    The palette is named after the picture; the same picture gives the same colours every time. */
import { register } from './registry.js';
import { scripts, stem, decode, IMAGE_IN } from './load.js';
import { t, opt } from './i18n.js';

const g = globalThis;
const FILES = ['shared/color/model.js', 'shared/color/contrast.js', 'colors/js/core/convert.js', 'colors/js/core/kmeans.js', 'colors/js/core/formats.js', 'colors/js/core/ase.js'];
const KIND = { css: 'css', tailwind: 'js', json: 'json', gpl: 'gpl', ase: 'ase' };
const SMALL = 400;

/** The palette of a decoded picture (a canvas): { name, colors: [{ hex }] }. */
export function paletteOf(canvas, name, k) {
  const f = Math.min(1, SMALL / Math.max(canvas.width, canvas.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * f)); c.height = Math.max(1, Math.round(canvas.height * f));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, c.width, c.height);
  const d = g.SlopColors.kmeans.dominant(x.getImageData(0, 0, c.width, c.height).data, { k, seed: 1 });
  return { name, colors: d.map((e) => ({ hex: e.hex })) };
}

async function palette(files, o) {
  await scripts(FILES, () => !!(g.SlopColors && g.SlopColors.ase && g.SlopColors.formats && g.SlopColors.kmeans));
  const f = files[0], X = g.SlopColors, F = X.formats, fmt = KIND[o.format] ? o.format : 'json';
  const { canvas } = await decode(f.file);
  const p = paletteOf(canvas, stem(f.name), Math.max(2, Math.min(12, Math.round(Number(o.count) || 6))));
  if (!p.colors.length) throw new Error(t('ui.ops.colors.no_pixels', { name: f.name }));
  const meta = F.FORMATS.find((x) => x.id === fmt), base = F.slug(p.name) || 'palette';
  const body = fmt === 'ase' ? X.ase.write(p) : fmt === 'css' ? F.toCss(p) : fmt === 'tailwind' ? F.toTailwind(p) : fmt === 'gpl' ? F.toGpl(p) : F.toJson(p);
  const out = [{ name: fmt === 'tailwind' ? `${base}.tailwind.js` : `${base}.${meta.ext}`, blob: new Blob([body], { type: meta.mime }), kind: KIND[fmt] }];
  out.info = `${f.name}: ${p.colors.map((c) => c.hex).join(', ')}.`;
  return out;
}

export const COLORS_OPS = register([
  { id: 'colors.palette', group: 'Pictures', from: IMAGE_IN, mode: 'each', out: (k, o = {}) => KIND[o.format] || 'json',   // i18n-ignore: a group id (search words), an app name
    keywords: ['palette', 'colours', 'colors', 'dominant colors', 'swatches', 'ase', 'gpl', 'tailwind', 'css variables'],
    options: [
      opt('ui.ops.colors.count', { key: 'count', type: 'number', min: 2, max: 12, value: 6 }),
      opt('ui.ops.colors.format', { key: 'format', type: 'select', value: 'json', options: [['json', 'JSON'], 'css', 'tailwind', 'ase', 'gpl'] }),
    ], run: palette },
], { app: 'colors', label: 'Slop Colors' });   // i18n-ignore: a group id (search words), an app name
