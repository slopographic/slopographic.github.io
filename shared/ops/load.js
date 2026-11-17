/* Helpers for the apps' headless operations (shared/ops/*.js): load an app's own classic scripts once, in order, from the
 * site root (through SlopLoad, shared/load/load.js, when the page has it), ask an app's first-use notice, and read and write
 * pictures. Nothing here runs at import time, so Node tests can import the operation modules.
 *   scripts(paths, ready?)         loads the site-root paths in order unless ready() is already true
 *   notice(app, opts)              SlopFirstRun.once (shared/firstrun/notice.js): resolves, or throws 'Cancelled'
 *   decode(blob)                   { canvas, w, h }: the picture upright (EXIF), on a canvas
 *   encode(canvas, kind, quality)  a Blob of that kind (png, jpg, webp, avif); falls back to PNG where the browser cannot
 *   kindOfBlob(blob)               the kind a written Blob really is; stem(name) the name without its extension
 *   pictureKind(kind)              the kind a picture keeps when written again (jpg stays jpg; bmp, gif, svg become png)
 *   abortable(signal)              throws an AbortError when the signal has fired */
import { t } from './i18n.js';

export const ROOT = new URL('../../', import.meta.url).href;
export const IMAGE_IN = ['png', 'jpg', 'webp', 'bmp', 'gif', 'avif'];
export const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' };

const loaded = new Map();
function one(rel) {
  const src = new URL(rel, ROOT).href;
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      if ([...document.scripts].some((s) => s.src === src)) { resolve(); return; }
      const s = Object.assign(document.createElement('script'), { src, async: false });
      s.onload = () => resolve();
      s.onerror = () => { loaded.delete(src); s.remove(); reject(new Error(`Could not load ${rel}`)); };
      document.head.append(s);
    }));
  }
  return loaded.get(src);
}

export async function scripts(paths, ready = null) {
  if (ready && ready()) return;
  if (globalThis.SlopLoad && globalThis.SlopLoad.scripts) { await globalThis.SlopLoad.scripts(paths); return; }
  for (const p of paths) await one(p);
}

export async function notice(app, opts) {
  const F = globalThis.SlopFirstRun;
  if (F && !(await F.once(app, opts))) throw new DOMException('Cancelled', 'AbortError');
}

export function abortable(signal) {
  if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

export async function decode(blob) {
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) {
    const url = URL.createObjectURL(blob), img = new Image();
    try { img.src = url; await img.decode(); bmp = img; } catch (x) { throw new Error(t('ui.ops.load.not_picture')); } finally { URL.revokeObjectURL(url); }
  }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  const c = canvas(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return { canvas: c, w, h };
}

export const pictureKind = (kind) => (MIME[kind] ? kind : 'png');

export function encode(c, kind, quality = 0.92) {
  const type = MIME[kind] || 'image/png';
  return new Promise((resolve, reject) => c.toBlob((b) => {
    if (b && b.type === type) resolve(b);
    else if (type !== 'image/png') encode(c, 'png').then(resolve, reject);
    else reject(new Error(t('ui.ops.load.not_written')));
  }, type, quality));
}

/** The kind of a written picture, from its MIME type (an encoder fallback makes PNG). */
export const kindOfBlob = (b) => Object.keys(MIME).find((k) => MIME[k] === (b && b.type)) || 'png';

export { stemOf as stem } from '../../convert/js/io/files.js';
