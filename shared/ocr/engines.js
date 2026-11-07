/* Text recognition (OCR) engines: the one list of the engines that read text, which of them this site offers, the one
 * the person chose, and the one way to run a model of any of them. Slop OCR, Slop PDF (Recognise text), AI Tools (OCR),
 * the Serial counter and Expenses (receipts) read text only through run().
 * Each engine reads with models of the OCR model list (aitools/ocr-models.js: every model names its engine), so the
 * Language and model dialog (shared/ocr/choose.js) downloads, ranks and removes the models of every engine alike:
 *   paddle     PaddleOCR (Baidu): one model per script, run in the inference worker (aitools/workers/ocr-engine.js)
 *   tesseract  Tesseract (the open-source project): one model per language, run by tesseract.js (shared/ocr/engine-tesseract.js)
 * An engine: { id, name, maker (an id of shared/ai/makers.js), quick (the model read with when no language is chosen),
 *   languages() (the codes its models read), load(model, onStatus), recognize(image, { model, onProgress }) } resolving
 *   to lines in reading order [{ text, score (0..1), box: { x, y, w, h } }] with .skipped (lines found but read as nothing).
 * Which engines are offered: the brand profile's ai rules (shared/ai/makers.js: hideOrigins ["CN"] hides PaddleOCR) and
 * its "ocr" field ({ engines: [...], default: "tesseract" }, brand/README.md), written into OCR_RULES at build time.
 * The choice ('auto' or an engine id) is kept in localStorage (slop.ocr.engine); a choice the site no longer offers
 * reads as the profile's default, else Auto. Auto ranks the models of every offered engine together for the language
 * (shared/models/catalog.js rank: the most accurate first), so PaddleOCR reads the scripts it has and Tesseract the rest.
 * Pure until run() (no DOM, no storage but the choice), so Node tests load it (module.exports); the browser gets
 * window.SlopOcrEngines. Classic script: load shared/ai/makers.js first, then this file, then aitools/ocr-models.js. */
(function (root, factory) {
  const here = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
  const api = factory(root, here);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopOcrEngines = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root, here) {
  'use strict';
  // The brand profile's "ocr" field (tools/whitelabel/ai.mjs writes it at build time); this site's own: every engine, Auto.
  const OCR_RULES = /*profile:ocrEngines*/{};
  const KEY = 'slop.ocr.engine';
  /** The words (shared/ocr/i18n), read when shown. */
  const T = (k, v) => (root.SlopI18n ? root.SlopI18n.t(k, v) : k);
  const models = () => root.SlopOcrModels;
  /** The codes the engine's models read (every model, offered or not: the list in aitools/ocr-models.js). */
  const codesOf = (id) => () => [...new Set(((models() && models().ALL) || []).filter((m) => m.engine === id).flatMap((m) => m.languages))];

  /** PaddleOCR: the models are loaded into the inference worker of aitools/common.js and read there. */
  const paddle = {
    load: (model, onStatus) => root.SlopAITools.ensure(model, onStatus),
    recognize: (image, o = {}) => root.SlopAITools.call('ocr', { model: o.model, bitmap: image.bitmap, w: image.w, h: image.h }, { transfer: [image.bitmap], onProgress: o.onProgress }),
  };
  /** An engine whose code is a module beside this file, imported the first time it runs. */
  function lazy(file) {
    let p = null;
    const mod = () => (p = p || import(new URL(file, here || root.location.href).href).catch((e) => { p = null; throw e; }));
    return {
      load: async (model, onStatus) => (await mod()).load(model, onStatus),
      recognize: async (image, o) => (await mod()).recognize(image, o),
    };
  }
  const ENGINES = [
    { id: 'paddle', name: 'PaddleOCR', maker: 'baidu', quick: 'ppocr-v4', languages: codesOf('paddle'), ...paddle },   // i18n-ignore: a product name
    { id: 'tesseract', name: 'Tesseract', maker: 'tesseract', quick: 'tesseract-eng', languages: codesOf('tesseract'), ...lazy('engine-tesseract.js') },   // i18n-ignore: a product name
  ];
  const IDS = ENGINES.map((e) => e.id);
  const byId = (id) => ENGINES.find((e) => e.id === id) || null;

  let rules = OCR_RULES;
  /** The profile's ocr rules in use; configure(r) replaces them (tests, previews), configure() goes back to the profile's. */
  const config = () => JSON.parse(JSON.stringify(rules));
  function configure(r) { rules = r === undefined ? OCR_RULES : r && typeof r === 'object' ? r : {}; return config(); }
  /** True when the site offers the engine: its maker is not hidden by the ai rules, and the ocr rules list it (or list none). */
  function allowed(id) {
    const e = byId(id), mk = root.SlopAIKit && root.SlopAIKit.makers;
    if (!e) return false;
    if (Array.isArray(rules.engines) && rules.engines.length && !rules.engines.includes(id)) return false;
    return !mk || mk.allowed({ id: e.id, name: e.name, madeBy: e.maker });
  }
  /** The engines this site offers, in the list's order (the best first). */
  const offered = () => ENGINES.filter((e) => allowed(e.id));

  const store = (s) => { try { return s !== undefined ? s : root.localStorage || null; } catch (e) { return null; } };
  /** What the person chose: 'auto' or an offered engine. A saved engine the site no longer offers (or none saved) reads
   *  as the profile's default when that is offered, else 'auto'. */
  function chosen(storage) {
    let v = null;
    try { const s = store(storage); v = s ? s.getItem(KEY) : null; } catch (e) { v = null; }
    if (v === 'auto') return 'auto';
    if (v && allowed(v)) return v;
    return rules.default && allowed(rules.default) ? rules.default : 'auto';
  }
  /** Keeps the choice ('auto' or an offered engine id); anything else is refused (false). */
  function choose(id, storage) {
    if (id !== 'auto' && !allowed(id)) return false;
    try { const s = store(storage); if (s) s.setItem(KEY, id); } catch (e) { /* not kept: the choice lasts for this page */ }
    return true;
  }
  /** The engine Auto reads a language with: the engine of the best model for it whose engine is offered (catalog: the OCR
   *  model list, window.SlopOcrModels), else of the quick model ('auto', or a language none reads), else the first offered. */
  function autoFor(language, catalog = models()) {
    const ok = (m) => m && allowed(m.engine);
    const best = language && language !== 'auto' ? catalog.rank(language).map((r) => r.model).find((m) => ok(m) && m.id !== catalog.QUICK) : null;
    const q = catalog.byId(catalog.QUICK);
    const m = best || (ok(q) && (!language || language === 'auto' || catalog.fits(q, language)) ? q : null);
    if (m) return m.engine;
    const e = (language && language !== 'auto' && offered().find((x) => x.languages().includes(language))) || offered()[0];
    return e ? e.id : null;
  }
  /** The model to read with when no language is chosen: the quick one of the engine chosen (Auto: of the first offered
   *  engine), the one the Serial counter and receipts in Expenses read with; null when no engine is offered. */
  function quick(storage) {
    const O = models();
    if (O) return O.forEngine(chosen(storage)).QUICK;
    const e = offered()[0];
    return e ? e.quick : null;
  }
  /** The engine of a model (the OCR model list's entry, or the model index's for a page that has only that). */
  function engineOf(modelId) {
    const m = (models() && models().byId(modelId)) || (root.SlopAIModels && root.SlopAIModels.byId(modelId));
    return byId((m && m.engine) || 'paddle');
  }
  /** Readies a model for run() (reads it from this device into its engine). */
  function load(modelId, onStatus) {
    const e = engineOf(modelId);
    if (!allowed(e.id)) return Promise.reject(new Error(T('ocrengine.hidden', { name: e.name })));
    return e.load(modelId, onStatus);
  }
  /** Reads a picture ({ bitmap, w, h }; the bitmap is handed over) with a model of any engine: load(), then recognize(). */
  async function run(modelId, image, o = {}) {
    await load(modelId, o.onStatus);
    return engineOf(modelId).recognize(image, { model: modelId, onProgress: o.onProgress || (() => {}) });
  }
  /** The name shown for an engine choice: Auto or the engine's name. */
  const label = (id) => (id === 'auto' ? T('ocrengine.auto') : (byId(id) || { name: id }).name);
  return { ENGINES, IDS, KEY, byId, allowed, offered, chosen, choose, autoFor, quick, engineOf, load, run, label, config, configure };
});
