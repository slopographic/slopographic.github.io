/* SlopIsolate — the result on each queue tile: a small picture of the finished image with its own settings (edges,
 * brush edits, background, shadow, crop), redrawn in the background whenever they change, so a bulk change shows on
 * every selected picture and not only on the one on screen. No model run and no worker: it is drawn on the main thread
 * at tile size (at most 192 px) from the image's base mask with the same matte maths (CO.compose.alphaFn) and the same
 * compositor (CO.compose.render) as the full picture; feather and colour decontamination are left out at this size.
 * One picture at a time, newest settings win. CO.thumbs: of(it) → canvas or null, queue(it), render(it) → Promise. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, C = CO.compose;
  const T = CO.thumbs = {};
  const MAX = 192;
  const srcs = new Map(), made = new Map(), want = [];
  let busy = false;

  /** The small original and, per small pixel, its place in the full-size mask (made once per image). */
  async function source(it) {
    const had = srcs.get(it.id);
    if (had && had.file === it.file && had.W === it.w && had.H === it.h) return had;
    const k = Math.min(1, MAX / Math.max(it.w, it.h)), w = Math.max(1, Math.round(it.w * k)), h = Math.max(1, Math.round(it.h * k));
    const bmp = await createImageBitmap(it.file, { imageOrientation: 'from-image' });
    const c = U.canvas(w, h), g = U.ctx(c, { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const map = new Int32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(it.h - 1, Math.floor((y + 0.5) / k)) * it.w;
      for (let x = 0; x < w; x++) map[y * w + x] = fy + Math.min(it.w - 1, Math.floor((x + 0.5) / k));
    }
    const s = { file: it.file, W: it.w, H: it.h, w, h, k, canvas: c, rgba: g.getImageData(0, 0, w, h).data, map };
    srcs.set(it.id, s);
    return s;
  }
  const keyOf = (it) => JSON.stringify([it.s, it.bg, it.shadow, it.crop, it.hist ? it.hist.undo.length + ':' + it.hist.redo.length : 0]);
  const ok = (it) => !!it && it.kind !== 'video' && it.status === 'done' && !!it.base && it.w > 0 && !!S.get(it.id);

  /** Draw one image's result thumbnail now. */
  T.render = async function (it) {
    if (!ok(it)) return null;
    const key = keyOf(it), was = made.get(it.id);
    if (was && was.key === key && was.base === it.base) return was.canvas;
    const s = await source(it), n = s.w * s.h, alpha = C.alphaFn(it.s), base = it.base, ed = it.edit;
    const cut = new ImageData(new Uint8ClampedArray(s.rgba), s.w, s.h), d = cut.data, mask = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) { const j = s.map[i], a = alpha(base[j], ed ? ed[j] : 128); mask[i] = a; d[i * 4 + 3] = a; }
    const act = { w: s.w, h: s.h, cutout: cut, cut: null, mask, bbox: C.bbox(mask, s.w, s.h), bitmap: s.canvas };
    const k = s.k, look = {
      s: it.s, bg: Object.assign({}, it.bg, { blur: it.bg.blur * k }),
      shadow: Object.assign({}, it.shadow, { blur: it.shadow.blur * k, x: it.shadow.x * k, y: it.shadow.y * k }),
      crop: Object.assign({}, it.crop, { pad: it.crop.pad * k }),
    };
    const canvas = C.render(look, act);
    canvas.className = 'q-res';
    made.set(it.id, { key, base: it.base, canvas });
    CO.emit('thumb', it);
    return canvas;
  };
  T.of = (it) => { const m = it && made.get(it.id); return m ? m.canvas : null; };

  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (want.length) {
        const it = want.shift();
        try { await T.render(it); } catch (e) { console.warn('SlopIsolate: tile picture', e); }
        await new Promise((r) => setTimeout(r, 0));   // one picture per task: the page stays free
      }
    } finally { busy = false; }
  }
  /** Redraw an image's tile picture soon (in the background, after the pictures already waiting). */
  T.queue = function (it) {
    if (!ok(it) || want.includes(it)) return;
    want.push(it);
    setTimeout(pump, 16);
  };

  T.init = function () {
    CO.on('look', (it) => T.queue(it));
    CO.on('history', ({ it }) => T.queue(it));
    CO.on('item', (it) => T.queue(it));
    CO.on('list', (items) => {
      for (const id of [...made.keys()]) if (!S.get(id)) { made.delete(id); srcs.delete(id); }
      (items || S.items).forEach((it) => T.queue(it));
    });
  };
})();
