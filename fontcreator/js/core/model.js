/* Slop Font: the font project, the one model every part of the app and every export reads. Pure, no DOM. Needs the
 * charset and paths modules (in Node, pass them). A project is plain JSON (it is the saved .sfont file):
 *   { format: 'slop-font', version: 1,
 *     info:    { family, style, designer, designerURL, manufacturer, copyright, license, licenseURL, version, description, weight },
 *     metrics: { upm, ascender, descender, capHeight, xHeight, lineGap, italicAngle },
 *     glyphs:  [{ id, name, unicode, advance, contours }]   .notdef first, then by code point, unencoded glyphs last
 *     kerning: { 'u0041 u0056': -80 } }                    a pair of glyph ids → an adjustment in font units
 *   create(opts) → project        a new font: .notdef and space, the given family, style and metrics
 *   clean(obj) → project          a project read from a file or sent by the assistant, checked and completed (throws)
 *   find(p, idOrChar) → glyph     by id ('u0041'), by name ('A') or by the character itself ('A')
 *   ensure(p, cp) → glyph         the glyph for a code point, added (empty, the default width) when missing
 *   add(p, { unicode?, name? })   remove(p, id)   setOutline(p, id, contours)   sort(p)
 *   sides(g) → { lsb, rsb, advance, box }   setSides(g, { lsb?, rsb?, advance? })   (side bearings move the outline)
 *   kern(p, a, b) → n   setKern(p, a, b, n)   pairs(p) → [[a, b, n]]   (a, b: glyph ids)
 *   subset(p, cps) → p            only those characters (and .notdef) kept, kerning of removed glyphs dropped
 *   stats(p) → { glyphs, drawn (not counting .notdef), empty, pairs }   METRICS (defaults for 1000 units per em) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else { const F = root.SlopFont; F.model = factory(F.charset, F.paths); }
})(typeof window !== 'undefined' ? window : globalThis, function (CS, P) {
  'use strict';
  const METRICS = Object.freeze({ upm: 1000, ascender: 800, descender: -200, capHeight: 700, xHeight: 500, lineGap: 0, italicAngle: 0 });
  const INFO = Object.freeze({ family: 'My Font', style: 'Regular', designer: '', designerURL: '', manufacturer: '', copyright: '', license: '',
    licenseURL: '', version: '1.000', description: '', weight: 400 });
  const MAX_GLYPHS = 3000;
  const str = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  const int = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  function notdef(m) {
    const w = Math.round(m.upm * 0.5), t = Math.round(m.upm * 0.05), h = m.capHeight;
    const outer = P.rect(t, 0, w - 2 * t, h), inner = P.reverse(P.rect(2 * t, t, w - 4 * t, h - 2 * t));
    return { id: '.notdef', name: '.notdef', unicode: null, advance: w, contours: [...outer, ...inner] };
  }
  const blank = (p, cp) => ({ id: CS.idOf(cp), name: CS.nameOf(cp), unicode: cp, advance: Math.round(p.metrics.upm * (cp === 0x20 || cp === 0xa0 ? 0.25 : 0.6)), contours: [] });

  function cleanMetrics(m = {}) {
    const upm = int(m.upm, 16, 16384, 1000), k = upm / 1000, d = (key) => Math.round(METRICS[key] * k);
    return { upm, ascender: int(m.ascender, 1, upm * 4, d('ascender')), descender: int(m.descender, -upm * 4, 0, d('descender')),
      capHeight: int(m.capHeight, 0, upm * 4, d('capHeight')), xHeight: int(m.xHeight, 0, upm * 4, d('xHeight')),
      lineGap: int(m.lineGap, 0, upm * 4, 0), italicAngle: Math.max(-60, Math.min(60, Number(m.italicAngle) || 0)) };
  }
  function cleanInfo(i = {}) {
    const out = {};
    for (const k of Object.keys(INFO)) out[k] = k === 'weight' ? int(i.weight, 100, 900, 400) : str(i[k] == null ? INFO[k] : i[k], k === 'license' || k === 'description' ? 4000 : 200);
    out.family = out.family.trim() || INFO.family;
    out.style = out.style.trim() || INFO.style;
    return out;
  }
  function create(opts = {}) {
    const p = { format: 'slop-font', version: 1, info: cleanInfo(opts.info || opts), metrics: cleanMetrics(opts.metrics || opts), glyphs: [], kerning: {} };
    p.glyphs.push(notdef(p.metrics), blank(p, 0x20));
    return p;
  }
  function cleanGlyph(g, p) {
    const unicode = g.unicode == null || g.unicode === '' ? null : int(g.unicode, 0, 0x10ffff, null);
    const id = unicode != null ? CS.idOf(unicode) : (g.id === '.notdef' || g.name === '.notdef' ? '.notdef' : str(g.id || g.name || '', 60).replace(/[^\w.-]/g, '') || null);
    if (!id) throw new Error('A glyph needs a unicode code point or a name');
    return { id, name: unicode != null ? CS.nameOf(unicode) : (id === '.notdef' ? '.notdef' : str(g.name || id, 60).replace(/[^\w.-]/g, '') || id),
      unicode, advance: int(g.advance, 0, p.metrics.upm * 10, Math.round(p.metrics.upm * 0.6)), contours: P.clean(g.contours || []) };
  }
  function clean(obj) {
    if (!obj || typeof obj !== 'object' || obj.format !== 'slop-font') throw new Error('This is not a font project (.sfont)');
    const p = { format: 'slop-font', version: 1, info: cleanInfo(obj.info), metrics: cleanMetrics(obj.metrics), glyphs: [], kerning: {} };
    const seen = new Set();
    for (const g of (Array.isArray(obj.glyphs) ? obj.glyphs : []).slice(0, MAX_GLYPHS)) {
      const c = cleanGlyph(g, p);
      if (!seen.has(c.id)) { seen.add(c.id); p.glyphs.push(c); }
    }
    if (!seen.has('.notdef')) p.glyphs.unshift(notdef(p.metrics));
    for (const [k, v] of Object.entries(obj.kerning || {})) {
      const [a, b] = k.split(' ');
      if (seen.has(a) && seen.has(b) && Number(v)) p.kerning[a + ' ' + b] = int(v, -p.metrics.upm, p.metrics.upm, 0);
    }
    return sort(p);
  }
  const rank = (g) => (g.id === '.notdef' ? -1 : g.unicode == null ? 0x110000 : g.unicode);
  function sort(p) { p.glyphs.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1)); return p; }
  function find(p, key) {
    if (key == null) return null;
    const k = String(key);
    let g = p.glyphs.find((x) => x.id === k) || p.glyphs.find((x) => x.name === k);
    if (!g && [...k].length === 1) g = p.glyphs.find((x) => x.unicode === k.codePointAt(0));
    if (!g && /^U\+[0-9A-F]{4,6}$/i.test(k)) g = p.glyphs.find((x) => x.unicode === parseInt(k.slice(2), 16));
    return g || null;
  }
  function ensure(p, cp) {
    let g = p.glyphs.find((x) => x.unicode === cp);
    if (g) return g;
    if (p.glyphs.length >= MAX_GLYPHS) throw new Error(`A font here holds at most ${MAX_GLYPHS} glyphs`);
    g = blank(p, cp);
    p.glyphs.push(g); sort(p);
    return g;
  }
  function add(p, spec) {
    if (spec.unicode != null) return ensure(p, int(spec.unicode, 0, 0x10ffff, 0));
    const g = cleanGlyph({ name: spec.name, advance: spec.advance, contours: spec.contours }, p);
    if (find(p, g.id)) throw new Error(`There is already a glyph “${g.id}”`);
    p.glyphs.push(g); sort(p);
    return g;
  }
  function remove(p, id) {
    if (id === '.notdef') throw new Error('.notdef stays: every font needs it');
    const i = p.glyphs.findIndex((g) => g.id === id);
    if (i < 0) return false;
    p.glyphs.splice(i, 1);
    for (const k of Object.keys(p.kerning)) if (k.split(' ').includes(id)) delete p.kerning[k];
    return true;
  }
  function setOutline(p, id, contours) {
    const g = find(p, id);
    if (!g) throw new Error(`No glyph “${id}”`);
    g.contours = P.clean(contours);
    return g;
  }
  function sides(g) {
    const box = P.bbox(g.contours);
    if (!box) return { lsb: 0, rsb: g.advance, advance: g.advance, box: null };
    return { lsb: Math.round(box.x), rsb: Math.round(g.advance - box.x - box.w), advance: g.advance, box };
  }
  function setSides(g, s) {
    const cur = sides(g);
    if (s.advance != null) g.advance = int(s.advance, 0, 1e5, g.advance);
    if (s.lsb != null && cur.box) {
      const dx = Math.round(Number(s.lsb)) - cur.lsb;
      g.contours = P.move(g.contours, dx, 0);
      if (s.rsb == null && s.advance == null) g.advance += dx;   // the right side bearing stays
    }
    if (s.rsb != null) { const b = sides(g); g.advance = Math.max(0, Math.round((b.box ? b.box.x + b.box.w : 0) + Number(s.rsb))); }
    return sides(g);
  }
  const kern = (p, a, b) => p.kerning[a + ' ' + b] || 0;
  function setKern(p, a, b, n) {
    if (!find(p, a) || !find(p, b)) throw new Error('Both glyphs of a kerning pair must be in the font');
    const k = find(p, a).id + ' ' + find(p, b).id, v = int(n, -p.metrics.upm, p.metrics.upm, 0);
    if (v) p.kerning[k] = v; else delete p.kerning[k];
    return v;
  }
  const pairs = (p) => Object.entries(p.kerning).map(([k, v]) => [...k.split(' '), v]);
  function subset(p, cps) {
    const keep = new Set(cps);
    p.glyphs = p.glyphs.filter((g) => g.id === '.notdef' || (g.unicode != null && keep.has(g.unicode)));
    const ids = new Set(p.glyphs.map((g) => g.id));
    for (const k of Object.keys(p.kerning)) if (!k.split(' ').every((x) => ids.has(x))) delete p.kerning[k];
    return p;
  }
  function stats(p) {
    const drawn = p.glyphs.filter((g) => g.contours.length && g.id !== '.notdef').length;   // .notdef is drawn for you
    return { glyphs: p.glyphs.length, drawn, empty: p.glyphs.filter((g) => !g.contours.length).length, pairs: Object.keys(p.kerning).length };
  }
  return { METRICS, INFO, MAX_GLYPHS, create, clean, cleanInfo, cleanMetrics, find, ensure, add, remove, setOutline, sort, sides, setSides, kern, setKern, pairs, subset, stats };
});
