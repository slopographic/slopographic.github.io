/* Slop Font: a project (core/model.js) made into font files. opentype.js (vendor/opentype) writes the OpenType font with
 * CFF outlines and the shared tables (head, hhea, OS/2, name, cmap, post, hmtx); this module adds the kerning ('kern'
 * table) and, for a .ttf, swaps the CFF outlines for TrueType ones (core/ttf.js). Pure; in Node pass opentype and the
 * modules, in a page they are read from window.
 *   font(p) → opentype.Font      the font object (also what the preview and the tests read)
 *   otf(p) → Uint8Array          OpenType, CFF outlines (.otf)
 *   ttf(p) → Uint8Array          TrueType outlines (.ttf)
 *   woff(p, deflate) → Promise<Uint8Array>   WOFF 1.0 around the TrueType font
 *   css(p, files) → text         an @font-face rule for the files made ({ woff2?, woff?, ttf?, otf? } → file names)
 *   fileBase(p) → 'MyFont-Regular'   postScriptName(p) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else { const F = root.SlopFont; F.build = factory(root.opentype, F.model, F.paths, F.sfnt, F.ttf); }
})(typeof window !== 'undefined' ? window : globalThis, function (OT, M, P, S, T) {
  'use strict';
  const ascii = (s) => String(s || '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
  const postScriptName = (p) => (ascii(p.info.family).replace(/[^A-Za-z0-9]/g, '') || 'Font') + '-' + (ascii(p.info.style).replace(/[^A-Za-z0-9]/g, '') || 'Regular');
  const fileBase = (p) => postScriptName(p).slice(0, 63);
  const STYLE_BITS = { italic: 1, bold: 32, regular: 64 };

  function font(p) {
    if (!OT) throw new Error('The font library is not loaded');
    const m = p.metrics, i = p.info;
    const glyphs = p.glyphs.map((g) => {
      const path = new OT.Path();
      path.commands = P.toCommands(P.orient(g.contours));   // CFF: outer contours counter-clockwise
      const o = { name: g.name, advanceWidth: Math.max(0, Math.round(g.advance)), path };
      if (g.unicode != null) o.unicode = g.unicode;
      return new OT.Glyph(o);
    });
    const style = i.style.toLowerCase();
    const fs = (/italic|oblique/.test(style) ? STYLE_BITS.italic : 0) | (/bold/.test(style) ? STYLE_BITS.bold : 0) || STYLE_BITS.regular;
    const f = new OT.Font({
      familyName: i.family, styleName: i.style, unitsPerEm: m.upm, ascender: m.ascender, descender: m.descender,
      designer: i.designer, designerURL: i.designerURL, manufacturer: i.manufacturer, license: i.license, licenseURL: i.licenseURL,
      version: 'Version ' + (i.version || '1.000'), description: i.description, copyright: i.copyright, postScriptName: postScriptName(p),
      fullName: i.family + ' ' + i.style, weightClass: i.weight, italicAngle: m.italicAngle, fsSelection: fs, glyphs,
      tables: { os2: { sxHeight: m.xHeight, sCapHeight: m.capHeight, sTypoLineGap: m.lineGap, achVendID: 'NONE', usWeightClass: i.weight } },
    });
    return f;
  }
  /** The kern table for the project, by glyph index (the font's glyph order is the project's). */
  function kernTable(p) {
    const index = new Map(p.glyphs.map((g, n) => [g.id, n]));
    const pairs = M.pairs(p).filter(([a, b]) => index.has(a) && index.has(b)).map(([a, b, v]) => [index.get(a), index.get(b), v]);
    return S.kern(pairs);
  }
  function setLineGap(tables, gap) {
    if (!tables.hhea) return;
    const h = tables.hhea.slice();
    S.view(h).setInt16(8, gap);
    tables.hhea = h;
  }
  function otf(p) {
    const { tables } = S.read(new Uint8Array(font(p).toArrayBuffer()));
    const k = kernTable(p);
    if (k) tables.kern = k;
    setLineGap(tables, p.metrics.lineGap);
    return S.write('OTTO', tables);
  }
  function ttf(p) {
    const { tables } = S.read(new Uint8Array(font(p).toArrayBuffer()));
    delete tables['CFF ']; delete tables.CFF2; delete tables.VORG;
    const t = T.tables(p.glyphs);
    tables.glyf = t.glyf; tables.loca = t.loca; tables.maxp = t.maxp; tables.hmtx = t.hmtx;
    const head = tables.head.slice(), hd = S.view(head);
    hd.setInt16(36, t.box.xMin); hd.setInt16(38, t.box.yMin); hd.setInt16(40, t.box.xMax); hd.setInt16(42, t.box.yMax);
    hd.setInt16(50, 1);   // indexToLocFormat: long offsets
    tables.head = head;
    // post: version 3 (no glyph names) is what TrueType fonts without names carry; keep opentype.js's table as it is
    const hhea = tables.hhea.slice(), hh = S.view(hhea);
    hh.setUint16(34, p.glyphs.length);   // numberOfHMetrics: every glyph has its own
    tables.hhea = hhea;
    setLineGap(tables, p.metrics.lineGap);
    const k = kernTable(p);
    if (k) tables.kern = k;
    return S.write(S.TRUE, tables);
  }
  const woff = (p, deflate) => S.woff(ttf(p), deflate);
  function css(p, files = {}) {
    const fam = p.info.family.replace(/["\\]/g, '');
    const src = [['woff2', 'woff2'], ['woff', 'woff'], ['ttf', 'truetype'], ['otf', 'opentype']]
      .filter(([k]) => files[k]).map(([k, f]) => `url("${files[k]}") format("${f}")`);
    const style = /italic|oblique/i.test(p.info.style) ? 'italic' : 'normal';
    return `@font-face {\n  font-family: "${fam}";\n  src: ${src.join(',\n       ') || `url("${fileBase(p)}.woff2") format("woff2")`};\n` +
      `  font-weight: ${p.info.weight};\n  font-style: ${style};\n  font-display: swap;\n}\n\n.my-text {\n  font-family: "${fam}", sans-serif;\n}\n`;
  }
  return { font, otf, ttf, woff, css, fileBase, postScriptName, kernTable };
});
