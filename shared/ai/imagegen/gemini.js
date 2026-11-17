/* SlopAIKit imageGen format 'gemini': Google's picture models through the Gemini API's Interactions endpoint
 * (POST https://generativelanguage.googleapis.com/v1beta/interactions, key in x-goog-api-key), the way Google's image
 * generation guide shows it (ai.google.dev/gemini-api/docs/image-generation and the interactions-v1 OpenAPI file,
 * checked 2026-10-24). Classic script; adds SlopAIKit.imageGen.formats.gemini = { build(req, cfg), parse(json, req) }.
 *   request: { model, input: [{ type: 'text', text }, { type: 'image', mime_type, data }?], store: false,
 *              response_format: { type: 'image', aspect_ratio: '16:9', image_size: '1K' | '2K' | '4K' } }
 *   answer:  { status, steps: [{ type: 'model_output', content: [{ type: 'image', mime_type, data } | { type: 'text' }] }],
 *              usage: { total_input_tokens, total_output_tokens, output_tokens_by_modality: [{ modality, tokens }] } }
 * One picture per request (n pictures = n requests). No mask: an edit inside a selection is put back inside it by the
 * app (run.js). store: false, so Google keeps no copy for later retrieval. Sizes take an uppercase K. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const G = (K.imageGen = K.imageGen || {}); G.formats = G.formats || {};
  const BASE = 'https://generativelanguage.googleapis.com';
  const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:8', '8:1', '1:4', '4:1'];
  const root = (cfg) => String(cfg.base || BASE).replace(/\/+$/, '').replace(/\/v1(beta)?$/, '');

  function build(req, cfg) {
    const input = [{ type: 'text', text: req.prompt }];
    if (req.image) input.push({ type: 'image', mime_type: req.image.mime || 'image/png', data: req.image.data });
    const lite = /flash-lite/.test(req.model);
    const fmt = { type: 'image', image_size: lite ? '1K' : String(req.resolution || '1K').toUpperCase() };
    if (ASPECTS.includes(req.aspect)) fmt.aspect_ratio = req.aspect;
    const body = { model: String(req.model).replace(/^models\//, ''), input, response_format: fmt, store: false };
    return { url: root(cfg) + '/v1beta/interactions', init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key }, body: JSON.stringify(body) } };
  }

  /** Every content block of the model's output: the steps (current schema) or outputs (the first published one). */
  function blocks(j) {
    if (Array.isArray(j.steps)) return j.steps.filter((s) => s && s.type === 'model_output').flatMap((s) => s.content || []);
    if (Array.isArray(j.outputs)) return j.outputs;
    return [];
  }
  function parse(j) {
    j = j || {};
    const bs = blocks(j);
    const images = bs.filter((b) => b && b.type === 'image' && b.data).map((b) => ({ data: b.data, mime: b.mime_type || 'image/png' }));
    const text = bs.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('').trim();
    const u = j.usage || {}, img = (u.output_tokens_by_modality || []).find((m) => String(m.modality).toLowerCase() === 'image');
    const usage = { input: u.total_input_tokens || 0, output: (u.total_output_tokens || 0) + (u.total_thought_tokens || 0), imageTokens: img ? img.tokens : 0, images: images.length };
    const failed = j.status === 'failed' || (j.error && j.error.message);
    return { images, usage, text, refused: !images.length, failed: failed ? String((j.error && j.error.message) || 'the request failed') : '' };
  }

  G.formats.gemini = { build, parse, root, perRequest: 1, ASPECTS };
})();
