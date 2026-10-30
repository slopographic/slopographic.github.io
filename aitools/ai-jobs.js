/* Slop AI Tools: the assistant's jobs on the hub. A job is one tool on one file, run with the same engines as the tool
 * pages: the inference worker (common.js: OCR, speech, auto tags), the denoise filters (denoise/filters.js) and the
 * portrait model (shared/cutout, the picture by portrait/compose.js). A model that is not on this device is never
 * fetched here: the job says which model the person must download first (Get more…, then their own click on Download).
 * Classic script, loaded on demand by SlopCmd.prepare() (hub.js); sets window.SlopAIJobs:
 *   TOOLS                      { id: { name, accept: RegExp, models(options) → [model ids] } }
 *   missing(job)               the models the job needs that are not on this device: [{ id, name, size }]
 *   run(job, onStatus)         → { kind: 'image', blob, w, h } | { kind: 'text', text, lines } |
 *                                { kind: 'speech', segments, language, model } | { kind: 'tags', tags: [{ tag, p }] } */
(function (root) {
  'use strict';
  const T = () => root.SlopAITools, R = () => root.SlopAIModels, M = () => root.SlopAIManager, SP = () => root.SlopSpeechModels;
  const base = new URL('./', (root.document.currentScript && root.document.currentScript.src) || root.location.href).href;   // aitools/
  const one = (src) => new Promise((res, rej) => root.document.head.append(Object.assign(root.document.createElement('script'),
    { src: new URL(src, base).href, async: false, onload: res, onerror: () => rej(new Error('Could not load ' + src)) })));
  const IMAGE = /^image\//;
  /** The status words the person reads (aitools/i18n/<code>/hub.js). */
  const L = (k) => (root.SlopI18n ? root.SlopI18n.t(k) : k);

  const TOOLS = {
    denoise: { name: 'Denoise', accept: IMAGE, models: () => [] },
    portrait: { name: 'Portrait blur', accept: IMAGE, models: () => ['modnet-portrait'] },
    tags: { name: 'Auto tags', accept: IMAGE, models: () => ['mobilenetv3-l100'] },
    ocr: { name: 'OCR', accept: IMAGE, models: (o) => [o.model || 'ppocr-v4'] },
    speech: { name: 'Speech to text', accept: /^(audio|video)\//, models: (o) => [...new Set([SP().QUICK, o.model || SP().QUICK])] },
  };
  const usable = (s) => /^(installed|update|bundled)$/.test(s);

  async function missing(job) {
    const out = [];
    for (const id of TOOLS[job.tool].models(job.options)) {
      const m = R().byId(id);
      if (!m) throw new Error(`Unknown model “${id}”. The hub lists the models it knows (app_state).`);
      if (!usable(await M().status(id))) out.push({ id, name: m.name, size: R().formatSize(R().downloadBytes(m)) });
    }
    return out;
  }

  /** The picture as RGBA at most 2048 px on its long side (as the Denoise page reads it). */
  async function rgbaOf(blob) {
    const img = await T().image(blob, { maxSide: 2048 }), c = root.document.createElement('canvas');
    c.width = img.w; c.height = img.h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img.bitmap, 0, 0); img.bitmap.close && img.bitmap.close();
    return { w: img.w, h: img.h, rgba: g.getImageData(0, 0, img.w, img.h).data };
  }
  const png = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

  const RUN = {
    async denoise(job) {
      if (!root.SlopAIFilters) await one('denoise/filters.js');
      const src = await rgbaOf(job.file.blob);
      const out = root.SlopAIFilters.denoise(src.rgba, src.w, src.h, { mode: job.options.mode || 'both', strength: job.options.strength == null ? 50 : job.options.strength });
      const c = root.document.createElement('canvas'); c.width = src.w; c.height = src.h;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out), src.w, src.h), 0, 0);
      return { kind: 'image', blob: await png(c), w: src.w, h: src.h };
    },
    async portrait(job, onStatus) {
      if (!root.SlopCutout) for (const f of ['../shared/cutout/pipeline.js', '../shared/cutout/models.js', '../shared/cutout/cutout.js']) await one(f);
      if (!root.SlopAIPortrait) await one('portrait/compose.js');
      onStatus(L('aitools.job.finding_person'));
      const img = await T().image(job.file.blob);
      const r = await root.SlopCutout.removeBackground(job.file.blob, { model: 'portrait', keep: false });
      const c = root.SlopAIPortrait.compose(img.bitmap, img.w, img.h, { mask: r.mask, maskW: r.width, maskH: r.height }, job.options.strength == null ? 60 : job.options.strength);
      return { kind: 'image', blob: await png(c), w: img.w, h: img.h };
    },
    async tags(job, onStatus) {
      await T().ensure('mobilenetv3-l100', onStatus);
      const img = await T().image(job.file.blob);
      const r = await T().call('classify', { bitmap: img.bitmap, w: img.w, h: img.h }, { transfer: [img.bitmap] });
      const min = job.options.min_confidence == null ? 0.02 : job.options.min_confidence;
      if (!root.SlopTags) await one('../shared/tags/tags.js');
      return { kind: 'tags', tags: r.tags.filter((t) => t.p >= min).map((t) => ({ tag: root.SlopTags.norm(t.label), p: Math.round(t.p * 1000) / 1000 })) };
    },
    async ocr(job, onStatus) {
      const model = job.options.model || 'ppocr-v4';
      await T().ensure(model, onStatus);
      const img = await T().image(job.file.blob);
      const r = await T().call('ocr', { model, bitmap: img.bitmap, w: img.w, h: img.h }, { transfer: [img.bitmap] });
      return { kind: 'text', text: r.lines.map((l) => l.text).join('\n'), lines: r.lines.length };
    },
    async speech(job, onStatus) {
      onStatus(L('aitools.job.decoding'));
      const samples = await T().audioSamples(job.file.blob), C = SP();
      if (samples.length / 16000 > 2 * 3600) throw new Error('The audio is longer than 2 hours.');
      if (samples.length < 8000) throw new Error('The audio is too short to transcribe.');
      await T().ensure(C.QUICK, onStatus);
      let lang = job.options.language || 'auto';
      if (lang === 'auto') lang = (await T().call('detect', { model: C.QUICK, samples: samples.slice(0, 30 * 16000) })).languages[0].code;
      const use = job.options.model || C.QUICK;
      if (!C.fits(C.byId(use), lang)) throw new Error(`${C.byId(use).name} does not read the language “${lang}”. Choose another model with set_options.`);
      await T().ensure(use, onStatus);
      const r = await T().call('transcribe', { model: use, samples, language: lang }, { transfer: [samples.buffer] });
      return { kind: 'speech', segments: r.segments, language: r.language, model: use };
    },
  };

  async function run(job, onStatus = () => {}) {
    if (!job.file) throw new Error('The job has no file: add_file first');
    const need = await missing(job);
    if (need.length) {
      throw new Error(`${TOOLS[job.tool].name} needs ${need.map((m) => `${m.name} (${m.size})`).join(' and ')}, which is not on this device. `
        + 'Nothing downloads without the person: use request_model to show them the download dialog, where they confirm it.');
    }
    if (!root.SlopAITools) await one('common.js');
    if (!root.SlopTranscript) await one('transcript.js');
    return RUN[job.tool](job, onStatus);
  }

  root.SlopAIJobs = { TOOLS, missing, run, load: one };
})(window);
