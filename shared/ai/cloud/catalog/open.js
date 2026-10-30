/* The AI provider catalog, groups 'fast' (fast inference chips) and 'open-models' (hosts of open-weight models). All
 * speak OpenAI Chat Completions (cloud/compat.js). Fields: catalog/main.js. CORS checked 2026-10-24 from
 * https://slopographic.com with tools/check-ai-cors.mjs; docs read the same day. Classic script. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const T = { tools: true, streaming: true }, TV = { tools: true, vision: true, streaming: true };
  (C.catalog = C.catalog || []).push(
    { id: 'groq', name: 'Groq', group: 'fast', rank: 1, format: 'openai-chat', base: 'https://api.groq.com/openai/v1',
      keyUrl: 'https://console.groq.com/keys', keyHint: 'gsk_…', where: 'console.groq.com › API Keys', modelsEndpoint: '/models', caps: TV, cors: 'verified',
      docs: 'https://console.groq.com/docs/openai', aliases: ['groq', 'lpu'],
      models: [{ id: 'openai/gpt-oss-120b', name: 'gpt-oss 120B' }, { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' }, { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', hint: 'fastest' }],
      prefer: [/^openai\/gpt-oss-120b$/, /llama-3\.3-70b/, /qwen/i, /llama-3\.1-8b/],
      free: { tier: 'free', rank: 2, verified: '2026-10-25', docs: 'https://console.groq.com/docs/rate-limits', signup: 'https://console.groq.com/keys', models: 'all',
         } },
    { id: 'cerebras', name: 'Cerebras', group: 'fast', rank: 2, format: 'openai-chat', base: 'https://api.cerebras.ai/v1',
      keyUrl: 'https://cloud.cerebras.ai/', where: 'cloud.cerebras.ai › API Keys', modelsEndpoint: '/models', caps: T, cors: 'verified',
      docs: 'https://inference-docs.cerebras.ai/resources/openai', aliases: ['cerebras', 'wafer'],
      models: [{ id: 'gpt-oss-120b', name: 'gpt-oss 120B' }, { id: 'qwen-3.8-27b', name: 'Qwen 3.8 27B' }], prefer: [/gpt-oss-120b/, /qwen/i, /llama/i],
      free: { tier: 'free-trial', rank: 5, verified: '2026-10-25', docs: 'https://inference-docs.cerebras.ai/support/rate-limits', signup: 'https://cloud.cerebras.ai/',
         } },
    { id: 'sambanova', name: 'SambaNova Cloud', who: 'SambaNova', group: 'fast', rank: 3, format: 'openai-chat', base: 'https://api.sambanova.ai/v1',
      keyUrl: 'https://cloud.sambanova.ai/apis', where: 'cloud.sambanova.ai › APIs', modelsEndpoint: '/models', caps: T, cors: 'needs-proxy',
      docs: 'https://docs.sambanova.ai/docs/en/features/openai-compatibility', aliases: ['sambanova', 'samba'],
      models: [{ id: 'DeepSeek-V3.1', name: 'DeepSeek V3.1' }, { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' }] },

    { id: 'together', name: 'Together AI', who: 'Together AI', short: 'Together', group: 'open-models', rank: 1, format: 'openai-chat', base: 'https://api.together.ai/v1',
      keyUrl: 'https://api.together.ai/settings/api-keys', where: 'api.together.ai › Settings › API keys', modelsEndpoint: '/models', caps: Object.assign({ images: true }, TV), cors: 'verified',
      docs: 'https://docs.together.ai/docs/openai-api-compatibility', aliases: ['together', 'togetherai'], modelHints: ['llama', 'qwen', 'deepseek', 'glm', 'kimi', 'flux'],
      models: [{ id: 'openai/gpt-oss-120b', name: 'gpt-oss 120B' }, { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo' }, { id: 'Qwen/Qwen3.6-Plus', name: 'Qwen 3.6 Plus' }],
      prefer: [/gpt-oss-120b/, /Qwen3/, /DeepSeek-V4/, /Llama-3\.3-70B/] },
    { id: 'fireworks', name: 'Fireworks AI', who: 'Fireworks AI', short: 'Fireworks', group: 'open-models', rank: 2, format: 'openai-chat', base: 'https://api.fireworks.ai/inference/v1',
      keyUrl: 'https://fireworks.ai/account/api-keys', keyHint: 'fw_…', where: 'fireworks.ai › Account › API Keys', modelsEndpoint: '/models', caps: TV, cors: 'verified',
      docs: 'https://docs.fireworks.ai/tools-sdks/openai-compatibility', aliases: ['fireworks'],
      models: [{ id: 'accounts/fireworks/models/kimi-k3', name: 'Kimi K3' }, { id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', name: 'Llama 3.1 8B' }], prefer: [/kimi/, /deepseek/, /qwen/, /llama/] },
    { id: 'deepinfra', name: 'DeepInfra', group: 'open-models', rank: 3, format: 'openai-chat', base: 'https://api.deepinfra.com/v1/openai',
      keyUrl: 'https://deepinfra.com/dash/api_keys', where: 'deepinfra.com › Dashboard › API keys', modelsEndpoint: '/models', caps: TV, cors: 'verified', maxTokens: 16000,
      docs: 'https://docs.deepinfra.com/chat/overview', aliases: ['deepinfra', 'deep infra'],
      models: [{ id: 'deepseek-ai/DeepSeek-V4-Flash-0731', name: 'DeepSeek V4 Flash' }], prefer: [/DeepSeek-V4/, /Qwen3/, /Llama-3\.3/] },
    { id: 'hyperbolic', name: 'Hyperbolic', group: 'open-models', rank: 4, format: 'openai-chat', base: 'https://api.hyperbolic.ai/inference/v1',
      keyUrl: 'https://app.hyperbolic.ai/settings', keyHint: 'sk_live_…', where: 'app.hyperbolic.ai › Settings', modelsEndpoint: '/models', caps: T, cors: 'verified',
      docs: 'https://hyperbolic.ai/docs/inference/text-apis.md', aliases: ['hyperbolic'],
      models: [{ id: 'glm-5.3', name: 'GLM 5.3' }, { id: 'qwen3.8-27b', name: 'Qwen 3.8 27B' }], prefer: [/glm/, /qwen/] },
    { id: 'novita', name: 'Novita AI', who: 'Novita AI', short: 'Novita', group: 'open-models', rank: 5, format: 'openai-chat', base: 'https://api.novita.ai/openai/v1',
      keyUrl: 'https://novita.ai/settings/key-management', where: 'novita.ai › Settings › Key management', modelsEndpoint: '/models', caps: T, cors: 'verified',
      docs: 'https://novita.ai/docs/guides/llm-api', aliases: ['novita'],
      models: [{ id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }], prefer: [/deepseek/, /qwen/, /llama/] },
    { id: 'nebius', name: 'Nebius Token Factory', who: 'Nebius', short: 'Nebius', group: 'open-models', rank: 6, format: 'openai-chat', base: 'https://api.tokenfactory.nebius.com/v1',
      keyUrl: 'https://tokenfactory.nebius.com/', where: 'tokenfactory.nebius.com › API keys', modelsEndpoint: '/models', caps: T, cors: 'verified',
      docs: 'https://docs.tokenfactory.nebius.com/quickstart', aliases: ['nebius', 'ai studio', 'token factory'],
      models: [{ id: 'deepseek-ai/DeepSeek-R1-0528', name: 'DeepSeek R1' }], prefer: [/DeepSeek/, /Qwen/, /Llama/] },
    { id: 'huggingface', name: 'Hugging Face Inference Providers', who: 'Hugging Face', short: 'Hugging Face', group: 'open-models', rank: 7, format: 'openai-chat', base: 'https://router.huggingface.co/v1',
      keyUrl: 'https://huggingface.co/settings/tokens', keyHint: 'hf_…',
      modelsEndpoint: '/models', caps: TV, cors: 'verified', docs: 'https://huggingface.co/docs/inference-providers',
      aliases: ['hugging face', 'huggingface', 'hf', 'router'],
      models: [{ id: 'openai/gpt-oss-120b', name: 'gpt-oss 120B' }, { id: 'Qwen/Qwen3.8-27B', name: 'Qwen 3.8 27B' }, { id: 'zai-org/GLM-5.3', name: 'GLM 5.3' }], prefer: [/gpt-oss-120b/, /Qwen3/, /GLM/, /DeepSeek/],
      free: { tier: 'none', verified: '2026-10-25', docs: 'https://huggingface.co/docs/inference-providers/pricing', signup: 'https://huggingface.co/settings/tokens',
         } },
  );
})();
