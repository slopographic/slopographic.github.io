/* SlopAIKit imageGen format 'openrouter': OpenRouter's Image API (POST https://openrouter.ai/api/v1/images), one key
 * for many picture models (openrouter.ai/docs/features/multimodal/image-generation, checked 2026-10-24). Classic
 * script; adds SlopAIKit.imageGen.formats.openrouter = { build(req, cfg), parse(json), models(cfg), fit(req, model) }.
 *   request: { model, prompt, n, aspect_ratio, resolution: '1K' | '2K' | '4K', quality, background, output_format,
 *              input_references: [{ type: 'image_url', image_url: { url: 'data:…' } }] (edits) }
 *   answer:  { data: [{ b64_json, media_type }], usage: { prompt_tokens, completion_tokens, cost ($) } }
 *   models:  GET /api/v1/images/models (public, no key): each model's supported_parameters (aspect_ratio and
 *            resolution values, n and input_references ranges, background), and GET /api/v1/models?output_modalities=image
 *            for a price per picture where the model has one. No mask parameter: run.js keeps an edit inside the selection. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const G = (K.imageGen = K.imageGen || {}); G.formats = G.formats || {};
  const BASE = 'https://openrouter.ai/api/v1';
  const root = (cfg) => String(cfg.base || BASE).replace(/\/+$/, '');
  function headers(cfg) {
    const p = K.cloud && K.cloud.byId ? K.cloud.byId('openrouter') : null;
    return Object.assign({ 'content-type': 'application/json' }, (p && p.headers) || {}, cfg.key ? { authorization: 'Bearer ' + cfg.key } : {});
  }
  const values = (sp, k) => (sp && sp[k] && Array.isArray(sp[k].values) ? sp[k].values : null);

  /** The request adjusted to what the model takes: the nearest aspect and resolution it lists, n within its range. */
  function fit(req, m) {
    const sp = (m && m.params) || {}, out = Object.assign({}, req), notes = [];
    const ar = values(sp, 'aspect_ratio'), rs = values(sp, 'resolution');
    if (ar && req.aspect && !ar.includes(req.aspect)) { out.aspect = ar.includes('1:1') ? '1:1' : ar[0]; notes.push(`${m.name || m.id} has no ${req.aspect}; used ${out.aspect}`); }
    if (rs && req.resolution && !rs.includes(req.resolution)) { out.resolution = rs.includes('1K') ? '1K' : rs[0]; notes.push(`used ${out.resolution}`); }
    if (sp.n && sp.n.max && out.n > sp.n.max) out.n = sp.n.max;
    if (req.transparent && !(values(sp, 'background') || []).includes('transparent') && m && m.params) { out.transparent = false; notes.push('this model cannot make a transparent background'); }
    return { req: out, notes };
  }

  function build(req, cfg) {
    const body = { model: req.model, prompt: req.prompt, n: Math.max(1, Number(req.n) || 1) };
    if (req.aspect) body.aspect_ratio = req.aspect;
    if (req.resolution) body.resolution = req.resolution;
    if (req.quality) body.quality = req.quality;
    if (req.transparent) { body.background = 'transparent'; body.output_format = 'png'; }
    if (req.image) body.input_references = [{ type: 'image_url', image_url: { url: `data:${req.image.mime || 'image/png'};base64,${req.image.data}` } }];
    return { url: root(cfg) + '/images', init: { method: 'POST', headers: headers(cfg), body: JSON.stringify(body) } };
  }

  function parse(j) {
    const images = ((j && j.data) || []).map((d) => (d.b64_json ? { data: d.b64_json, mime: d.media_type || 'image/png' } : d.url ? { url: d.url } : null)).filter(Boolean);
    const u = (j && j.usage) || {};
    return { images, usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, cost: u.cost != null ? Number(u.cost) : null }, text: '' };
  }

  /** The picture models, with what each takes and its price per picture when it has one. Cached for the visit. */
  let cache = null;
  async function models(cfg = {}) {
    if (cache) return cache;
    const get = (u) => fetch(u, { signal: cfg.signal }).then((r) => (r.ok ? r.json() : { data: [] }));
    const [img, priced] = await Promise.all([get(root(cfg) + '/images/models'), get(root(cfg) + '/models?output_modalities=image').catch(() => ({ data: [] }))]);
    const price = new Map((priced.data || []).map((m) => [m.id, Number((m.pricing || {}).image) || 0]));
    cache = (img.data || []).map((m) => {
      const sp = m.supported_parameters || {}, refs = sp.input_references || {};
      return { id: m.id, name: m.name || m.id, params: sp, edits: (refs.max || 0) > 0, generates: !(refs.min > 0), price: price.get(m.id) ? { image: price.get(m.id) } : null };
    });
    return cache;
  }

  G.formats.openrouter = { build, parse, models, fit, root, perRequest: 10, _reset: () => { cache = null; } };
})();
