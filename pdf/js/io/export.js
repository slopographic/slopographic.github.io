/* Slop PDF — export: copies source pages with pdf-lib (vectors intact), applies rotation, flattens annotations and
   stamps, keeps links and forms working, drops orphans, and validates by reopening with pdf.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;

  /* ------------------------------------------------------------- export */
  function N(k) { return PDFLib.PDFName.of(k); }
  function rgb(hex) { var c = U.hexToRgb(hex); return PDFLib.rgb(c.r, c.g, c.b); }
  async function embedAsset(out, id, cacheMap) {
    if (cacheMap.has(id)) return cacheMap.get(id);
    var as = E.assets.get(id); if (!as) return null;
    var bytes = U.dataURLToBytes(as.url), img;
    img = as.mime === 'image/jpeg' ? await out.embedJpg(bytes) : await out.embedPng(bytes);
    cacheMap.set(id, img);
    return img;
  }
  async function drawAnnot(out, page, a, g, ctx) {
    var L = PDFLib, op = 'opacity' in a ? a.opacity : 1;
    var blend = (a.type === 'hlbox' || a.type === 'marker') ? L.BlendMode.Multiply : undefined;
    if (!E.isBox(a)) {
      if (!a.pts || !a.pts.length) return;
      if (a.type === 'texthl') {
        if (a.style === 'underline' || a.style === 'strike') {
          // a line along the bottom (underline) or through the middle (strike) of each text line
          for (var u = 0; u + 3 < a.pts.length; u += 4) {
            var ml = window.SlopPdfSel.markLine(a.pts.slice(u, u + 4), a.style);
            page.drawSvgPath('M' + ml.x0 + ' ' + ml.y + ' L' + ml.x1 + ' ' + ml.y, { x: g.x0, y: g.y0 + g.H, borderColor: rgb(a.color || '#ffe14d'), borderWidth: ml.w, borderOpacity: op });
          }
          return;
        }
        // one filled quad per text line, multiplied onto the page like the other highlights
        for (var q = 0; q + 3 < a.pts.length; q += 4) {
          var qd = '';
          for (var j = 0; j < 4; j++) qd += (j ? 'L' : 'M') + U.round(a.pts[q + j][0], 2) + ' ' + U.round(a.pts[q + j][1], 2) + ' ';
          page.drawSvgPath(qd + 'Z', { x: g.x0, y: g.y0 + g.H, color: rgb(a.color || '#ffe14d'), opacity: op, borderWidth: 0, blendMode: L.BlendMode.Multiply });
        }
        return;
      }
      var d = '';
      if (a.type === 'pen' || a.type === 'marker') {
        a.pts.forEach(function (pt, k) { d += (k ? 'L' : 'M') + U.round(pt[0], 2) + ' ' + U.round(pt[1], 2) + ' '; });
        if (a.pts.length === 1) d += 'L' + (a.pts[0][0] + 0.01) + ' ' + a.pts[0][1];
      } else {
        var p1 = a.pts[0], p2 = a.pts[a.pts.length - 1];
        d = 'M' + p1[0] + ' ' + p1[1] + ' L' + p2[0] + ' ' + p2[1];
      }
      var o = { x: g.x0, y: g.y0 + g.H, borderColor: rgb(a.color || '#000'), borderWidth: a.width || 2, borderLineCap: L.LineCapStyle.Round, borderOpacity: op };
      if (blend) o.blendMode = blend;
      page.drawSvgPath(d, o);
      if (a.type === 'arrow') {
        var head = E.arrowHead(a);
        var o2 = { x: g.x0, y: g.y0 + g.H, color: rgb(a.color || '#000'), opacity: op };
        page.drawSvgPath(head, o2);
      }
      return;
    }
    var phi = -(a.rot || 0) * Math.PI / 180, cs = Math.cos(phi), sn = Math.sin(phi);
    if (Math.abs(cs) < 1e-9) cs = 0; if (Math.abs(sn) < 1e-9) sn = 0;
    var w = a.w, h = a.h;
    var e = g.x0 + a.cx - (w / 2) * cs - (h / 2) * sn;
    var f = g.y0 + g.H - a.cy + (w / 2) * sn - (h / 2) * cs;
    page.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(cs, -sn, sn, cs, e, f));
    if (a.type === 'text') {
      var t = E.textLayout(a);
      // each line in runs, left to right: one font per run (a language font for other scripts, text-intl.js)
      for (var li = 0; li < t.lines.length; li++) {
        var x = t.pad, runs = t.lines[li] ? E.runsOf(t.lines[li], t.font, a.bold) : [];
        for (var ri = 0; ri < runs.length; ri++) {
          var rf = await E.embedTextFont(out, runs[ri].font, ctx.fonts), col = rgb(a.color || '#000');
          // a font of the catalogue or a language font: shaped glyphs at the shaper's positions (shared/fonts/pdf-runs.js)
          if (E.face(runs[ri].font)) window.SlopPdfRuns.drawRun(L, page, rf, { text: runs[ri].text, x: x, y: h - t.base(li), size: t.size, rtl: !!runs[ri].rtl, shaped: true }, { color: [col.red, col.green, col.blue], opacity: op });
          else page.drawText(runs[ri].text, { x: x, y: h - t.base(li), size: t.size, font: rf, color: col, opacity: op });
          x += E.measureRun(runs[ri].text, runs[ri].font, t.size);
        }
      }
    } else if (a.type === 'image') {
      var img = await embedAsset(out, a.asset, ctx.images);
      if (img) page.drawImage(img, { x: 0, y: 0, width: w, height: h, opacity: op });
    } else {
      var fill = a.fill && a.fill !== 'none' ? rgb(a.fill) : null;
      var sw = a.type === 'whiteout' || a.type === 'hlbox' ? 0 : (a.width == null ? 2 : a.width);
      var stroke = sw > 0 && a.color && a.color !== 'none' ? rgb(a.color) : null;
      var ro = {};
      if (fill) { ro.color = fill; ro.opacity = a.type === 'hlbox' ? (a.opacity == null ? 0.4 : a.opacity) : (a.fillOpacity == null ? op : a.fillOpacity); }
      if (stroke) { ro.borderColor = stroke; ro.borderWidth = sw; ro.borderOpacity = op; }
      if (blend) ro.blendMode = blend;
      if (fill || stroke) {
        if (a.type === 'ellipse') {
          ro.x = w / 2; ro.y = h / 2; ro.xScale = Math.max(0.1, (w - sw) / 2); ro.yScale = Math.max(0.1, (h - sw) / 2);
          page.drawEllipse(ro);
        } else {
          ro.x = sw / 2; ro.y = sw / 2; ro.width = Math.max(0.1, w - sw); ro.height = Math.max(0.1, h - sw);
          page.drawRectangle(ro);
        }
      }
    }
    page.pushOperators(L.popGraphicsState());
  }
  /** Arrow head triangle (page space) as an SVG path string. */
  E.arrowHead = function (a) {
    var p1 = a.pts[0], p2 = a.pts[a.pts.length - 1], w = a.width || 2;
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    var hl = Math.max(8, w * 4), hw = Math.max(4, w * 2.2);
    var bx = p2[0] - ux * hl, by = p2[1] - uy * hl;
    return 'M' + U.round(p2[0] + ux * w * 0.5, 2) + ' ' + U.round(p2[1] + uy * w * 0.5, 2) + ' L' + U.round(bx - uy * hw, 2) + ' ' + U.round(by + ux * hw, 2) + ' L' + U.round(bx + uy * hw, 2) + ' ' + U.round(by - ux * hw, 2) + ' Z';
  };

  /* Strip /P back-pointers and park internal link targets as page numbers, so copyPages
     does not drag the donor's whole page tree along. Fixed up again after copying. */
  function prepareLinks(src) {
    var L = PDFLib, pages = src.getPages(), idx = new Map();
    pages.forEach(function (pg, i) { idx.set(pg.ref.toString(), i); });
    function park(arr) {
      if (!(arr instanceof L.PDFArray) || !arr.size()) return false;
      var first = arr.get(0);
      if (first instanceof L.PDFRef) { var t = idx.get(first.toString()); arr.set(0, t == null ? L.PDFNull : L.PDFNumber.of(t)); return true; }
      return false;
    }
    pages.forEach(function (pg) {
      var annots = pg.node.Annots(); if (!annots) return;
      for (var k = 0; k < annots.size(); k++) {
        var d = src.context.lookup(annots.get(k));
        if (!(d instanceof L.PDFDict)) continue;
        d.delete(N('P'));
        var parked = park(d.lookup(N('Dest'))); // i18n-ignore: PDF names / font names / producer, not UI
        var A = d.lookup(N('A'));
        if (A instanceof L.PDFDict) { var S = A.lookup(N('S')); if (S && S.asString && S.asString() === '/GoTo') parked = park(A.lookup(N('D'))) || parked; }
        if (parked) d.set(N('SlopDest'), L.PDFBool.True); // i18n-ignore: PDF names / font names / producer, not UI
      }
    });
  }
  function fixLinks(out, page, fid, firstOut) {
    var L = PDFLib, annots = page.node.Annots(); if (!annots) return;
    for (var k = annots.size() - 1; k >= 0; k--) {
      var d = out.context.lookup(annots.get(k));
      if (!(d instanceof L.PDFDict) || !d.get(N('SlopDest'))) continue; // i18n-ignore: PDF names / font names / producer, not UI
      d.delete(N('SlopDest')); // i18n-ignore: PDF names / font names / producer, not UI
      var arrs = [d.lookup(N('Dest'))], A = d.lookup(N('A')); // i18n-ignore: PDF names / font names / producer, not UI
      if (A instanceof L.PDFDict) arrs.push(A.lookup(N('D')));
      var dead = false;
      arrs.forEach(function (arr) {
        if (!(arr instanceof L.PDFArray) || !arr.size()) return;
        var t = arr.get(0);
        if (t instanceof L.PDFNumber) { var ref = firstOut.get(fid + ':' + t.asNumber()); if (ref) arr.set(0, ref); else dead = true; }
        else if (t === L.PDFNull) dead = true;
      });
      if (dead) annots.remove(k);
    }
  }
  function rebuildAcroForm(out, srcDocs) {
    var L = PDFLib, fields = [], seen = new Set();
    out.getPages().forEach(function (pg) {
      var annots = pg.node.Annots(); if (!annots) return;
      for (var k = 0; k < annots.size(); k++) {
        var ref = annots.get(k), d = out.context.lookup(ref);
        if (!(d instanceof L.PDFDict)) continue;
        var st = d.lookup(N('Subtype')); // i18n-ignore: PDF names / font names / producer, not UI
        if (!st || st.asString() !== '/Widget') continue;
        if (ref instanceof L.PDFRef) d.set(N('P'), pg.ref);
        var curRef = ref, cur = d, guard = 0;
        while (cur.get(N('Parent')) && guard++ < 32) { curRef = cur.get(N('Parent')); cur = out.context.lookup(curRef); if (!(cur instanceof L.PDFDict)) break; } // i18n-ignore: PDF names / font names / producer, not UI
        if (curRef instanceof L.PDFRef && !seen.has(curRef.toString())) { seen.add(curRef.toString()); fields.push(curRef); }
      }
    });
    if (!fields.length) return;
    var acro = out.context.obj({ Fields: fields });
    for (var entry of srcDocs) {
      var src = entry[1], sa = src.catalog.lookup(N('AcroForm')); // i18n-ignore: PDF names / font names / producer, not UI
      if (sa instanceof L.PDFDict) {
        var copier = L.PDFObjectCopier.for(src.context, out.context);
        ['DA', 'DR', 'Q', 'NeedAppearances'].forEach(function (k) { var v = sa.get(N(k)); if (v) acro.set(N(k), copier.copy(v)); }); // i18n-ignore: PDF names / font names / producer, not UI
        break;
      }
    }
    out.catalog.set(N('AcroForm'), out.context.register(acro)); // i18n-ignore: PDF names / font names / producer, not UI
  }
  /** Drop objects no longer reachable from the trailer (orphans left by copying/flattening). */
  E._gc = function (doc) {
    var L = PDFLib, ctx = doc.context, keep = new Set(), stack = [];
    function push(o) {
      if (!o) return;
      if (o instanceof L.PDFRef) { var k = o.toString(); if (keep.has(k)) return; keep.add(k); var t = ctx.lookup(o); if (t) stack.push(t); }
      else stack.push(o);
    }
    push(ctx.trailerInfo.Root); push(ctx.trailerInfo.Info);
    while (stack.length) {
      var o = stack.pop();
      if (o instanceof L.PDFDict) o.entries().forEach(function (e) { push(e[1]); }); // compat-ok: pdf-lib returns an array here, not an iterator
      else if (o instanceof L.PDFArray) o.asArray().forEach(push);
      else if (o instanceof L.PDFStream) o.dict.entries().forEach(function (e) { push(e[1]); }); // compat-ok: pdf-lib returns an array here, not an iterator
    }
    ctx.enumerateIndirectObjects().forEach(function (e) { if (!keep.has(e[0].toString())) ctx.delete(e[0]); });
  };

  /** Builds the output PDF. opts: {pages, stamps (default true), meta (default true), onProgress} → Uint8Array */
  E.build = async function (opts) {
    await E.libs();
    opts = opts || {};
    var L = PDFLib, st = E.state, pages = opts.pages || st.pages;
    if (!pages.length) throw new Error(U.t('pdf.io.no_pages'));
    var pend = SP.redact ? SP.redact.pending(pages).length : 0;
    if (pend) throw new Error(U.t('pdf.io.redact_pending', { n: pend }));
    await E.initFonts();
    await E.prepareAnnotFonts(pages);
    var out = await L.PDFDocument.create({ updateMetadata: false });
    var need = new Map();
    pages.forEach(function (p) { if (!p.blank) { if (!need.has(p.f)) need.set(p.f, []); need.get(p.f).push(p.i); } });
    var copied = new Map(), srcDocs = new Map(), step = 0, steps = need.size + pages.length;
    for (var entry of need) {
      var fid = entry[0], f = E.files.get(fid);
      if (!f) throw new Error(U.t('pdf.io.source_missing'));
      if (f.locked) throw new Error(U.t('pdf.io.locked', { name: f.name, why: f.locked }));
      var src = await L.PDFDocument.load(f.bytes, { updateMetadata: false, ignoreEncryption: true, throwOnInvalidObject: false });
      var vals = st.forms[fid];
      if ((vals && Object.keys(vals).length) || st.flattenForms) E.fillForm(src, vals || {}, !!st.flattenForms);
      prepareLinks(src);
      copied.set(fid, await E.copyPagesWith(out, src, entry[1], fid)); // one copier per file: its layers and attachments follow (export-oc.js)
      srcDocs.set(fid, src);
      if (opts.onProgress) opts.onProgress(++step / steps);
    }
    var counters = new Map(), firstOut = new Map(), ctx = { fonts: {}, images: new Map() }, placed = [];
    var stamps = opts.stamps === false ? null : st.stamps;
    for (var k = 0; k < pages.length; k++) {
      var p = pages[k], page;
      if (p.blank) page = out.addPage([p.blank.w, p.blank.h]);
      else {
        var c = counters.get(p.f) || 0; counters.set(p.f, c + 1);
        page = out.addPage(copied.get(p.f)[c]);
        var key = p.f + ':' + p.i;
        if (!firstOut.has(key)) firstOut.set(key, page.ref);
        placed.push([page, p.f]);
      }
      var g = E.geom(p);
      page.setRotation(L.degrees(E.rotation(p)));
      var list = (p.annots || []).filter(function (a) { return !a.hidden; }).concat(stamps ? E.stampAnnots(p, k, pages.length, stamps) : []);
      for (var j = 0; j < list.length; j++) {
        var an = list[j];
        if (an.type === 'note') E.noteAnnot(out, page, an, g); // comments stay PDF annotations
        else if (an.type === 'callout') await E.drawCallout(out, page, an, g, ctx);
        else if (an.type === 'step') await E.drawStep(out, page, an, g, ctx);
        else if (an.type === 'para') await E.drawPara(out, page, an, g, ctx); // a paragraph frame (editor/para-fonts.js)
        else await drawAnnot(out, page, an, g, ctx);
      }
      if (opts.onProgress && k % 8 === 0) { opts.onProgress(++step / steps); await U.sleep(0); }
    }
    placed.forEach(function (x) { fixLinks(out, x[0], x[1], firstOut); });
    var redacted = pages.some(function (p) { return p.redacted; });
    out.getPages().forEach(function (pg) { E.stripPageExtras(pg); if (redacted) E.pruneXObjects(out, pg); });
    if (!st.flattenForms) rebuildAcroForm(out, srcDocs);
    if (opts.meta !== false) E.applyMeta(out);
    E.carryCatalog(out);
    E._gc(out);
    return out.save({ useObjectStreams: true, updateFieldAppearances: false });
  };
  E.applyMeta = function (out) {
    var m = E.state.meta || {};
    if (m.title) out.setTitle(m.title, { showInWindowTitleBar: true });
    if (m.author) out.setAuthor(m.author);
    if (m.subject) out.setSubject(m.subject);
    if (m.keywords) out.setKeywords(String(m.keywords).split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean));
    out.setProducer('Slop PDF · slopographic.com/pdf'); // i18n-ignore: PDF names / font names / producer, not UI
    out.setCreator('Slop PDF'); // i18n-ignore: PDF names / font names / producer, not UI
    var now = new Date();
    out.setCreationDate(now); out.setModificationDate(now);
  };

  /** Re-opens output with pdf.js; resolves the pdf.js doc (caller destroys) after checking the page count. */
  E.openOutput = async function (bytes, expected) { await E.libs();
    var r = await E.openPdfjs(bytes, 'output', null);
    if (expected != null && r.doc.numPages !== expected) { await r.doc.destroy(); throw new Error('Validation failed: expected ' + expected + ' pages, got ' + r.doc.numPages + '.'); }
    return r.doc;
  };
  E.validate = async function (bytes, expected) { var d = await E.openOutput(bytes, expected); var n = d.numPages; await d.destroy(); return n; };
})();
