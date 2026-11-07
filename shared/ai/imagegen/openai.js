/* SlopAIKit imageGen format 'openai': OpenAI's Image API, also spoken by OpenAI-compatible servers (a local server, a
 * custom address). Classic script; adds SlopAIKit.imageGen.formats.openai = { build(req, cfg), parse(json, req), images }.
 *   generate: POST <base>/images/generations, JSON { model, prompt, n, size: 'WxH', quality, background, output_format }
 *   edit:     POST <base>/images/edits, multipart/form-data: image[] (PNG), mask (PNG whose fully transparent pixels
 *             are the part to change, same size as the image), prompt, model, n, size 'auto', quality, background
 *   answer:   { data: [{ b64_json }], usage: { input_tokens, input_tokens_details: { text_tokens, image_tokens },
 *             output_tokens } } (developers.openai.com/api/docs/guides/image-generation, checked 2026-10-24).
 * GPT Image models always answer in base64 and refuse response_format, so it is sent only to other servers, which
 * often answer with a URL otherwise. Transparent backgrounds need PNG or WebP output; PNG is always asked for. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const G = (K.imageGen = K.imageGen || {}); G.formats = G.formats || {};
  const BASE = 'https://api.openai.com/v1';
  const root = (cfg) => String(cfg.base || BASE).replace(/\/+$/, '');
  const isOpenAI = (cfg) => !cfg.base || /^https:\/\/api\.openai\.com\//.test(root(cfg) + '/');
  const auth = (cfg) => (cfg.key ? { authorization: 'Bearer ' + cfg.key } : {});

  function fields(req, cfg) {
    const o = { model: req.model, prompt: req.prompt, n: Math.max(1, Math.min(10, Number(req.n) || 1)) };
    const official = isOpenAI(cfg);
    if (req.quality && (official || cfg.provider && cfg.provider.quality)) o.quality = req.quality;
    if (req.transparent) { o.background = 'transparent'; o.output_format = 'png'; } else if (official) o.output_format = 'png';
    if (!official) o.response_format = 'b64_json';
    return o;
  }

  function build(req, cfg) {
    const o = fields(req, cfg);
    if (!req.image) {
      o.size = req.w && req.h ? `${req.w}x${req.h}` : 'auto';
      return { url: root(cfg) + '/images/generations', init: { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, auth(cfg)), body: JSON.stringify(o) } };
    }
    o.size = isOpenAI(cfg) ? 'auto' : `${req.image.width}x${req.image.height}`;
    const fd = new FormData();
    for (const [k, v] of Object.entries(o)) fd.append(k, String(v));
    fd.append('image[]', req.image.blob, 'image.png');
    if (req.mask) fd.append('mask', req.mask.blob, 'mask.png');
    return { url: root(cfg) + '/images/edits', init: { method: 'POST', headers: auth(cfg), body: fd } };   // the browser sets the multipart boundary
  }

  /** { images: [{ data (base64) | url, mime }], usage: { input, output, input_details }, text } */
  function parse(j) {
    const images = ((j && j.data) || []).map((d) => (d.b64_json ? { data: d.b64_json, mime: 'image/' + ((j.output_format || 'png').replace('jpg', 'jpeg')) } : d.url ? { url: d.url } : null)).filter(Boolean);
    const u = (j && j.usage) || {};
    return { images, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, input_details: u.input_tokens_details || null }, text: '' };
  }

  G.formats.openai = { build, parse, root, perRequest: 10 };
})();
