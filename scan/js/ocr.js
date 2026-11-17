/* Slop Scan: searchable text for the PDF, read by the site's own OCR (shared/ocr/engines.js: PaddleOCR or Tesseract, the
 * engine and model the person chose in Slop OCR or Slop PDF, Auto by default). Nothing of it loads until a PDF is made
 * with "Searchable text" on: then the same scripts Slop PDF loads (the model list, the manager, the inference worker),
 * through the shared loader. A model not on this device yet: the Get more dialog opens (nothing downloads without the
 * person's yes) and the PDF waits for the next try. Classic script; window.SlopScan.ocr:
 *   ready() → Promise<model id>     the scripts, the device check and the model (throws, err.needsModel when it is missing)
 *   read(canvas) → Promise<lines>   [{ text, box: { x, y, w, h } }] in the canvas's pixels
 *   choose()                        the Language and model dialog (shared/ocr/choose.js) */
(function (g) {
  'use strict';
  const S = g.SlopScan, t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const SCRIPTS = ['shared/cdn/assets.js', 'shared/ai/makers.js', 'shared/ocr/engines.js', 'aitools/model-registry.js', 'aitools/models.js',
    'aitools/support.js', 'aitools/get-more.js', 'aitools/common.js'];
  let loading = null, choiceP = null, model = null;

  const load = () => (loading = loading || g.SlopLoad.scripts(SCRIPTS).catch((e) => { loading = null; throw e; }));
  function choice() {
    if (!choiceP) {
      choiceP = load().then(() => import(new URL('shared/ocr/choose.js', g.SlopLoad.root).href))
        .then((m) => m.loadOcr().then(() => m.createOcrChoice({ ui: g.SlopUI, storageHref: '../settings/#storage' })))
        .catch((e) => { choiceP = null; throw e; });
    }
    return choiceP;
  }
  async function ready() {
    await load();
    const sup = g.SlopAISupport.check('ocr');
    if (!sup.ok) throw new Error(sup.reason);
    const c = await choice(), m = await c.modelFor(c.language);
    if (!m || (await g.SlopAIManager.status(m)) === 'needs-download') {
      const err = new Error(t('scan.ocr.model_missing'));
      err.needsModel = true;
      if (g.SlopAIGetMore) g.SlopAIGetMore.open(m || g.SlopOcrEngines.quick());
      throw err;
    }
    await g.SlopOcrEngines.load(m);
    return (model = m);
  }
  async function read(canvas) {
    if (!model) await ready();
    const bitmap = await createImageBitmap(canvas);
    const r = await g.SlopOcrEngines.run(model, { bitmap, w: canvas.width, h: canvas.height });
    return r.lines || [];
  }
  async function choose() { const c = await choice(); return c.open(); }
  S.ocr = { ready, read, choose, SCRIPTS };
})(window);
