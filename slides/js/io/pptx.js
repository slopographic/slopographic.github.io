/* Slop Slides: PPTX export (PresentationML, written from the deck model with shared/office/zip.js). Exports text
   boxes, shapes and pictures (PNG, JPEG, GIF) per slide, with groups flattened. Tables, charts, media and notes are
   not written yet; the result says how many objects were left out. Units: points to EMU (12700 per point).
   Not yet checked in Microsoft PowerPoint. Exposes SS.pptx.write(deck) → Promise<{ blob, skipped }>. */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util, O = SS.objects, TH = SS.themes, X = SS.textLayout, F = SS.fonts;
  var P = SS.pptx = {};
  var ZIP = new URL('../../../shared/office/zip.js', document.currentScript ? document.currentScript.src : location.href).href;
  var HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  var PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var PML = 'application/vnd.openxmlformats-officedocument.presentationml.';
  var PRST = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rightArrow: 'rightArrow', leftArrow: 'leftArrow',
    star5: 'star5', diamond: 'diamond', hexagon: 'hexagon', line: 'line', arrowLine: 'line', callout: 'wedgeRectCallout', cloudCallout: 'wedgeRoundRectCallout' };
  var IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };
  var E = function (pt) { return Math.round(pt * 12700); };
  var ALIGN = { l: 'l', c: 'ctr', r: 'r', j: 'just' };

  var SCHEME = { bg: 'bg1', text: 'tx1', bg2: 'bg2', text2: 'tx2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6' };
  function hex(theme, ref, fb) { return (TH.color(theme, ref, fb || 'text') || '#000000').replace('#', '').toUpperCase(); }
  /** A solid fill. A plain theme slot ('accent2', 'text') is written as a scheme colour, so PowerPoint's theme recolours it too. */
  function solid(theme, ref, fb, alpha) {
    var a = alpha == null ? 1 : alpha, mod = a < 1 ? '<a:alpha val="' + Math.round(a * 100000) + '"/>' : '';
    var slot = SCHEME[ref == null || ref === '' ? fb : ref];
    return '<a:solidFill>' + (slot ? '<a:schemeClr val="' + slot + '">' + mod + '</a:schemeClr>' : '<a:srgbClr val="' + hex(theme, ref, fb) + '">' + mod + '</a:srgbClr>') + '</a:solidFill>';
  }
  function fillXml(theme, fill) {
    if (!fill || fill.type === 'none') return '<a:noFill/>';
    var ref = fill.type === 'solid' ? fill.color : (fill.colors || [])[0];
    return solid(theme, ref, 'accent1', fill.alpha);
  }
  function lineXml(theme, o) {
    var st = o.stroke;
    if (!st || !(st.width > 0) || st.color === 'none') return '<a:ln><a:noFill/></a:ln>';
    return '<a:ln w="' + E(st.width) + '">' + solid(theme, st.color, 'text', st.alpha) +
      (st.dash && st.dash !== 'solid' ? '<a:prstDash val="' + (st.dash === 'dot' ? 'sysDot' : 'dash') + '"/>' : '') +
      (st.head === 'arrow' ? '<a:headEnd type="triangle"/>' : '') + (st.tail === 'arrow' ? '<a:tailEnd type="triangle"/>' : '') + '</a:ln>';
  }
  function xfrm(o) {
    var rot = (((o.rot || 0) % 360) + 360) % 360;
    return '<a:xfrm' + (rot ? ' rot="' + Math.round(rot * 60000) + '"' : '') + (o.flipH ? ' flipH="1"' : '') + (o.flipV ? ' flipV="1"' : '') + '>' +
      '<a:off x="' + E(o.x) + '" y="' + E(o.y) + '"/><a:ext cx="' + E(o.w) + '" cy="' + E(o.h) + '"/></a:xfrm>';
  }

  /* text */
  function run(r, st, p, theme) {
    var size = r.size || p.size || st.size || 18;
    var bold = r.b != null ? r.b : !!st.bold, ital = r.i != null ? r.i : !!st.italic;
    var face = F.family(TH.font(theme, r.font || p.font || st.font));
    return '<a:r><a:rPr lang="en-US" sz="' + Math.round(size * 100) + '" b="' + (bold ? 1 : 0) + '" i="' + (ital ? 1 : 0) + '"' +
      (r.u ? ' u="sng"' : '') + (r.s ? ' strike="sngStrike"' : '') + ' dirty="0">' + solid(theme, r.color || p.color || st.color, 'text') +
      '<a:latin typeface="' + U.esc(face) + '"/></a:rPr><a:t>' + U.esc(r.t) + '</a:t></a:r>';
  }
  /** Space before a paragraph in points: its own, else what the text layout puts there (text.js), so PowerPoint spaces it the same. */
  function before(p, st) {
    if (p.spaceBefore != null) return p.spaceBefore;
    if (st.paraSpace != null) return st.paraSpace;
    var sz = (p.runs || []).reduce(function (m, r) { return Math.max(m, r.size || 0); }, 0) || st.size || 18;
    return sz * (p.bullet && p.bullet !== 'none' ? 0.45 : 0.15);
  }
  function para(p, st, theme, first) {
    var bullet = !!p.bullet && p.bullet !== 'none', lvl = Math.min(p.level || 0, 4);
    var al = ALIGN[p.align || st.align || 'l'] || 'l';
    // the model's line height is a multiple of the font size; PowerPoint's 100% is about 1.2 times the size
    var ppr = '<a:pPr' + (lvl ? ' lvl="' + lvl + '"' : '') + ' algn="' + al + '"' + (bullet ? ' marL="' + E(18 + lvl * 18) + '" indent="' + -E(18) + '"' : ' marL="0" indent="0"') + '>' +
      '<a:lnSpc><a:spcPct val="' + Math.round((st.lineHeight || 1.2) / 1.2 * 100000) + '"/></a:lnSpc>' +
      (first ? '' : '<a:spcBef><a:spcPts val="' + Math.round(before(p, st) * 100) + '"/></a:spcBef>') +
      (bullet ? '<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>' : '<a:buNone/>') + '</a:pPr>';
    var runs = (p.runs || []).map(function (r) { return run(r, st, p, theme); }).join('');
    var end = '<a:endParaRPr lang="en-US" sz="' + Math.round((st.size || 18) * 100) + '"/>';
    return '<a:p>' + ppr + runs + end + '</a:p>';
  }
  function txBody(o, theme, st) {
    var tx = o.text || {}, ins = tx.inset || X.INSET;
    var anchor = tx.valign === 'middle' ? 'ctr' : tx.valign === 'bottom' ? 'b' : 't';
    var paras = (tx.paras || []).map(function (p, i) { return para(p, st, theme, i === 0); }).join('') || '<a:p><a:endParaRPr lang="en-US"/></a:p>';
    return '<p:txBody><a:bodyPr wrap="square" lIns="' + E(ins[0]) + '" tIns="' + E(ins[1]) + '" rIns="' + E(ins[2]) + '" bIns="' + E(ins[3]) +
      '" anchor="' + anchor + '" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>' + paras + '</p:txBody>';
  }

  /* objects */
  function shapeXml(id, o, theme) {
    var line = O.isLine(o);
    var adj = o.shape === 'roundRect' ? '<a:gd name="adj" fmla="val ' + Math.round(Math.max(0, Math.min(0.5, o.radius == null ? 0.12 : o.radius)) * 100000) + '"/>' : '';
    var geom = '<a:prstGeom prst="' + (PRST[o.shape] || 'rect') + '"><a:avLst>' + adj + '</a:avLst></a:prstGeom>';
    var fill = line ? '<a:noFill/>' : fillXml(theme, o.fill);
    var hasText = o.text && O.plain(o.text).trim() && !line;
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + U.esc(o.name || 'Shape') + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' + // i18n-ignore
      '<p:spPr>' + xfrm(o) + geom + fill + lineXml(theme, o) + '</p:spPr>' +
      (hasText ? txBody(o, theme, o.style || {}) : '') + '</p:sp>';
  }
  function picXml(id, o, rid) {
    var c = o.crop || {};
    var crop = (c.l || c.t || c.r || c.b) ? '<a:srcRect l="' + Math.round((c.l || 0) * 100000) + '" t="' + Math.round((c.t || 0) * 100000) +
      '" r="' + Math.round((c.r || 0) * 100000) + '" b="' + Math.round((c.b || 0) * 100000) + '"/>' : '';
    return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="' + U.esc(o.name || 'Picture') + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' + // i18n-ignore
      '<p:blipFill><a:blip r:embed="' + rid + '"/>' + crop + '<a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr>' + xfrm(o) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  }
  /** Groups are flattened: each child is mapped to slide coordinates (O.toParent), recursively. */
  function flatten(list, out) {
    list.forEach(function (o) {
      if (o.type === 'group') flatten(o.children.map(function (c) { return O.toParent(o, c); }), out);
      else out.push(o);
    });
    return out;
  }

  function rels(list) {
    return HDR + '<Relationships xmlns="' + PKG_REL + '">' + list.map(function (r) {
      return '<Relationship Id="' + r.id + '" Type="' + (r.type.indexOf('http') === 0 ? r.type : REL + r.type) + '" Target="' + r.target + '"/>';
    }).join('') + '</Relationships>';
  }
  function slideXml(deck, slide, theme, ctx) {
    var bg = TH.background(theme, slide), bgc = (bg.type === 'solid' && bg.color) || (bg.colors || [])[0] || 'bg';
    var n = 2, body = [], rel = [{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }];
    flatten(slide.objects, []).forEach(function (o) {
      if (o.type === 'shape' || (o.type === 'text' && O.plain(o.text).trim())) body.push(shapeXml(n++, o, theme));
      else if (o.type === 'text') return;
      else if (o.type === 'image') {
        var rec = deck.media && deck.media[o.media], ext = rec && IMG_EXT[rec.mime];
        if (!ext) { ctx.skipped++; return; }
        if (!ctx.media[o.media]) { ctx.media[o.media] = 'image' + (Object.keys(ctx.media).length + 1) + '.' + ext; ctx.files.push({ path: 'ppt/media/' + ctx.media[o.media], data: U.dataUrlToU8(rec.data) }); }
        var rid = 'rId' + (rel.length + 1);
        rel.push({ id: rid, type: 'image', target: '../media/' + ctx.media[o.media] });
        body.push(picXml(n++, o, rid));
      } else ctx.skipped++;
    });
    ctx.rels.push(rel);
    return HDR + '<p:sld ' + NS + (slide.hidden ? ' show="0"' : '') + '><p:cSld><p:bg><p:bgPr>' + solid(theme, bgc, 'bg') + '<a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + body.join('') +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }
  function themeXml(theme) {
    var c = theme.colors, f = theme.fonts, lnFill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    var clr = function (k, v) { return '<a:' + k + '><a:srgbClr val="' + hex(theme, v) + '"/></a:' + k + '>'; };
    return HDR + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="' + U.esc(theme.name || 'Slop') + '"><a:themeElements>' + // i18n-ignore
      '<a:clrScheme name="Slop">' + clr('dk1', c.text) + clr('lt1', c.bg) + clr('dk2', c.text2) + clr('lt2', c.bg2) +
      ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(function (k, i) { return clr('accent' + (i + 1), c[k]); }).join('') +
      clr('hlink', c.accent3) + clr('folHlink', c.accent4) + '</a:clrScheme>' +
      '<a:fontScheme name="Slop"><a:majorFont><a:latin typeface="' + U.esc(F.family(f.heading)) + '"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
      '<a:minorFont><a:latin typeface="' + U.esc(F.family(f.body)) + '"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="Slop"><a:fillStyleLst>' + lnFill + lnFill + lnFill + '</a:fillStyleLst>' +
      '<a:lnStyleLst><a:ln w="6350">' + lnFill + '</a:ln><a:ln w="12700">' + lnFill + '</a:ln><a:ln w="19050">' + lnFill + '</a:ln></a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst>' + lnFill + lnFill + lnFill + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  }
  var MASTER = HDR + '<p:sldMaster ' + NS + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles><p:titleStyle><a:lvl1pPr/></p:titleStyle><p:bodyStyle><a:lvl1pPr/></p:bodyStyle><p:otherStyle><a:defPPr/></p:otherStyle></p:txStyles></p:sldMaster>';
  var LAYOUT = HDR + '<p:sldLayout ' + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>' +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  var CT_DEF = { rels: 'application/vnd.openxmlformats-package.relationships+xml', xml: 'application/xml', png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };

  /** Builds the package. Resolves with { blob, skipped } (skipped = objects that have no PPTX form yet). */
  P.write = async function (deck) {
    var Z = await import(ZIP);
    var theme = TH.of(deck), ctx = { media: {}, files: [], rels: [], skipped: 0 };
    var slides = deck.slides.map(function (s) { return slideXml(deck, s, theme, ctx); });
    var entries = [
      { path: '[Content_Types].xml', data: HDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        Object.keys(CT_DEF).map(function (e) { return '<Default Extension="' + e + '" ContentType="' + CT_DEF[e] + '"/>'; }).join('') +
        '<Override PartName="/ppt/presentation.xml" ContentType="' + PML + 'presentation.main+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' + PML + 'slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' + PML + 'slideLayout+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        slides.map(function (_, i) { return '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="' + PML + 'slide+xml"/>'; }).join('') + '</Types>' },
      { path: '_rels/.rels', data: rels([{ id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' }]) },
      { path: 'ppt/presentation.xml', data: HDR + '<p:presentation ' + NS + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        '<p:sldIdLst>' + slides.map(function (_, i) { return '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 3) + '"/>'; }).join('') + '</p:sldIdLst>' +
        '<p:sldSz cx="' + E(deck.size.w) + '" cy="' + E(deck.size.h) + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
      { path: 'ppt/_rels/presentation.xml.rels', data: rels([
        { id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }, { id: 'rId2', type: 'theme', target: 'theme/theme1.xml' }].concat(
        slides.map(function (_, i) { return { id: 'rId' + (i + 3), type: 'slide', target: 'slides/slide' + (i + 1) + '.xml' }; }))) },
      { path: 'ppt/slideMasters/slideMaster1.xml', data: MASTER },
      { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([
        { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' }]) },
      { path: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT },
      { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]) },
      { path: 'ppt/theme/theme1.xml', data: themeXml(theme) }
    ];
    slides.forEach(function (x, i) {
      entries.push({ path: 'ppt/slides/slide' + (i + 1) + '.xml', data: x });
      entries.push({ path: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', data: rels(ctx.rels[i]) });
    });
    entries = entries.concat(ctx.files);
    var blob = await Z.writeZip(entries, { compress: true });
    return { blob: new Blob([blob], { type: PML + 'presentation' }), skipped: ctx.skipped };
  };
})();
