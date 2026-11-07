/* Slop AI Tools: the text recognition (OCR) models, the second family of the shared model chooser (shared/models/: catalog.js
 * ranks them, chooser.js is the dialog). Pure data (no DOM, no storage), so a Node test can load it (module.exports); the
 * browser gets window.SlopOcrModels, and model-registry.js adds MODELS to the model index.
 * Classic script: load shared/ai/makers.js, shared/ocr/engines.js, shared/models/catalog.js and aitools/ocr-tesseract.js,
 * then this file, then model-registry.js (or this file later: it adds its models to the index then, see shared/ocr/choose.js
 * loadOcr). Every model names its engine (shared/ocr/engines.js), which reads with it:
 * PaddleOCR reads one script per recognition model. SCRIPTS is the one table of which languages each script group reads
 * (codes as in shared/speech/languages.js, plus zh-Hant for traditional Chinese); every Paddle model's languages come from it.
 * The bundled PP-OCRv4 model (Chinese and English, the first one Slop OCR had) is the quick model, always offered; the
 * others are PaddleOCR recognisers (PP-OCRv6 small for Latin script, Chinese and Japanese; PP-OCRv5 mobile for the other
 * scripts) on the slopographic/cdn repository at the release tag in shared/cdn/assets.js (load it first)
 * (models/ocr/<id>/, with manifest.json, the licence and SOURCE.md), each with the same PP-OCRv4 text detector
 * (models/ocr/ppocr-det-v4/) and its own dictionary. The worker (workers/infer.worker.js) knows the files by their ends:
 * *_det_infer.onnx the detector, the other .onnx the recogniser, the .txt the dictionary.
 * Tesseract reads one language per model (tesseract-<its code>: one data file, aitools/ocr-tesseract.js); tesseract-eng is
 * its quick model, the one read with when PaddleOCR is not offered.
 * ALL is every model; MODELS only those of the engines this site offers (shared/ocr/engines.js allowed(): the brand
 * profile can hide PaddleOCR), and QUICK the offered engines' first quick model (null when none is offered).
 * Exposes the catalog (shared/models/catalog.js create()) of MODELS with rank('auto') listing the quick model first and the
 * models of a script group, plus ALL, SCRIPTS, scriptOf(code), modelFor(code), modelOfScript(script), CDN, QUICK and
 * forEngine(id): the same catalog of one engine's models ('auto': this one). Each model lists its script groups
 * (scripts) and its languages. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const catalog = root.SlopModelCatalog || (node ? require('../shared/models/catalog.js') : null);
  const cdn = root.SlopCdn || (node ? require('../shared/cdn/assets.js') : null);
  const tess = root.SlopOcrTesseract || (node ? require('./ocr-tesseract.js') : null);
  const engines = root.SlopOcrEngines || (node ? require('../shared/ocr/engines.js') : null);
  const api = factory(catalog, cdn, tess, engines);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopOcrModels = api;
  // loaded after the model index (on demand): the index takes these models now
  if (root.SlopAIModels && root.SlopAIModels.add) root.SlopAIModels.add(api.MODELS);
})(typeof window !== 'undefined' ? window : globalThis, function (catalog, cdn, tess, engines) {
  'use strict';
  /** The models' folder in the cdn repository; every URL comes from shared/cdn/assets.js (jsDelivr, then GitHub). */
  const CDN = 'models/ocr/';
  const B = (id, name) => cdn.url(CDN + id + '/' + name);
  const HF = 'https://huggingface.co/';
  const QUICK = 'ppocr-v4';
  const PADDLE = 'https://github.com/PaddlePaddle/PaddleOCR';

  /** The words people read (names, notes, how a model is built and where it comes from) are keys of
   *  shared/i18n/ui/<code>/models2.js, read when shown (getters), so they follow the page's language. */
  const T = (k, v) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(k, v) : k);
  const key = (id) => 'ui.models.ocr.' + id.replace(/-/g, '_');
  const words = catalog.words;
  /** A script group: its name (ui.models.script.<id>) and the languages its model reads. */
  const S = (id, languages) => words({ languages }, { name: () => T('ui.models.script.' + id) });
  /** Which languages each script group's model reads. A language may sit in two groups (Serbian: Latin and Cyrillic). */
  const SCRIPTS = {
    latin: S('latin', ['af', 'az', 'br', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'en', 'es', 'et', 'eu', 'fi', 'fo', 'fr', 'ga', 'gl', 'ha', 'hr', 'ht', 'hu', 'id', 'is', 'it', 'jw', 'la', 'lb', 'ln', 'lt', 'lv', 'mg', 'mi', 'ms', 'mt', 'nl', 'nn', 'no', 'oc', 'pl', 'pt', 'ro', 'sk', 'sl', 'sn', 'so', 'sq', 'sr', 'su', 'sv', 'sw', 'tk', 'tl', 'tr', 'uz']),
    cyrillic: S('cyrillic', ['ba', 'be', 'bg', 'kk', 'ky', 'mk', 'mn', 'ru', 'sr', 'tg', 'tt', 'uk']),
    arabic: S('arabic', ['ar', 'fa', 'ku', 'ps', 'sd', 'ug', 'ur']),
    devanagari: S('devanagari', ['hi', 'mr', 'ne', 'sa']),
    korean: S('korean', ['ko']),
    cjk: S('cjk', ['zh', 'zh-Hant', 'ja', 'en']),
    greek: S('greek', ['el']),
    thai: S('thai', ['th']),
    tamil: S('tamil', ['ta']),
    telugu: S('telugu', ['te']),
    han: S('han', ['zh', 'en']),
  };

  const DET = { name: 'ch_PP-OCRv4_det_infer.onnx', size: 4745517, sha256: 'd2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9', url: B('ppocr-det-v4', 'ch_PP-OCRv4_det_infer.onnx') };
  /** The recogniser and dictionary of each model, from models/ocr/<id>/manifest.json on the cdn. */
  const REC = {
    'ppocr-v6-small': [['PP-OCRv6_rec_small.onnx', 21234383, '6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884'], ['ppocrv6_dict.txt', 74947, 'b5f2bfe2bdd9448429e3e82b51c789775d9b42f2403d082b00662eb77e401c5d']],
    'ppocr-v5-cyrillic': [['cyrillic_PP-OCRv5_rec_mobile.onnx', 8074092, '90f761b4bfcce0c8c561c0cb5c887b0971d3ec01c32164bdf7374a35b0982711'], ['ppocrv5_cyrillic_dict.txt', 2781, 'db40aa52ceb112055be80c694afdf655d5d2c4f7873704524cc16a447ca913ba']],
    'ppocr-v5-arabic': [['arabic_PP-OCRv5_rec_mobile.onnx', 8023828, 'c1192e632d0baa9146ae5b756a0e635e3dc63c1733737ebfd1629e87144e9295'], ['ppocrv5_arabic_dict.txt', 2369, '7f92f7dbb9b75a4787a83bfb4f6d14a8ab515525130c9d40a9036f61cf6999e9']],
    'ppocr-v5-devanagari': [['devanagari_PP-OCRv5_rec_mobile.onnx', 7940361, 'd6f0a906580e3fa6b324a318718f1f31f268b6ea8ef985f91c2012a37f52c91e'], ['ppocrv5_devanagari_dict.txt', 1943, '09c7440bfc5477e5c41052304b6b185aff8c4a5e8b2b4c23c1c706f6fe1ee9fc']],
    'ppocr-v5-korean': [['korean_PP-OCRv5_rec_mobile.onnx', 13488748, 'cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b'], ['ppocrv5_korean_dict.txt', 47451, 'a88071c68c01707489baa79ebe0405b7beb5cca229f4fc94cc3ef992328802d7']],
    'ppocr-v5-greek': [['el_PP-OCRv5_rec_mobile.onnx', 7832350, 'b4368bccd557123c702b7549fee6cd1e94b581337d1c9b65310f109131542b7f'], ['ppocrv5_el_dict.txt', 1103, '31defc62c0c3ad3674a82da6192226a2ba98ef4ff014a7045cb88d59f9c3de31']],
    'ppocr-v5-thai': [['th_PP-OCRv5_rec_mobile.onnx', 7915294, 'de541dd83161c241ff426f7ecfd602a0ba77d686cf3ab9a6c255ea82fd08006e'], ['ppocrv5_th_dict.txt', 1767, '57f5406f94bb6688fb7077f7be65f08bbd71cecf48c01ea26c522cb5c4836b7a']],
    'ppocr-v5-tamil': [['ta_PP-OCRv5_rec_mobile.onnx', 7909926, 'a42448808b7dea87597336f12438935f40353f1949e8360acd9e06b4da21bfe1'], ['ppocrv5_ta_dict.txt', 1723, '85b541352ae18dc6ba6d47152d8bf8adff6b0266e605d2eef2990c1bf466117b']],
    'ppocr-v5-telugu': [['te_PP-OCRv5_rec_mobile.onnx', 7923102, 'a3690451b50028a09a3316a1274f7c05728151ea3f8fd392696397a7fefcbd92'], ['ppocrv5_te_dict.txt', 1831, '42f83f5d3fdb50778e4fa5b66c58d99a59ab7792151c5e74f34b8ffd7b61c9d6']],
  };

  // speed and accuracy: 1 (low) to 5 (high), for the bars in the Language and model dialog. Name and note: ui.models.ocr.<id>_name/_note.
  const META = [
    { id: 'ppocr-v6-small', scripts: ['latin', 'cjk'], speed: 3, accuracy: 5 },
    { id: 'ppocr-v5-cyrillic', scripts: ['cyrillic'], speed: 5, accuracy: 4 },
    { id: 'ppocr-v5-arabic', scripts: ['arabic'], speed: 5, accuracy: 4 },
    { id: 'ppocr-v5-devanagari', scripts: ['devanagari'], speed: 5, accuracy: 4 },
    { id: 'ppocr-v5-korean', scripts: ['korean'], speed: 4, accuracy: 4 },
    { id: 'ppocr-v5-greek', scripts: ['greek'], speed: 5, accuracy: 4 },
    { id: 'ppocr-v5-thai', scripts: ['thai'], speed: 5, accuracy: 4 },
    { id: 'ppocr-v5-tamil', scripts: ['tamil'], speed: 5, accuracy: 4 },
    { id: 'ppocr-v5-telugu', scripts: ['telugu'], speed: 5, accuracy: 4 },
  ];

  /** The bundled model: the one every OCR page has used since the start, from Hugging Face (and its dictionary bundled). */
  const BUNDLED = words({
    id: QUICK, tool: 'ocr', engine: 'paddle', madeBy: 'baidu',
    maker: 'PaddlePaddle (Baidu)', scripts: ['han'], languages: SCRIPTS.han.languages, only: false, speed: 5, accuracy: 3,
    licence: 'Apache-2.0', upstream: PADDLE,
    source: HF + 'SWHL/RapidOCR',
    files: [
      { name: 'ch_PP-OCRv4_det_infer.onnx', size: 4745517, sha256: 'd2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9', url: HF + 'SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx' },
      { name: 'ch_PP-OCRv4_rec_infer.onnx', size: 10857958, sha256: '48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b', url: HF + 'SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx' },
      { name: 'ppocr_keys_v1.txt', size: 26249, sha256: '28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7', path: 'vendor/models/ppocr_keys_v1.txt' },
    ],
  }, { name: () => T(key(QUICK) + '_name'), note: () => T(key(QUICK) + '_note'), arch: () => T(key(QUICK) + '_arch'), sourceNote: () => T(key(QUICK) + '_source') });

  /** The PaddleOCR models: the same shape as every other model of the index (model-registry.js). byScript: offered for its
   *  script before a language is chosen. */
  const PADDLE_MODELS = [BUNDLED].concat(META.map((m) => words({
    id: m.id, tool: 'ocr', engine: 'paddle', madeBy: 'baidu', byScript: true, maker: 'PaddlePaddle (Baidu)', scripts: m.scripts, languages: [...new Set(m.scripts.flatMap((x) => SCRIPTS[x].languages))], only: false,
    speed: m.speed, accuracy: m.accuracy,
    licence: 'Apache-2.0', upstream: PADDLE, source: 'https://github.com/slopographic/cdn/tree/main/models/ocr/' + m.id,
    files: [DET].concat(REC[m.id].map(([name, size, sha256]) => ({ name, size, sha256, url: B(m.id, name) }))),
  }, {
    name: () => T(key(m.id) + '_name'), note: () => T(key(m.id) + '_note'),
    arch: () => T('ui.models.ocr.arch', { rec: m.id.startsWith('ppocr-v6') ? 'PP-OCRv6 small' : 'PP-OCRv5 mobile', scripts: m.scripts.map((x) => SCRIPTS[x].name).join(', ') }),   // i18n-ignore: model names
    sourceNote: () => T('ui.models.ocr.source'),
  })));

  /** The script groups a language is read by ([] when none). */
  const scriptOf = (code) => Object.keys(SCRIPTS).filter((s) => SCRIPTS[s].languages.includes(code));
  /** A language's name in the page's language (Intl), for the Tesseract models' names; Whisper's jw is Intl's jv. */
  function langName(code) {
    const ui = (globalThis.SlopI18n && globalThis.SlopI18n.get && globalThis.SlopI18n.get()) || 'en';
    try { return new Intl.DisplayNames([ui, 'en'], { type: 'language' }).of(code === 'jw' ? 'jv' : code) || code; } catch (e) { return code; }
  }
  /** The main language of each script group: the model offered for text in that script when the language is not known. */
  const MAIN = { latin: 'en', cyrillic: 'ru', arabic: 'ar', devanagari: 'hi', korean: 'ko', cjk: 'ja', greek: 'el', thai: 'th', tamil: 'ta', telugu: 'te', han: 'zh' };
  /** The Tesseract models, one per language (aitools/ocr-tesseract.js). English is read by the Chinese groups' Paddle models
   *  too; its Tesseract model reads Latin script only. */
  const TESSERACT_MODELS = (tess ? tess.ROWS : []).map(([codes, code, size, sha256]) => {
    const languages = codes.split(' '), id = 'tesseract-' + code.replace(/_/g, '-'), file = code + '.traineddata.gz';
    return words({
      id, tool: 'ocr', engine: 'tesseract', madeBy: 'tesseract', tess: code, maker: 'Tesseract (open source)',   // i18n-ignore: a maker's name
      scripts: code === 'eng' ? ['latin'] : [...new Set(languages.flatMap(scriptOf))], languages, only: false, speed: 3, accuracy: 3,
      licence: 'Apache-2.0', upstream: 'https://github.com/tesseract-ocr/tessdata_best', source: 'https://github.com/slopographic/cdn/tree/main/' + tess.DIR,   // i18n-ignore: a licence id
      files: [{ name: file, size, sha256, url: cdn.url(tess.DIR + file) }],
    }, {
      name: () => T('ocrengine.model_name', { lang: langName(languages[0]) + (code === 'srp_latn' ? ' (' + SCRIPTS.latin.name + ')' : '') }),
      note: () => T('ocrengine.model_note'), arch: () => T('ocrengine.model_arch', { version: tess.VERSION }), sourceNote: () => T('ocrengine.model_source'),
    });
  });

  /** Every model of every engine, and those of the engines this site offers. */
  const ALL = PADDLE_MODELS.concat(TESSERACT_MODELS);
  const MODELS = engines ? ALL.filter((m) => engines.allowed(m.engine)) : ALL;
  /** The catalog of a list of models, its quick one first when no language is chosen. */
  function view(models, quick) {
    const C = catalog.create({ family: 'ocr', models, quick });
    /** 'auto' (no language chosen): the quick model first, then the models of a script (PaddleOCR's), so a script's model
     *  can be chosen without a language. */
    function rank(language) {
      if (language && language !== 'auto') return C.rank(language);
      return (C.byId(quick) ? [{ model: C.byId(quick), badges: ['fastest'] }] : []).concat(models.filter((m) => m.id !== quick && m.byScript).map((model) => ({ model, badges: [] })));
    }
    /** The best model for a language (null when none reads it). */
    const modelFor = (code) => C.recommended(code) || (C.fits(C.byId(quick), code) ? C.byId(quick) : null);
    /** The best model for a script group (not the quick one), or null: a script's own model, else the one for its main language. */
    const modelOfScript = (script) => models.find((m) => m.id !== quick && m.byScript && m.scripts.includes(script)) || (MAIN[script] && C.recommended(MAIN[script])) || null;
    /** Every language code some model reads. */
    const CODES = [...new Set(models.flatMap((m) => m.languages))];
    /** The same catalog with one engine's models ('auto' or an unknown id: this one). */
    function forEngine(id) {
      const e = engines && engines.byId(id);
      if (!e || id === 'auto') return api;
      return view(models.filter((m) => m.engine === id), models.some((m) => m.id === e.quick) ? e.quick : null);
    }
    const api = { ...C, rank, ALL, SCRIPTS, CODES, scriptOf, modelFor, modelOfScript, forEngine, CDN };
    return api;
  }
  /** The quick model: the first offered engine's (PaddleOCR's bundled one, else Tesseract's English). */
  const quick = [QUICK, 'tesseract-eng'].find((id) => MODELS.some((m) => m.id === id)) || null;
  return view(MODELS, quick);
});
