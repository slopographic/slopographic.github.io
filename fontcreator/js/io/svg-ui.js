/* Slop Font: "Draw from SVG": a glyph drawn in another program (SlopVector, Illustrator, Inkscape, Figma) brought in as
 * its outline. Paste the SVG (or only its path data) in the box, or drop or choose an .svg file; every path, rectangle,
 * circle, ellipse, polygon and polyline is read with its transforms (the SVG is cleaned by shared/sanitize first and
 * measured in a hidden box). Placed by: the cap height or the x-height (the drawing's own box scaled to it, on the
 * baseline), the SVG's box as the em square, or the numbers as font units. Classic script.
 *   FC.svgUi.open(text?, name?)   the dialog          read(text) → { d, box }   (d in the SVG's own units, y down)
 *   apply({ text, fit: cap | x | em | font, add }) → contour count (one undo step) */
(function (g) {
  'use strict';
  const S = () => g.FC.state, P = () => g.SlopFont.paths, t = (k, v) => g.FC.t(k, v);
  const NS = 'http://www.w3.org/2000/svg';
  const n2 = (v) => Math.round(v * 1000) / 1000;
  function shapeD(e) {
    const a = (k) => parseFloat(e.getAttribute(k)) || 0, tag = e.localName;
    if (tag === 'path') return e.getAttribute('d') || '';
    if (tag === 'rect') {
      const x = a('x'), y = a('y'), w = a('width'), h = a('height'), rx = Math.min(w / 2, a('rx') || a('ry')), ry = Math.min(h / 2, a('ry') || a('rx'));
      if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    if (tag === 'circle' || tag === 'ellipse') {
      const cx = a('cx'), cy = a('cy'), rx = tag === 'circle' ? a('r') : a('rx'), ry = tag === 'circle' ? a('r') : a('ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    if (tag === 'polygon' || tag === 'polyline') { const pts = (e.getAttribute('points') || '').trim(); return pts ? 'M' + pts.replace(/^([^\s,]+[\s,]+[^\s,]+)/, '$1L') + 'Z' : ''; }
    return '';
  }
  /** Path data of every shape of an SVG document, in its viewBox's units, and that box. */
  function read(text) {
    const src = String(text || '').trim();
    if (!src) throw new Error(t('fontcreator.svg.paste_first'));
    if (!src.startsWith('<')) return { d: src, box: null };
    const clean = g.SlopSanitize ? g.SlopSanitize.svg(src) : '';
    if (!clean) throw new Error(t('fontcreator.svg.unreadable'));
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden';
    host.innerHTML = clean;
    document.body.append(host);
    try {
      const svg = host.querySelector('svg');
      if (!svg) throw new Error(t('fontcreator.svg.no_svg'));
      const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
      const box = vb ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height } : { x: 0, y: 0, w: parseFloat(svg.getAttribute('width')) || 1000, h: parseFloat(svg.getAttribute('height')) || 1000 };
      svg.setAttribute('width', box.w); svg.setAttribute('height', box.h);
      const root = svg.getScreenCTM(), out = [];
      for (const e of svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline')) {
        if (e.closest('defs, clipPath, mask, symbol, pattern')) continue;
        const d = shapeD(e);
        if (!d) continue;
        let subs;
        try { subs = g.SVGeom.parseD(d); } catch (err) { continue; }
        const m = root && e.getScreenCTM() ? root.inverse().multiply(e.getScreenCTM()) : null;
        const mat = m ? [m.a, m.b, m.c, m.d, m.e + box.x, m.f + box.y] : [1, 0, 0, 1, 0, 0];
        out.push(g.SVGeom.toD(g.SVGeom.transformSubs(subs, mat)));
      }
      if (!out.length) throw new Error(t('fontcreator.svg.no_shapes'));
      return { d: out.join(' '), box };
    } finally { host.remove(); }
  }
  function contoursOf(text, fit) {
    const m = S().project().metrics, r = read(text);
    if (fit === 'font') return { contours: P().fromSvg(r.d, { coords: 'font' }) };
    if (fit === 'em') {
      const box = r.box || g.SVGeom.subsBBox(g.SVGeom.parseD(r.d)), s = (m.ascender - m.descender) / (box.h || 1);
      const raw = P().fromSvg(r.d, { coords: 'font' });
      return { contours: P().transform(raw, [s, 0, 0, -s, -box.x * s, m.ascender + box.y * s]), advance: Math.round(box.w * s) };
    }
    return { contours: P().fromSvg(r.d, { coords: 'fit', height: fit === 'x' ? m.xHeight : m.capHeight, left: 50 }) };
  }
  function apply(o) {
    const r = contoursOf(o.text, o.fit || 'cap');
    if (!r.contours.length) throw new Error(t('fontcreator.svg.no_outline'));
    S().edit(t('fontcreator.svg.title'), 'glyph', (p, gl) => {
      gl.contours = o.add ? gl.contours.concat(r.contours) : r.contours;
      if (r.advance != null && !o.add) gl.advance = r.advance;
      else if (!o.add) { const b = P().bbox(gl.contours); if (b) gl.advance = Math.round(b.x + b.w + 50); }
    });
    return r.contours.length;
  }
  let partId = null;
  function open(text, name) {
    const U = g.SlopUI, el = U.el;
    const ta = el('textarea', { class: 'sui-input fc-svg-text', id: 'fc-svg-text', rows: 7, placeholder: t('fontcreator.svg.placeholder', { svg: '<svg viewBox="0 0 100 100"><path d="M10 90 L50 10 L90 90 Z"/></svg>', d: 'M10 90 L50 10 L90 90 Z' }), spellcheck: 'false' });
    ta.value = text || '';
    const fit = el('select', { class: 'sui-input', id: 'fc-svg-fit' });
    for (const v of ['cap', 'x', 'em', 'font']) fit.append(el('option', { value: v }, t(`fontcreator.svg.fit_${v}`)));
    if (S().view().unicode != null && /\p{Ll}/u.test(String.fromCodePoint(S().view().unicode))) fit.value = 'x';
    const add = el('input', { type: 'checkbox', id: 'fc-svg-add' });
    if (!partId) partId = g.SlopIntake.part({ id: 'fontcreator.svg', accept: { types: ['image/svg+xml'], exts: ['.svg'], noun: 'fontcreator.svg.noun' }, process: async (f) => { ta.value = await f.text(); return f.name; } });
    const choose = el('button', { type: 'button', class: 'sui-btn', id: 'fc-svg-choose' }, t('fontcreator.svg.choose'));
    choose.addEventListener('click', () => g.SlopIntake.pick({ to: partId, accept: '.svg,image/svg+xml' }));
    const body = el('div', { class: 'fc-dlg' }, el('p', { class: 'sui-p' }, t('fontcreator.svg.intro', { glyph: S().view().name + (name ? ': ' + name : '') })), ta, choose,
      U.field(t('fontcreator.svg.place'), fit), el('label', { class: 'fc-check' }, add, ' ' + t('fontcreator.svg.add')));
    U.dialog({ title: t('fontcreator.svg.title'), body, cls: 'fc-dialog', buttons: [{ label: t('menu.cancel') }, { label: t('fontcreator.svg.draw'), primary: true, act: () => {
      try { const n = apply({ text: ta.value, fit: fit.value, add: add.checked }); U.toast(t('fontcreator.svg.drew', { n })); } catch (e) { U.toast(e.message); return false; }
    } }] });
  }
  g.FC.svgUi = { open, read, apply, contoursOf, n2, NS };
})(window);
