/* The AI provider catalog, group 'images': picture makers. Their formats are spoken by shared/ai/imagegen (one file
 * per format, registered with imageGen.register); the chat form keeps their key (by this id) for AI pictures and
 * offers no chat. OpenAI, Gemini and OpenRouter make pictures with the keys in Main. Fields: catalog/main.js. CORS checked
 * 2026-10-24 from https://slopographic.com with tools/check-ai-cors.mjs; docs read the same day. Classic script. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const I = { group: 'images', caps: { images: true }, modelsEndpoint: false };
  const add = (e) => Object.assign({}, I, e);
  (C.catalog = C.catalog || []).push(
    add({ id: 'fal', name: 'fal.ai', who: 'fal', short: 'fal', rank: 1, format: 'fal', base: 'https://queue.fal.run', auth: { header: 'authorization', prefix: 'Key ' },
      keyUrl: 'https://fal.ai/dashboard/keys', where: 'fal.ai › Dashboard › Keys', cors: 'verified', docs: 'https://docs.fal.ai/model-apis/model-endpoints/queue',
      aliases: ['fal', 'flux', 'fal.ai'],
      models: [{ id: 'fal-ai/flux/schnell', name: 'FLUX.1 schnell' }, { id: 'fal-ai/flux/dev', name: 'FLUX.1 dev' }, { id: 'fal-ai/flux-2-flex', name: 'FLUX.2 flex' }] }),
    add({ id: 'together-images', who: 'Together AI', short: 'Together', rank: 2, format: 'openai-images', base: 'https://api.together.ai/v1', keyOf: 'together',
      keyUrl: 'https://api.together.ai/settings/api-keys', cors: 'verified', docs: 'https://docs.together.ai/reference/post-images-generations',
      aliases: ['together', 'flux'],
      models: [{ id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 schnell' }, { id: 'black-forest-labs/FLUX.2-dev', name: 'FLUX.2 dev' }, { id: 'black-forest-labs/FLUX.1.1-pro', name: 'FLUX1.1 pro' }] }),
    add({ id: 'stability', name: 'Stability AI', who: 'Stability AI', short: 'Stability', rank: 3, format: 'stability', base: 'https://api.stability.ai/v2beta/stable-image/generate',
      keyUrl: 'https://platform.stability.ai/account/keys', keyHint: 'sk-…', where: 'platform.stability.ai › API keys', cors: 'verified',
      docs: 'https://platform.stability.ai/docs/api-reference', aliases: ['stability', 'stable diffusion', 'sd3', 'sdxl'],
      models: [{ id: 'ultra', name: 'Stable Image Ultra' }, { id: 'core', name: 'Stable Image Core' }, { id: 'sd3', name: 'Stable Diffusion 3.5' }] }),
    add({ id: 'recraft', name: 'Recraft', rank: 4, format: 'openai-images', base: 'https://external.api.recraft.ai/v1',
      keyUrl: 'https://www.recraft.ai/profile/api', where: 'recraft.ai › Profile › API', cors: 'verified', docs: 'https://www.recraft.ai/docs',
      aliases: ['recraft', 'vector', 'svg'],
      models: [{ id: 'recraftv4_1', name: 'Recraft V4.1' }, { id: 'recraftv4_1_flash', name: 'Recraft V4.1 Flash' }, { id: 'recraftv3_vector', name: 'Recraft V3 vector' }] }),
    add({ id: 'runpod-images', who: 'RunPod', short: 'RunPod', rank: 5, format: 'runpod-sync', base: 'https://api.runpod.ai/v2/{endpointId}', keyOf: 'runpod',
      fields: [{ id: 'endpointId', default: 'black-forest-labs-flux-1-schnell' }],
      keyUrl: 'https://console.runpod.io/user/settings', cors: 'verified', docs: 'https://docs.runpod.io/hub/public-endpoints',
      aliases: ['runpod', 'flux', 'public endpoints'],
      models: [{ id: 'default', madeBy: 'bfl' }] }),
    add({ id: 'replicate', name: 'Replicate', rank: 6, format: 'replicate', base: 'https://api.replicate.com/v1', keyHint: 'r8_…', keyUrl: 'https://replicate.com/account/api-tokens',
      cors: 'needs-proxy', docs: 'https://replicate.com/docs/reference/http', aliases: ['replicate'] }),
    add({ id: 'bfl', name: 'Black Forest Labs (FLUX API)', who: 'Black Forest Labs', short: 'BFL', rank: 7, format: 'bfl', base: 'https://api.bfl.ai/v1', auth: { header: 'x-key' },
      keyUrl: 'https://dashboard.bfl.ai/', cors: 'needs-proxy',
      docs: 'https://docs.bfl.ai/quick_start/generating_images', aliases: ['flux', 'bfl', 'black forest'] }),
    add({ id: 'ideogram', name: 'Ideogram', rank: 8, format: 'ideogram', base: 'https://api.ideogram.ai', auth: { header: 'Api-Key' }, keyUrl: 'https://ideogram.ai/manage-api',
      cors: 'needs-proxy', docs: 'https://developer.ideogram.ai/api-reference', aliases: ['ideogram', 'text in images'] }),
  );
})();
