/* Slop PDF — Recognise text (OCR) on pages that have none. The engines are the site's OCR engines (shared/ocr/engines.js:
   PaddleOCR on the inference worker of aitools/common.js, or Tesseract; the OCR panel's Text recognition engine picks one,
   Auto by default). The model is stored on this device after one download (Get more), and then it runs offline.
   The OCR panel's Language and model button opens the shared dialog (shared/ocr/choose.js, loaded on first use) for the
   model of another script; without a choice the engine's quick model reads (PaddleOCR's bundled Chinese and English one),
   and a note after the run names the model that would read the text better.
   Each page is rendered at 200 dpi, read line by line, and the words are written as an invisible text layer (ocr/layer.js).
   When the lines are small (small print, low contrast), the picture is read again at 2x, contrast stretched and sharpened
   (OCR.readPicture); the boxes of that reading are mapped back to the page's own pixels before the layer uses them.
   The pages get a copy of their file with that layer, so the existing text editing finds the words. One undo step per page.
   Cancel stops before the next page: the pages already read are kept. Stubs replace SP.ocr.ready and SP.ocr.read in tests. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, A = SP.app, O = SP.organizer;
  var OCR = SP.ocr = {}, t = U.t;
  var DPI = 200, MAX_PX = 40e6;
  /** The quick model of the engine chosen (PaddleOCR's bundled one unless the site or the person chose otherwise). */
  function quick() { return (window.SlopOcrEngines && window.SlopOcrEngines.quick()) || 'ppocr-v4'; }
  var SMALL_LINE = 40, ZOOM = 2; // a median line box under 40 px (about 14 pt at 200 dpi) is small text: read it at ZOOM

  var choiceP = null, choiceNow = null;
  /** The Language and model choice (shared/ocr/choose.js and the OCR model list, loaded once, on first use). */
  OCR.choice = function () {
    var site = (window.SlopAIManager && window.SlopAIManager.site) || new URL('../', document.baseURI).href;
    if (!choiceP) choiceP = import(new URL('shared/ocr/choose.js', site).href).then(function (m) {
      return m.loadOcr().then(function () { return (choiceNow = m.createOcrChoice({ ui: window.SlopUI, storageHref: '../settings/#storage' })); });
    }).catch(function (e) { choiceP = null; throw e; });
    return choiceP;
  };
  /** The OCR panel's Language and model button: the dialog, then the offer to read now. */
  OCR.chooseLanguage = async function () {
    var c = await OCR.choice(), r = await c.open();
    if (r && r.model) OCR.installed();
  };
  /** Checks the device and the model. Throws (with needsModel set) when the model still has to be downloaded. */
  OCR.ready = async function (onStatus) {
    var T = window.SlopAITools, M = window.SlopAIManager;
    if (!T || !M || !window.SlopAISupport) throw new Error(t('pdf.ocr.engine_missing'));
    var sup = window.SlopAISupport.check('ocr');
    if (!sup.ok) throw new Error(sup.reason);
    var c = await OCR.choice(), model = await c.modelFor(c.language);
    if (!model || (await M.status(model)) === 'needs-download') {
      var err = new Error(t('pdf.ocr.model_missing'));
      err.needsModel = true;
      throw err;
    }
    OCR.model = model; OCR.skipped = 0;
    await window.SlopOcrEngines.load(model, onStatus);
  };
  /** Opens the Get more dialog for the bundled model, or the Language and model dialog when a language is chosen
   *  (nothing downloads until the person confirms there). */
  OCR.getModel = function () {
    if (choiceNow && choiceNow.language !== 'auto') { OCR.chooseLanguage(); return; }
    if (window.SlopAIGetMore) window.SlopAIGetMore.open(quick(), { onInstalled: OCR.installed });
  };
  /** Runs after the model is stored (the Get more dialog has closed). Asks whether to read the text now. "Run on this
   * page" is the primary button, so Enter never starts a whole-document run by accident. */
  OCR.installed = function () {
    var pick = null;
    SlopUI.dialog({
      title: t('pdf.ocr.ask_title'), cls: 'sui-narrow ocr-ask',
      body: t('pdf.ocr.ask_body'),
      buttons: [
        { label: t('pdf.ocr.not_now') },
        { label: t('pdf.ocr.run_doc'), act: function () { pick = 'doc'; } },
        { label: t('pdf.ocr.run_page'), primary: true, act: function () { pick = 'page'; } }
      ],
      onClose: function () {
        if (pick === 'page') A.recognisePage();
        else if (pick === 'doc') A.recogniseAll();
      }
    });
  };
  /** Reads one picture (a canvas of the page). Resolves to lines [{ text, score, box: { x, y, w, h } }] in canvas pixels. */
  OCR.read = async function (canvas, onProgress) {
    var bitmap = await createImageBitmap(canvas);
    var r = await window.SlopOcrEngines.run(OCR.model || quick(), { bitmap: bitmap, w: canvas.width, h: canvas.height }, { onProgress: onProgress });
    OCR.skipped = (OCR.skipped || 0) + (r.skipped || 0);
    return r.lines || [];
  };
  function median(a) { a = a.slice().sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
  /** The picture at k times its size, contrast stretched (the 1st and 99th percentile of luma go to black and white) and
   * sharpened (a mild 3 x 3 unsharp kernel). Returns a new canvas; the caller maps boxes back with OCR.mapBack. */
  OCR.enhance = function (canvas, k) {
    var w = Math.round(canvas.width * k), h = Math.round(canvas.height * k), n = w * h, i;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, 0, 0, w, h);
    var img = g.getImageData(0, 0, w, h), d = img.data, hist = new Uint32Array(256);
    for (i = 0; i < d.length; i += 4) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
    var lo = percentile(hist, n * 0.01), hi = percentile(hist, n * 0.99), gain = 255 / Math.max(1, hi - lo), lut = new Uint8ClampedArray(256);
    for (i = 0; i < 256; i++) lut[i] = Math.round((i - lo) * gain);
    for (i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    var src = new Uint8ClampedArray(d), row = w * 4; // the sharpened pixel: 1.5 x itself less 1/8 of each neighbour
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var o = y * row + x * 4;
      for (var ch = 0; ch < 3; ch++) {
        d[o + ch] = 1.5 * src[o + ch] - 0.125 * (src[o - 4 + ch] + src[o + 4 + ch] + src[o - row + ch] + src[o + row + ch]);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  function percentile(hist, target) {
    var cum = 0;
    for (var v = 0; v < 256; v++) { cum += hist[v]; if (cum >= target) return v; }
    return 255;
  }
  /** Lines read on a picture k times larger, with their boxes in the smaller picture's pixels. */
  OCR.mapBack = function (lines, k) {
    return lines.map(function (l) {
      var b = l.box;
      return Object.assign({}, l, { box: { x: Math.round(b.x / k), y: Math.round(b.y / k), w: Math.round(b.w / k), h: Math.round(b.h / k) } });
    });
  };
  /** Reads a picture. When its lines are small, it is read again at ZOOM times the size, enhanced (OCR.enhance), and the
   * second reading's boxes come back in the picture's own pixels, so the text layer maps them as before. */
  OCR.readPicture = async function (canvas, onProgress) {
    var lines = await OCR.read(canvas, onProgress);
    if (!lines.length || median(lines.map(function (l) { return l.box.h; })) >= SMALL_LINE) return lines;
    if (canvas.width * canvas.height * ZOOM * ZOOM > MAX_PX) return lines;
    var big = OCR.enhance(canvas, ZOOM), again = await OCR.read(big, onProgress);
    big.width = big.height = 0;
    return OCR.mapBack(again, ZOOM);
  };

  /** The unrotated picture of a page at DPI (capped in pixels). Its size maps to the view box, as the layer needs. */
  function pictureOf(p) {
    var g = E.geom(p), scale = Math.min(DPI / 72, Math.sqrt(MAX_PX / (g.W * g.H)));
    return E.renderToCanvas(E.fileOfPage(p), p.i, scale);
  }
  /** True when the page already has text the editor can see. */
  async function hasText(p) {
    var pg = await E.fileOfPage(p).doc.getPage(p.i + 1), tc = await pg.getTextContent();
    return tc.items.some(function (it) { return typeof it.str === 'string' && it.str.trim() !== ''; });
  }
  /** Progress dialog with a Cancel button. cancelled() turns true when the person cancels (button, X or Escape). */
  function progressDialog() {
    var msg = U.h('p', { class: 'sui-p', role: 'status' }, t('pdf.ocr.starting'));
    var bar = U.h('progress', { max: '1', value: '0', style: { width: '100%' } });
    var state = { done: false, cancelled: false };
    var dlg = SlopUI.dialog({ title: t('pdf.ocr.title'), cls: 'ocr-progress', body: U.h('div', null, msg, bar), buttons: [{ label: t('menu.cancel') }],
      onClose: function () { if (!state.done) state.cancelled = true; } });
    return {
      cancelled: function () { return state.cancelled; },
      set: function (text, frac) { msg.textContent = text; if (frac != null) bar.value = frac; },
      close: function () { state.done = true; dlg.close(true); }
    };
  }

  /** Reads the given pages (ids) and adds their text layer. Resolves to the number of pages changed. */
  A.recognise = async function (ids) {
    var pages = ids.map(function (id) { return E.pageById(id); }).filter(function (p) { return p && !p.blank; });
    if (!pages.length) { SlopUI.toast(t('pdf.ocr.blank_pages')); return 0; }
    if (Ed.isEditingText()) Ed.commitText();
    var todo = [], skipped = 0;
    for (var i = 0; i < pages.length; i++) {
      if (!(await hasText(pages[i]))) todo.push(pages[i]);
      else if (pages.length === 1) {
        var again = await SlopUI.confirm(t('pdf.ocr.has_text_title'), t('pdf.ocr.has_text_body'), t('pdf.ocr.anyway'));
        if (again) todo.push(pages[i]); else return 0;
      } else skipped++;
    }
    if (!todo.length) { SlopUI.toast(t('pdf.ocr.all_have_text')); return 0; }
    var ui = progressDialog(), n = todo.length, results = [], error = null;
    try {
      await OCR.ready(function (s) { ui.set(s, null); });
      for (var k = 0; k < n && !ui.cancelled(); k++) {
        var p = todo[k], label = n > 1 ? t('pdf.ocr.page_of', { i: String(k + 1), n: String(n) }) : t('pdf.ocr.the_page');
        ui.set(t('pdf.ocr.rendering', { page: label }), k / n);
        var canvas = await pictureOf(p), px = { w: canvas.width, h: canvas.height };
        var lines = await OCR.readPicture(canvas, function (q) {
          var within = q.stage === 'detect' ? 0 : (q.total ? q.done / q.total : 0);
          ui.set(q.stage === 'detect' ? t('pdf.ocr.detecting', { page: label }) : t('pdf.ocr.reading_line', { page: label, i: String(q.done + 1), n: String(q.total) }), (k + within) / n);
        });
        results.push({ id: p.id, f: p.f, i: p.i, lines: lines, px: px, g: E.geom(p) });
        canvas.width = canvas.height = 0;
      }
    } catch (e) { error = e; }
    ui.close();
    if (error && error.needsModel) { OCR.getModel(); return 0; }
    var stopped = ui.cancelled() && results.length < n;
    var changed = await writeResults(results);
    if (error) SlopUI.alert(t('pdf.ocr.failed'), String(error.message || error));
    else if (changed) {
      var msg = t('pdf.ocr.done', { n: changed }), join = function (a, b) { return t('pdf.ocr.join', { a: a, b: b }); };
      if (stopped) msg = join(msg, t('pdf.ocr.stopped'));
      if (skipped) msg = join(msg, t('pdf.ocr.skipped', { n: skipped }));
      SlopUI.toast(t('pdf.ocr.end', { text: msg }) + better(results));
    } else SlopUI.toast(stopped ? t('pdf.ocr.cancelled') : t('pdf.ocr.none_found') + better(results));
    if (changed) Ed.paint();
    return changed;
  };

  /** With no language chosen: the sentence naming a model that would read these pages better (shared/ocr/suggest.js). */
  function better(results) {
    var c = choiceNow;
    var s = c && c.suggest([].concat.apply([], results.map(function (r) { return r.lines; })), OCR.model, OCR.skipped);
    return s ? ' ' + c.sentence(s) + ' ' + t('pdf.ocr.choose_hint') : '';
  }
  /** Writes the layer into one copy of each source file, then one undo step per page. */
  async function writeResults(results) {
    if (!results.length) return 0;
    var byFile = new Map();
    results.forEach(function (r) { var a = byFile.get(r.f) || []; a.push(r); byFile.set(r.f, a); });
    var newFile = new Map();
    for (var entry of byFile) {
      var f = E.files.get(entry[0]), rs = entry[1];
      var bytes = await SP.ocrLayer.write(f.bytes, rs.map(function (r) { return { index: r.i, lines: r.lines, g: r.g, px: r.px }; }));
      var made = await E.registerPdf(bytes, t('pdf.ocr.file_name'), null);
      made.noLog = true; // generated: its bytes cannot be replayed from the edit log
      made.ocr = true; // the file has the layer: edits to its words replace them (editor/edit-text.js)
      newFile.set(entry[0], made.id);
    }
    results.forEach(function (r) {
      var fid = newFile.get(r.f), n = E.indexOf(r.id) + 1;
      E.commit(t('pdf.ocr.commit', { n: String(n) }), function (st) {
        var q = st.pages.filter(function (x) { return x.id === r.id; })[0];
        if (q) q.f = fid;
      });
    });
    return results.length;
  }

  /** The pages "this page" means: the page in view, else the selected pages, else the focused one. */
  function pagesHere() {
    if (A.mode === 'page') return Ed.pid ? [Ed.pid] : [];
    var sel = O.selected();
    return sel.length ? sel : (O.focusId ? [O.focusId] : []);
  }
  A.recognisePage = function () { return A.recognise(pagesHere()); };
  A.recogniseAll = function () { return A.recognise(E.state.pages.map(function (p) { return p.id; })); };
})();
