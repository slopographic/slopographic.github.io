/* Slop Font: an existing font file opened as a project, to edit (an OFL font, say): its names and licence, metrics,
 * every glyph that has a character (outlines in font units; TrueType quadratics become cubics exactly; composite glyphs
 * come in drawn) and its pair kerning (the 'kern' table and GPOS pair adjustments, formats 1 and 2). Glyphs with no
 * character (ligatures, alternates) are left out: this app writes no substitution features. Pure; opentype.js parses.
 *   fromBytes(bytes) → { project, skipped, note }   a .ttf, .otf or .woff (WOFF2: unpack it first, io/woff2.js)
 *   fromFont(otFont) → the same, from an opentype.Font */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else { const F = root.SlopFont; F.importer = factory(root.opentype, F.model, F.charset, F.paths); }
})(typeof window !== 'undefined' ? window : globalThis, function (OT, M, CS, P) {
  'use strict';
  const MAX_PAIRS = 20000;
  const name = (f, k) => { try { return (f.getEnglishName(k) || '').trim(); } catch (e) { return ''; } };

  function coverage(c) {
    if (!c) return [];
    if (c.format === 1) return c.glyphs || [];
    const out = [];
    for (const r of c.ranges || []) for (let g = r.start; g <= r.end; g++) out.push(g);
    return out;
  }
  function classOf(def, g) {
    if (!def) return 0;
    if (def.format === 1) { const i = g - def.startGlyph; return i >= 0 && i < (def.classes || []).length ? def.classes[i] : 0; }
    for (const r of def.ranges || []) if (g >= r.start && g <= r.end) return r.classId;
    return 0;
  }
  /** Pair kerning by glyph index: { 'left,right': value }, the kern table first, then GPOS (which wins). */
  function kerning(f, wanted) {
    const out = Object.assign({}, f.kerningPairs || {});
    const gpos = f.tables && f.tables.gpos;
    if (!gpos || !gpos.lookups) return out;
    let n = Object.keys(out).length;
    for (const l of gpos.lookups) {
      const subs = l.lookupType === 2 ? l.subtables : l.lookupType === 9 ? (l.subtables || []).filter((s) => s.lookupType === 2).map((s) => s.extension) : [];
      for (const s of subs || []) {
        if (!s) continue;
        const firsts = coverage(s.coverage).filter((g) => wanted.has(g));
        if (s.posFormat === 1) {
          coverage(s.coverage).forEach((g, i) => {
            if (!wanted.has(g)) return;
            for (const pv of (s.pairSets || [])[i] || []) {
              const v = pv.value1 && pv.value1.xAdvance;
              if (v && wanted.has(pv.secondGlyph) && n < MAX_PAIRS && out[g + ',' + pv.secondGlyph] == null) { out[g + ',' + pv.secondGlyph] = v; n++; }
            }
          });
        } else if (s.posFormat === 2) {
          const seconds = [...wanted];
          for (const g of firsts) {
            const rec = (s.classRecords || [])[classOf(s.classDef1, g)];
            if (!rec) continue;
            for (const h of seconds) {
              const r = rec[classOf(s.classDef2, h)], v = r && r.value1 && r.value1.xAdvance;
              if (v && n < MAX_PAIRS && out[g + ',' + h] == null) { out[g + ',' + h] = v; n++; }
            }
          }
        }
      }
    }
    return out;
  }
  function fromFont(f) {
    const os2 = (f.tables && f.tables.os2) || {}, hhea = (f.tables && f.tables.hhea) || {}, post = (f.tables && f.tables.post) || {};
    const p = M.create({
      info: { family: name(f, 'preferredFamily') || name(f, 'fontFamily'), style: name(f, 'preferredSubfamily') || name(f, 'fontSubfamily'),
        designer: name(f, 'designer'), designerURL: name(f, 'designerURL'), manufacturer: name(f, 'manufacturer'), copyright: name(f, 'copyright'),
        license: name(f, 'license'), licenseURL: name(f, 'licenseURL'), version: name(f, 'version').replace(/^Version\s*/i, '').split(';')[0] || '1.000',
        description: name(f, 'description'), weight: os2.usWeightClass || 400 },
      metrics: { upm: f.unitsPerEm, ascender: f.ascender, descender: f.descender, capHeight: os2.sCapHeight, xHeight: os2.sxHeight,
        lineGap: hhea.lineGap || os2.sTypoLineGap || 0, italicAngle: post.italicAngle || 0 },
    });
    p.glyphs = [];
    const byIndex = new Map();
    let skipped = 0;
    for (let i = 0; i < f.numGlyphs; i++) {
      const gl = f.glyphs.get(i);
      const cps = (gl.unicodes && gl.unicodes.length ? gl.unicodes : gl.unicode != null ? [gl.unicode] : []).filter((c) => c >= 0x20);
      if (i > 0 && !cps.length) { skipped++; continue; }
      let contours = [];
      try { contours = P.fromCommands(gl.path ? gl.path.commands : []); } catch (e) { contours = []; }
      const adv = Math.round(gl.advanceWidth || 0);
      if (i === 0) { p.glyphs.push({ id: '.notdef', name: '.notdef', unicode: null, advance: adv, contours }); byIndex.set(0, '.notdef'); continue; }
      for (const cp of cps) {
        if (p.glyphs.length >= M.MAX_GLYPHS) { skipped++; continue; }
        if (p.glyphs.some((g) => g.unicode === cp)) continue;
        p.glyphs.push({ id: CS.idOf(cp), name: CS.nameOf(cp), unicode: cp, advance: adv, contours: contours.map((c) => ({ closed: c.closed, pts: c.pts.map((q) => Object.assign({}, q)) })) });
        if (!byIndex.has(i)) byIndex.set(i, CS.idOf(cp));
      }
    }
    for (const [k, v] of Object.entries(kerning(f, new Set(byIndex.keys())))) {
      const [a, b] = k.split(',').map(Number);
      if (byIndex.has(a) && byIndex.has(b) && v) p.kerning[byIndex.get(a) + ' ' + byIndex.get(b)] = v;
    }
    M.sort(p);
    const cap = M.find(p, 'H'), x = M.find(p, 'x');
    if (!p.metrics.capHeight && cap) { const b = P.bbox(cap.contours); if (b) p.metrics.capHeight = Math.round(b.y + b.h); }
    if (!p.metrics.xHeight && x) { const b = P.bbox(x.contours); if (b) p.metrics.xHeight = Math.round(b.y + b.h); }
    const clean = M.clean(p);
    return { project: clean, skipped, note: skipped ? `${skipped} glyph${skipped === 1 ? '' : 's'} with no character (ligatures, alternates) left out` : '' };
  }
  function fromBytes(bytes) {
    if (!OT) throw new Error('The font library is not loaded');
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let f;
    try { f = OT.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); } catch (e) { throw new Error('This font file could not be read: ' + e.message); }
    return fromFont(f);
  }
  return { fromBytes, fromFont, kerning };
});
