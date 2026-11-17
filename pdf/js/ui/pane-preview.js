/* Slop PDF — a document in a split pane that is not the focused one. It is a read-only preview: the pages are drawn with
 * pdf.js at this pane's own zoom, with the page's annotations and its selectable text on top, and it scrolls on its own.
 * Editing comes with the focus: a click on the pane makes it the live editor (ui/panes.js). Pages are drawn when they come
 * into view.
 *
 * The engine reads the open document's globals (E.files, E.state) for page sizes and annotations. withDoc lends them the
 * preview's document for the moment those are read, and puts the open document back at once. Classic script; exposes
 * SP.panePreview. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, U = SP.util, V = SP.view;
  var PV = SP.panePreview = {};
  var ZMIN = 0.2, ZMAX = 8, STEP = 1.25;
  /** Each document's zoom and scroll in the preview pane it was last in (a pane keeps its place when a document comes back). */
  var memory = new WeakMap();

  /** Runs fn with the engine looking at doc's files and pages. Synchronous only: the open document is put back at once. */
  function withDoc(doc, fn) {
    var files = E.files, state = E.state;
    E.files = doc.files; E.state = doc.state;
    try { return fn(); } finally { E.files = files; E.state = state; }
  }
  PV.withDoc = withDoc;

  /** The pages of a document as the preview draws them: layout size (points at zoom 1), rotation, the pdf.js page source and
   *  the page's place in the document (for the annotations that number from it). */
  function pagesOf(doc) {
    return withDoc(doc, function () {
      var total = doc.state.pages.length;
      return doc.state.pages.map(function (p, index) {
        var g = E.geom(p), vs = E.viewSize(p);
        return { p: p, index: index, total: total, w: vs.w, h: vs.h, W: g.W, H: g.H, R: E.rotation(p), blank: !!p.blank, file: p.blank ? null : doc.files.get(p.f), page: p.blank ? -1 : p.i };
      });
    });
  }

  /** A preview of doc in host (a pane element). opts: { title, zoom }. Returns the view: setDoc, setZoom, zoom, destroy. */
  PV.create = function (host, doc, opts) {
    var o = opts || {};
    var root = U.h('div', { class: 'pv-pv' });
    var head = U.h('div', { class: 'pv-pv-head' });
    var named = !!o.title, noteKey = 'pdf.act.pv_click_edit';
    var name = U.h('span', { class: 'pv-pv-name' }, o.title || U.t('pdf.act.document'));
    var zo = U.h('button', { type: 'button', class: 'pv-pv-btn' }, '−');
    var pct = U.h('span', { class: 'pv-pv-pct' }, '');
    var zi = U.h('button', { type: 'button', class: 'pv-pv-btn' }, '+');
    var fit = U.h('button', { type: 'button', class: 'pv-pv-btn' });
    var body = U.h('div', { class: 'pv-pv-body' });
    var note = U.h('p', { class: 'pv-pv-note', role: 'status' });
    /** The words, again on a language change (a preview stays on screen). */
    function words() {
      zo.setAttribute('aria-label', U.t('ui.zoom_out')); zi.setAttribute('aria-label', U.t('ui.zoom_in'));
      fit.textContent = U.t('pdf.act.pv_fit');
      if (!named) name.textContent = U.t('pdf.act.document');
      note.textContent = noteKey ? U.t(noteKey) : '';
      pages.forEach(function (e) { e.canvas.setAttribute('aria-label', U.t('pdf.act.pv_page', { p: String(e.p.index + 1) })); });
    }
    function setNote(k) { noteKey = k; note.textContent = k ? U.t(k) : ''; }
    head.append(name, zo, pct, zi, fit);
    root.append(head, body, note);
    host.append(root);

    var cur = doc || null, pages = [], tasks = new Map(), zoom = o.zoom || 0, fitting = !o.zoom, io = null, gen = 0;
    var dpr = window.devicePixelRatio || 1;
    words();
    var offLang = U.onLang(function () { words(); if (!cur && o.empty) build(); });

    function fitZoom() {
      var widest = 0;
      for (var i = 0; i < pages.length; i++) widest = Math.max(widest, pages[i].w);
      var cw = Math.max(120, body.clientWidth - 32);
      return widest ? cw / widest : 1;
    }
    function show() { pct.textContent = Math.round(zoom * 100 / (96 / 72)) + '%'; }
    /** Keeps the document's zoom and scroll for when it comes back to this pane. */
    function remember() {
      if (cur) memory.set(cur, { zoom: zoom, fitting: fitting, top: body.scrollTop, left: body.scrollLeft });
    }
    function stop() {
      gen++;
      tasks.forEach(function (t) { try { t.cancel(); } catch (e) { /* already done */ } });
      tasks.clear();
    }
    /** The page box, its layer (annotations, text) and its canvas at the zoom. The layer is the editor's: unrotated, then
     *  turned by the page's rotation. */
    function size(entry) {
      var z = zoom;
      entry.box.style.width = Math.round(entry.p.w * z) + 'px';
      entry.box.style.height = Math.round(entry.p.h * z) + 'px';
      entry.layer.style.width = Math.round(entry.p.W * z) + 'px';
      entry.layer.style.height = Math.round(entry.p.H * z) + 'px';
      entry.layer.style.transform = V.layerTransform(entry.p.R, entry.p.W, entry.p.H, z);
    }

    /** One page's canvas, drawn once per zoom when it is near the view, and its text layer on top. */
    function paint(entry) {
      if (entry.zoom === zoom && entry.canvas.dataset.drawn === '1') return;
      var mine = gen;
      var c = entry.canvas;
      var px = Math.max(1, Math.round(entry.p.w * zoom)), py = Math.max(1, Math.round(entry.p.h * zoom));
      c.style.width = px + 'px'; c.style.height = py + 'px';
      c.width = Math.round(px * dpr); c.height = Math.round(py * dpr);
      entry.zoom = zoom; c.dataset.drawn = '0';
      var ctx = c.getContext('2d');
      if (entry.p.blank || !entry.p.file || !entry.p.file.doc) {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        c.dataset.drawn = '1';
        return;
      }
      var pdfPage = entry.p.file.doc.getPage(entry.p.page + 1);
      pdfPage.then(function (pg) {
        if (mine !== gen) return null;
        var vp = pg.getViewport({ scale: zoom * dpr, rotation: entry.p.R });
        var task = pg.render({ canvasContext: ctx, viewport: vp });
        tasks.set(entry, task);
        return task.promise.then(function () { if (mine === gen) { c.dataset.drawn = '1'; tasks.delete(entry); } });
      }).then(null, function () { tasks.delete(entry); });
      textLayer(entry, mine);
    }
    /** The page's text, as pdf.js lays it out (selectable, in the page's own layer, unrotated like the editor's). */
    function textLayer(entry, mine) {
      if (entry.p.blank || !entry.p.file || !entry.p.file.doc) return;
      var old = entry.layer.querySelector('.pv-textlayer');
      if (old) old.remove();
      E.pdfjs().then(function (lib) {
        return entry.p.file.doc.getPage(entry.p.page + 1).then(function (pg) {
          return pg.getTextContent().then(function (tc) {
            if (mine !== gen || !entry.layer.isConnected) return;
            var vp = pg.getViewport({ scale: zoom, rotation: 0 });
            var div = U.h('div', { class: 'pv-textlayer textLayer' }); // i18n-ignore
            div.style.setProperty('--scale-factor', String(zoom));
            div.style.setProperty('--total-scale-factor', String(zoom));
            div.style.setProperty('--scale-round-x', '1px');
            div.style.setProperty('--scale-round-y', '1px');
            entry.layer.insertBefore(div, entry.svg);
            return new lib.TextLayer({ textContentSource: tc, container: div, viewport: vp }).render();
          });
        });
      }).then(null, function () { /* no text layer: the page still shows */ });
    }
    /** The annotations of a page, painted from the document they belong to (the editor's own painter). */
    function annotate(entry) {
      withDoc(cur, function () { V.paintAnnots(entry.svg, entry.p.p, entry.p.index, entry.p.total, {}); });
    }
    function watch() {
      if (io) io.disconnect();
      io = new IntersectionObserver(function (list) {
        list.forEach(function (x) { if (x.isIntersecting) paint(x.target.__entry); else cancelPage(x.target.__entry); });
      }, { root: body, rootMargin: '400px 0px' });
      pages.forEach(function (e) { io.observe(e.box); });
    }
    function cancelPage(entry) {
      var t = tasks.get(entry);
      if (t) { try { t.cancel(); } catch (e) { /* done */ } tasks.delete(entry); }
    }
    function build() {
      stop();
      body.replaceChildren();
      pages = [];
      setNote('');
      if (!cur) {
        setNote('pdf.act.pv_drop_here');
        if (o.empty) body.append(o.empty());
        return;
      }
      if (cur.pending) { setNote('pdf.act.pv_open_to_see'); return; }
      pages = pagesOf(cur).map(function (pg) {
        var box = U.h('div', { class: 'pv-pv-page' });
        var canvas = U.h('canvas', { class: 'pv-pv-canvas', 'aria-label': U.t('pdf.act.pv_page', { p: String(pg.index + 1) }) });
        var layer = U.h('div', { class: 'sheet-layer' });
        var svg = U.s('svg', { class: 'sheet-svg pv-svg', preserveAspectRatio: 'none' });
        layer.append(svg);
        box.append(canvas, layer);
        body.append(box);
        var entry = { p: pg, box: box, canvas: canvas, layer: layer, svg: svg, zoom: 0 };
        box.__entry = entry;
        return entry;
      });
      if (!pages.length) setNote('pdf.act.pv_no_pages');
      var m = cur ? memory.get(cur) : null;
      if (m) { zoom = m.zoom; fitting = m.fitting; }
      if (fitting) zoom = fitZoom();
      show();
      pages.forEach(function (e) { size(e); annotate(e); });
      watch();
      if (m) { body.scrollTop = m.top; body.scrollLeft = m.left; }
    }
    function setZoom(z, keepFit) {
      var next = Math.min(ZMAX, Math.max(ZMIN, z));
      if (!keepFit) fitting = false;
      if (next === zoom && pages.length) return;
      zoom = next;
      show();
      stop();   // canvases and text drawn at the old zoom are stale
      pages.forEach(function (e) { size(e); e.canvas.dataset.drawn = '0'; });
      watch();
    }

    zo.addEventListener('click', function () { setZoom(zoom / STEP); });
    zi.addEventListener('click', function () { setZoom(zoom * STEP); });
    fit.addEventListener('click', function () { fitting = true; setZoom(fitZoom(), true); });
    body.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? STEP : 1 / STEP));
    }, { passive: false });

    build();
    return {
      el: root,
      doc: function () { return cur; },
      /** Shows another document (or none) in this pane. */
      setDoc: function (d, title) {
        remember();
        cur = d || null;
        if (title) { name.textContent = title; named = true; }
        build();
      },
      setZoom: function (z) { setZoom(z); },
      zoom: function () { return zoom; },
      destroy: function () {
        remember();
        stop();
        offLang();
        if (io) io.disconnect();
        root.remove();
      },
    };
  };
})();
