/* The app globe's name labels (home/globe/globe.js calls it every frame): without hovering, a few of the icons facing you
 * (closest to the viewer and near the centre) carry their app's name; while the finder is searching, the matches on the
 * near side do (as many as fit), marked with the accent. Labels never overlap one another, the copy, or a hovered icon's
 * own name chip, and stay inside the hero with a margin at its sides (EDGE). Fewer and smaller at phone width.
 * Pure part (unit-tested in tests/node/globe-labels.test.mjs; module.exports under Node):
 *   limit(searching, narrow) -> how many labels at most
 *   boxFor(c, o) -> { l, t, w, h }      where c's label goes (under the icon, kept inside the hero); the width is estimated
 *                                       from the text (a monospace font), so no label is ever measured
 *   pick(cands, o) -> [{ id, l, t, w, h }]   the labels to show, best first
 *     cands: [{ id, text, x, y, z, half, op, match }] (half: the icon's drawn half size; op: its opacity)
 *     o: { W, H, cx, cy, r, max, searching, narrow, prev (Set of ids shown last time: they hold on a little longer),
 *          block ([{ l, t, w, h }] already taken), rects ([{ l, t, r, b }] the copy) }
 * Browser part: SlopGlobeLabels.pool(layer) -> { update(icons, f), shown() }: a small pool of <span class="gx-tag"> inside the
 * globe's aria-hidden, data-live layer (decorative: the keyboard list in .gx-nav is what screen readers read). Each frame
 * moves them with a transform only; the text changes only when a label takes another app; the fade is a CSS transition
 * on a class (none under reduced motion). Classic script, before globe.js. */
(function () {
  'use strict';
  const LIMITS = { idle: [5, 3], search: [12, 6] };   // [wide, narrow]
  const GAP = 6, PAD = 6, FADE = 260, NARROW_MAX = 180;   // px: a long name is cut short at phone width (globe.css)
  const EDGE = [16, 10];   // px [wide, narrow]: a label keeps this far inside the hero's left and right edges
  const limit = (searching, narrow) => LIMITS[searching ? 'search' : 'idle'][narrow ? 1 : 0];
  const font = (narrow) => (narrow ? 10 : 11);

  function boxFor(c, o) {
    // uppercase monospace: about 0.6em a character plus the 0.08em letter spacing (globe.css), a little over, plus padding
    const f = font(o.narrow), est = Math.ceil(String(c.text || '').length * f * 0.72 + (o.narrow ? 14 : 18));
    const w = o.narrow ? Math.min(NARROW_MAX, est) : est, h = Math.ceil(f * 1.2 + (o.narrow ? 8 : 10));
    let l = c.x - w / 2;
    const e = EDGE[o.narrow ? 1 : 0];
    if (o.W) l = Math.max(e, Math.min(o.W - e - w, l));
    return { l, t: c.y + c.half + GAP, w, h };
  }
  const overlap = (a, b, pad = PAD) => a.l < b.l + b.w + pad && b.l < a.l + a.w + pad && a.t < b.t + b.h + pad && b.t < a.t + a.h + pad;
  const overRect = (a, r) => a.l < r.r + PAD && r.l < a.l + a.w + PAD && a.t < r.b + PAD && r.t < a.t + a.h + PAD;

  function pick(cands, o) {
    const prev = o.prev || new Set(), r = o.r || 1;
    const ok = (c) => {
      const held = prev.has(c.id);
      if (o.searching) return c.match && c.z > (held ? -0.15 : -0.05) && c.op > 0.3;
      const off = Math.hypot(c.x - o.cx, c.y - o.cy) / r;
      return c.z > (held ? 0.4 : 0.5) && c.op > (held ? 0.5 : 0.6) && off < (held ? 0.8 : 0.72);
    };
    const score = (c) => (o.searching ? c.z : c.z - 0.6 * (Math.hypot(c.x - o.cx, c.y - o.cy) / r)) + (prev.has(c.id) ? 0.12 : 0);
    const list = cands.filter(ok).map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s);
    const out = [], taken = (o.block || []).slice();
    for (const { c } of list) {
      if (out.length >= (o.max || 0)) break;
      const b = boxFor(c, o);
      if (o.H && (b.t < 0 || b.t + b.h > o.H)) continue;
      if ((o.rects || []).some((q) => overRect(b, q)) || taken.some((q) => overlap(b, q))) continue;
      taken.push(b);
      out.push({ id: c.id, ...b });
    }
    return out;
  }

  function pool(layer) {
    const tags = [];
    let narrow = null, prev = new Set();
    const text = (ic) => ic.el.getAttribute('aria-label') || '';   // the icon's name (globe.js renames it in a new language)
    function tag() {
      const el = document.createElement('span');
      el.className = 'gx-tag';
      layer.append(el);
      const t = { el, id: null, on: false, until: 0, l: 0, t: 0 };
      tags.push(t);
      return t;
    }
    /** f: { W, H, rects, geom, match (Set of ids or null), still } */
    function update(icons, f) {
      const nw = f.W < 600, now = performance.now(), searching = !!f.match;
      if (nw !== narrow) { narrow = nw; layer.classList.toggle('gx-narrow', nw); }
      const o = { W: f.W, H: f.H, cx: f.geom.cx, cy: f.geom.cy, r: f.geom.r, searching, narrow, prev, rects: f.rects, max: limit(searching, narrow), block: [] };
      const cands = [], byId = new Map();
      for (const ic of icons) {
        const c = { id: ic.app.id, text: text(ic), x: ic.x, y: ic.y, z: ic.z, half: ic.half || 0, op: ic.op, match: searching && f.match.has(ic.app.id) };
        byId.set(c.id, c);
        // a hovered or single-match icon shows its own name chip (globe.css .gx-name): keep clear of it
        if (ic.el.classList.contains('is-hot') || ic.el.classList.contains('is-pick')) o.block.push(boxFor(c, o)); else cands.push(c);
      }
      const picks = pick(cands, o), want = new Map(picks.map((p) => [p.id, p]));
      for (const t of tags) if (t.on && !want.has(t.id)) { t.on = false; t.until = now + (f.still ? 0 : FADE); t.el.classList.remove('is-on'); }
      for (const p of picks) {
        let t = tags.find((x) => x.id === p.id) || tags.find((x) => !x.on && now >= x.until) || (tags.length < o.max + 4 ? tag() : null);
        if (!t) continue;
        if (t.id !== p.id || t.el.textContent !== byId.get(p.id).text) { t.id = p.id; t.el.textContent = byId.get(p.id).text; }
        if (!t.on) { t.on = true; t.el.classList.add('is-on'); }
        t.el.classList.toggle('is-match', searching);
      }
      for (const t of tags) {
        if (!t.id) continue;
        const c = byId.get(t.id), b = want.get(t.id) || (c && boxFor(c, o));   // a fading label follows its icon away
        if (b) { t.l = b.l; t.t = b.t; }
        t.el.style.transform = `translate3d(${t.l.toFixed(1)}px,${t.t.toFixed(1)}px,0)`;
        if (!t.on && now >= t.until) t.id = null;
      }
      prev = new Set(want.keys());
    }
    const shown = () => tags.filter((t) => t.on).map((t) => ({ id: t.id, text: t.el.textContent, el: t.el }));
    return { update, shown };
  }

  const M = { limit, boxFor, pick, overlap, LIMITS, NARROW_MAX, EDGE };
  if (typeof window !== 'undefined') window.SlopGlobeLabels = { ...M, pool };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})();
