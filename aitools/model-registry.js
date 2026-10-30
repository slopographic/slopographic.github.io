/* Slop AI Tools: the model index. Every model the hub can use, with its licence, size, source and SHA-256.
 * Pure data and checks (no DOM, no storage), so a Node test can load it (module.exports) and the browser gets
 * window.SlopAIModels. Classic script. A remote file is downloaded only after the person presses Download and
 * confirms the licence (get-more.js); a bundled file ships with the site under vendor/models/.
 * Each file: { name, size, sha256, url } (remote), { name, size, sha256, parts: [{ url, size, sha256 }] } (remote, stored in
 * pieces under 95 MB and joined after download) or { name, size, sha256, path } (bundled). The speech models are in
 * speech-models.js and the text recognition models per script in ocr-models.js (load them first). See HANDOFF.md. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const speech = root.SlopSpeechModels || (node ? require('./speech-models.js') : null);
  const ocr = root.SlopOcrModels || (node ? require('./ocr-models.js') : null);   // only on the pages that offer OCR languages
  const cdn = root.SlopCdn || (node ? require('../shared/cdn/assets.js') : null);   // the cdn's hosts (shared/cdn/assets.js)
  // the OCR engines this site offers (shared/ocr/engines.js; load shared/ai/makers.js and it first): a hidden engine's models are left out
  const engines = root.SlopOcrEngines || (node ? require('../shared/ocr/engines.js') : null);
  const api = factory(speech, ocr, cdn, engines, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopAIModels = api;
})(typeof window !== 'undefined' ? window : globalThis, function (speech, ocr, cdn, engines, root) {
  'use strict';

  /** Licences a model may declare, with the name shown to the person. Anything else is refused. */
  const LICENCES = {
    'MIT': 'MIT License',
    'Apache-2.0': 'Apache License 2.0',
    'BSD-3-Clause': 'BSD 3-Clause License',
  };
  /** Hosts a remote file may be served from: Hugging Face and its storage hosts, and the slopographic/cdn repository
   *  (on jsDelivr or raw.githubusercontent.com, shared/cdn/assets.js isCdnUrl).
   *  Checked on the final URL after redirects. */
  // Hugging Face serves a download from several storage hosts (cdn-lfs-us-1.hf.co, us.aws.cdn.hf.co, transfer.xethub.hf.co …),
  // and the set changes over time. So the rule is the domain family: huggingface.co, or any subdomain of hf.co or xethub.hf.co.
  const HOST_ROOTS = ['huggingface.co', 'hf.co', 'xethub.hf.co'];
  const HF = 'https://huggingface.co/';
  const SHA = /^[0-9a-f]{64}$/;
  const MAX_PART = 95 * 1000 * 1000;   // GitHub refuses files over 100 MB

  /** The words of the models listed here (name, how it is built, where it comes from) are keys ui.models.<k>_name, _arch and
   *  _source (shared/i18n/ui/<code>/models2.js), read when shown so they follow the page's language. */
  const T = (k, v) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(k, v) : k);
  const named = (m) => {
    for (const [p, end] of [['name', '_name'], ['arch', '_arch'], ['sourceNote', '_source']]) Object.defineProperty(m, p, { enumerable: true, configurable: true, get: () => T('ui.models.' + m.k + end) });
    return m;
  };
  const MODELS = [
    {
      id: 'ppocr-v4', tool: 'ocr', k: 'ocr.ppocr_v4',
      licence: 'Apache-2.0', upstream: 'https://github.com/PaddlePaddle/PaddleOCR',
      source: HF + 'SWHL/RapidOCR',
      files: [
        { name: 'ch_PP-OCRv4_det_infer.onnx', size: 4745517, sha256: 'd2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9', url: HF + 'SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx' },
        { name: 'ch_PP-OCRv4_rec_infer.onnx', size: 10857958, sha256: '48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b', url: HF + 'SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx' },
        { name: 'ppocr_keys_v1.txt', size: 26249, sha256: '28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7', path: 'vendor/models/ppocr_keys_v1.txt' },
      ],
    },
    {
      id: 'mobilenetv3-l100', tool: 'tags', k: 'idx.mobilenet',
      licence: 'Apache-2.0', upstream: 'https://github.com/huggingface/pytorch-image-models',
      source: HF + 'onnxmodelzoo/mobilenetv3_large_100_Opset17',
      files: [
        { name: 'mobilenetv3_large_100_Opset17.onnx', size: 21919274, sha256: 'b0b785f44a068dee4ff35bd88b114d4fd17a8bd635816f8f0ee46fa8b196c29f', url: HF + 'onnxmodelzoo/mobilenetv3_large_100_Opset17/resolve/main/mobilenetv3_large_100_Opset17.onnx' },
        { name: 'imagenet-labels.json', size: 13489, sha256: '0507e07632759ad025d035ba6115d3bbae65dd4d83e01c0b294ad26bffb32979', path: 'vendor/models/imagenet-labels.json' },
      ],
    },
    {
      id: 'modnet-portrait', tool: 'portrait', k: 'idx.modnet',
      licence: 'Apache-2.0', upstream: 'https://github.com/ZHKKKe/MODNet',
      source: 'vendor/models/modnet-portrait.onnx',
      files: [
        { name: 'modnet-portrait.onnx', size: 25888640, sha256: '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9', path: 'vendor/models/modnet-portrait.onnx' },
      ],
    },
  ].map(named).filter((m) => m.id !== 'ppocr-v4' || !engines || engines.allowed('paddle'))   // PaddleOCR's quick model, unless the site hides PaddleOCR
    .concat(speech ? speech.MODELS : [])   // the speech models: aitools/speech-models.js (Whisper and its fine-tunes)
    // the text recognition models per script: aitools/ocr-models.js (its ppocr-v4 is the entry above, kept here for pages without it)
    .concat(ocr ? ocr.MODELS.filter((m) => m.id !== 'ppocr-v4') : []);

  const TOOLS = [
    // OCR needs the quick model of the engine chosen (shared/ocr/engines.js), read when asked: the OCR list may load later
    { id: 'ocr', name: 'OCR', page: 'ocr/', get models() { return ocrQuick(); }, blurb: 'Read text from an image or a scanned PDF page.' },   // i18n-ignore: shown through aitools.tool.<id>_name/_blurb (hub.js)
    { id: 'speech', name: 'Speech to text', page: 'speech/', models: ['whisper-tiny'], blurb: 'Transcribe audio or a video, with timestamps. Exports .srt and .txt.' },   // i18n-ignore: shown through aitools.tool.<id>_name/_blurb (hub.js)
    { id: 'denoise', name: 'Denoise', page: 'denoise/', models: [], blurb: 'Median and bilateral filters with a before and after slider. No model needed.' },   // i18n-ignore: shown through aitools.tool.<id>_name/_blurb (hub.js)
    { id: 'tags', name: 'Auto tags', page: 'tags/', models: ['mobilenetv3-l100'], blurb: 'Suggest tags for a photo. You accept or edit them, then they are saved to Slop Drive.' },   // i18n-ignore: shown through aitools.tool.<id>_name/_blurb (hub.js)
    { id: 'portrait', name: 'Portrait blur', page: 'portrait/', models: ['modnet-portrait'], blurb: 'Blur the background of a portrait, with a strength slider.' },   // i18n-ignore: shown through aitools.tool.<id>_name/_blurb (hub.js)
  ];

  /** The OCR tool's model: the quick one of the engine chosen (the OCR list's, when the page has it), else PaddleOCR's
   *  bundled one when offered; none when no engine is. */
  function ocrQuick() {
    const O = root.SlopOcrModels || ocr, id = O ? O.forEngine(engines ? engines.chosen() : 'auto').QUICK : MODELS.some((m) => m.id === 'ppocr-v4') ? 'ppocr-v4' : null;
    return id ? [id] : [];
  }
  const byId = (id) => MODELS.find((m) => m.id === id) || null;
  const remoteFiles = (m) => m.files.filter((f) => !f.path);
  /** The URLs a file is downloaded from: its url, or its parts' urls in order. */
  const urlsOf = (f) => (f.parts ? f.parts.map((p) => p.url) : f.url !== undefined ? [f.url] : []);
  /** Total bytes a person would download for a model (bundled files excluded). */
  const downloadBytes = (m) => remoteFiles(m).reduce((n, f) => n + f.size, 0);

  /** Checks the whole index. Returns a list of problems (empty when the index is sound). */
  function problems(models = MODELS) {
    const out = [], ids = new Set();
    for (const m of models) {
      const who = `model ${m.id}`;
      if (!m.id || ids.has(m.id)) out.push(`${who}: id missing or repeated`);
      ids.add(m.id);
      if (!Object.prototype.hasOwnProperty.call(LICENCES, m.licence)) out.push(`${who}: licence "${m.licence}" is not on the list`);
      if (typeof m.upstream !== 'string' || !/^https:\/\//.test(m.upstream)) out.push(`${who}: upstream must be an https link`);
      if (!Array.isArray(m.files) || !m.files.length) out.push(`${who}: no files`);
      for (const f of m.files || []) {
        if (!SHA.test(f.sha256)) out.push(`${who}: ${f.name} sha256 must be 64 lowercase hex digits`);
        if (!Number.isInteger(f.size) || f.size < 1) out.push(`${who}: ${f.name} size must be a positive integer`);
        for (const u of urlsOf(f)) if (!allowedUrl(u)) out.push(`${who}: ${f.name} url must be https on an allowed host`);
        if (f.url === undefined && f.path === undefined && !f.parts) out.push(`${who}: ${f.name} needs a url, parts or a path`);
        if (f.parts) {
          if (!Array.isArray(f.parts) || f.parts.length < 2) out.push(`${who}: ${f.name} parts must list at least two parts`);
          else {
            if (f.parts.reduce((n, p) => n + p.size, 0) !== f.size) out.push(`${who}: ${f.name} parts do not add up to its size`);
            for (const p of f.parts) if (!SHA.test(p.sha256) || !Number.isInteger(p.size) || p.size < 1 || p.size > MAX_PART) out.push(`${who}: ${f.name} each part needs a sha256 and a size up to 95 MB`);
          }
        }
      }
    }
    for (const t of TOOLS) for (const id of t.models) if (!ids.has(id)) out.push(`tool ${t.id}: unknown model ${id}`);
    return out;
  }

  /** True when url is https and its host is HOST_ROOTS itself or a subdomain of one (never a look-alike such as hf.co.evil.com),
   *  or the slopographic/cdn repository on its hosts (nothing else on jsDelivr or raw.githubusercontent.com). */
  function allowedUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      const C = cdn || globalThis.SlopCdn;
      if (C && C.isCdnUrl(url)) return true;
      return HOST_ROOTS.some((root) => u.hostname === root || u.hostname.endsWith('.' + root));
    } catch (e) { return false; }
  }

  /** Human size: 4.5 MB, 980 KB. */
  function formatSize(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  /** Adds a family's models loaded after this file (aitools/ocr-models.js on a page that loads it on demand, Slop PDF).
   *  A model already in the index stays as it is. */
  function add(list) { for (const m of list || []) if (!byId(m.id)) MODELS.push(m); }
  return { MODELS, TOOLS, LICENCES, HOST_ROOTS, byId, remoteFiles, urlsOf, downloadBytes, problems, allowedUrl, formatSize, add };
});
