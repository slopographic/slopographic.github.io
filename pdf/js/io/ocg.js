/* Slop PDF — PDF layers (optional content groups: a drawing's layers, a map's labels, a form's print-only text). The groups
   of each file are read with pdf.js (getOptionalContentConfig: name and the file's own default). A layer shown or hidden
   is a document setting, one undo step (E.state.ocHidden: { opened file id: { layer name: true hidden | false shown } },
   over the file's default): the page view, thumbnails and page images draw with it (E.renderToCanvas), and a saved PDF
   keeps it as the file's default view (io/export-oc.js), so what is hidden here stays hidden when the file is opened
   elsewhere. Delete layer takes the layer's content out of every page of the file (each /OC … BDC … EMC sequence for it,
   core/content-move.js stripMarked) and the group out of /OCProperties: a derived copy of the file through the same path
   as text and object edits (editor/text-strip.js X.edit, kind 'ocg'), one undo step. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, Lx = window.SlopPdfLex, Mv = window.SlopPdfMove, Res = window.SlopPdfRes;
  var X = SP.ocg = {};

  /** The opened file a file id was derived from (text, object or layer edits make derived copies). */
  X.root = function (fid) { var f = E.files.get(fid); while (f && f.derived && E.files.get(f.derived.from)) f = E.files.get(f.derived.from); return f ? f.id : fid; };
  /** The layers of a file: a Promise of [{ id, name, on (the file's default) }] in the file's order, read once. */
  X.list = function (f) {
    if (!f || !f.doc) return Promise.resolve([]);
    if (!f._ocList) f._ocList = f.doc.getOptionalContentConfig().then(function (cfg) {
      var out = [];
      for (var it of cfg) { var id = it[0], g = it[1]; out.push({ id: id, name: g.name || SP.util.t('pdf.io.layer'), on: g.visible !== false }); }
      f._ocList.value = out;
      return out;
    }).catch(function () { f._ocList.value = []; return []; });
    return f._ocList;
  };
  X.cached = function (f) { return f && f._ocList && f._ocList.value || null; };
  /** Whether a layer is hidden now: the document's setting, else the file's default. */
  X.hidden = function (fid, layer) {
    var m = (E.state.ocHidden || {})[X.root(fid)], v = m && Object.prototype.hasOwnProperty.call(m, layer.name) ? m[layer.name] : null;
    return v == null ? !layer.on : !!v;
  };
  /** Shows or hides a layer of a file (and of the files derived from it), one undo step. */
  X.set = function (fid, name, hide) {
    var root = X.root(fid);
    E.commit(SP.util.t(hide ? 'pdf.io.layer_hide' : 'pdf.io.layer_show', { name: name }), function (st) {
      var all = Object.assign({}, st.ocHidden || {}), m = Object.assign({}, all[root] || {});
      m[name] = !!hide; all[root] = m; st.ocHidden = all;
    });
  };
  /** The layers of a file hidden now, by name (for the raster key, the renderer and the saved file). */
  X.hiddenNames = function (fid) {
    var l = X.cached(E.files.get(fid)) || [];
    return l.filter(function (g) { return X.hidden(fid, g); }).map(function (g) { return g.name; });
  };

  // the raster key: a layer shown or hidden draws the page again (view-pages.js, the thumbnail cache)
  var formKey = E.formKey;
  E.formKey = function (fid) {
    var k = formKey.apply(this, arguments), m = (E.state.ocHidden || {})[X.root(fid)];
    return m && Object.keys(m).length ? k + '|oc:' + JSON.stringify(m) : k;
  };
  // the renderer (core/pdfjs.js E.renderToCanvas): pages draw with the document's layer setting
  E.renderOptions = async function (f) {
    var list = f ? await X.list(f) : [];
    if (!list.length) return null;
    var cfg = await f.doc.getOptionalContentConfig();
    list.forEach(function (g) { cfg.setVisibility(g.id, !X.hidden(f.id, g), false); });
    return { optionalContentConfigPromise: Promise.resolve(cfg) };
  };

  /* ------------------------------------------------------------ deleting a layer (a derived copy) */
  function name(o) { return o && o.decodeText ? o.decodeText() : ''; }
  /** Takes the groups called `layer` out of a pdf-lib document: their marked content on every page, and every mention in
   * /OCProperties. Returns the number of pages changed, or -1 when the file has no such layer. */
  X.dropFrom = function (doc, layer) {
    var L = PDFLib, ctx = doc.context, N = function (k) { return L.PDFName.of(k); }, look = function (o) { return o instanceof L.PDFRef ? ctx.lookup(o) : o; };
    var props = look(doc.catalog.get(N('OCProperties')));
    if (!(props instanceof L.PDFDict)) return -1;
    var ocgs = look(props.get(N('OCGs'))), gone = new Set();
    if (ocgs instanceof L.PDFArray) ocgs.asArray().forEach(function (r) { var d = look(r); if (d instanceof L.PDFDict && name(look(d.get(N('Name')))) === layer) gone.add(String(r)); }); // i18n-ignore: PDF names / font names / producer, not UI
    if (!gone.size) return -1;
    var only = function (v) { // a group, or a membership dictionary of those groups only
      if (gone.has(String(v))) return true;
      var d = look(v), g = d instanceof L.PDFDict ? look(d.get(N('OCGs'))) : null;
      if (g instanceof L.PDFArray) return g.size() > 0 && g.asArray().every(function (x) { return gone.has(String(x)); });
      return !!g && gone.has(String(d.get(N('OCGs'))));
    };
    var changed = 0;
    doc.getPages().forEach(function (pg, k) {
      var res = pg.node.Resources(), pr = res instanceof L.PDFDict ? look(res.get(N('Properties'))) : null, names = []; // i18n-ignore: PDF names / font names / producer, not UI
      if (pr instanceof L.PDFDict) pr.entries().forEach(function (e) { if (only(e[1])) names.push(e[0].decodeText()); }); // compat-ok: pdf-lib returns an array here, not an iterator
      if (!names.length) return;
      var c = Res.contentOf(doc, pg), t = Mv.stripMarked(c.text, Lx.lex(c.text), names);
      if (t != null) { SP.editor._.strip.putContent(doc, k, c.refs, t); changed++; }
    });
    var strip = function (arr) {
      arr = look(arr);
      if (!(arr instanceof L.PDFArray)) return;
      for (var j = arr.size() - 1; j >= 0; j--) { var v = arr.get(j); if (gone.has(String(v))) arr.remove(j); else if (look(v) instanceof L.PDFArray) strip(v); }
    };
    strip(ocgs);
    var configs = [look(props.get(N('D')))].concat((look(props.get(N('Configs'))) || { asArray: function () { return []; } }).asArray().map(look)); // i18n-ignore: PDF names / font names / producer, not UI
    configs.forEach(function (d) {
      if (!(d instanceof L.PDFDict)) return;
      ['ON', 'OFF', 'Order', 'Locked'].forEach(function (k2) { strip(d.get(N(k2))); }); // i18n-ignore: PDF names / font names / producer, not UI
      var rb = look(d.get(N('RBGroups'))); if (rb instanceof L.PDFArray) rb.asArray().forEach(strip);
      var as = look(d.get(N('AS'))); if (as instanceof L.PDFArray) as.asArray().forEach(function (u) { u = look(u); if (u instanceof L.PDFDict) strip(u.get(N('OCGs'))); });
    });
    return changed;
  };
  SP.editor._.strip.kinds.ocg = {
    derive: async function (f, i, edit) {
      var doc = await SP.editor._.strip.load(f.bytes);
      if (X.dropFrom(doc, edit.layer) < 0) return null;
      return doc.save({ useObjectStreams: true });
    },
    /** The copy opens and no longer has the layer. */
    verify: async function (f, made, i, edit) { var l = await X.list(made); return !l.some(function (g) { return g.name === edit.layer; }); }
  };
  /** Deletes a layer and what it draws from every page of a file (and of the copies derived from the same opened file),
   * one undo step. Resolves true when it was done. */
  X.remove = async function (fid, layer) {
    var root = X.root(fid), made = new Map();
    for (var p of E.state.pages) {
      if (!p.f || made.has(p.f) || X.root(p.f) !== root) continue;
      var r = await SP.editor._.strip.edit(p, { kind: 'ocg', op: 'delete', layer: layer, page: false });
      made.set(p.f, r.to);
    }
    if (!Array.from(made.values()).some(Boolean)) return false;
    E.commit(SP.util.t('pdf.io.layer_delete', { name: layer }), function (st) { st.pages.forEach(function (q) { if (made.get(q.f)) SP.editor._.strip.use(q, made.get(q.f)); }); });
    return true;
  };
})();
