/* The AI provider catalog, group 'other' ("More" in the picker): model makers with an API of their own that also speaks
 * OpenAI Chat Completions (cloud/compat.js). Fields: catalog/main.js. CORS checked 2026-10-24 from
 * https://slopographic.com with tools/check-ai-cors.mjs; docs read the same day. Classic script. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const T = { tools: true, streaming: true }, TV = { tools: true, vision: true, streaming: true };
  (C.catalog = C.catalog || []).push(
    { id: 'mistral', name: 'Mistral AI', who: 'Mistral AI', short: 'Mistral', group: 'other', rank: 1, format: 'openai-chat', base: 'https://api.mistral.ai/v1',
      keyUrl: 'https://console.mistral.ai/api-keys', where: 'console.mistral.ai › API Keys', modelsEndpoint: '/models', caps: TV, cors: 'verified',
      docs: 'https://docs.mistral.ai/api/', aliases: ['mistral', 'le chat', 'codestral', 'magistral'],
      models: [{ id: 'mistral-large-latest', name: 'Mistral Large' }, { id: 'mistral-medium-latest', name: 'Mistral Medium' }, { id: 'mistral-small-latest', name: 'Mistral Small' }],
      prefer: [/^mistral-large-latest$/, /^mistral-medium-latest$/, /^mistral-small-latest$/],
      free: { tier: 'free', rank: 4, verified: '2026-10-25', docs: 'https://docs.mistral.ai/admin/billing-usage/usage-limits', signup: 'https://console.mistral.ai/api-keys',
         } },
    { id: 'xai', name: 'Grok (xAI)', who: 'xAI', short: 'Grok', group: 'other', rank: 2, format: 'openai-chat', base: 'https://api.x.ai/v1',
      keyUrl: 'https://console.x.ai/', keyHint: 'xai-…', where: 'console.x.ai › API Keys', modelsEndpoint: '/models', caps: Object.assign({ images: true }, TV), cors: 'verified',
      docs: 'https://docs.x.ai/docs/api-reference', aliases: ['grok', 'xai', 'x.ai', 'twitter'],
      models: [{ id: 'grok-4.7', name: 'Grok 4.7' }, { id: 'grok-4.6', name: 'Grok 4.6' }], prefer: [/^grok-4\.7$/, /^grok-4/] },
    { id: 'deepseek', name: 'DeepSeek', group: 'other', rank: 3, format: 'openai-chat', base: 'https://api.deepseek.com',
      keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'sk-…', where: 'platform.deepseek.com › API keys', modelsEndpoint: '/models', caps: T, cors: 'verified',
      docs: 'https://api-docs.deepseek.com/', aliases: ['deepseek', 'deep seek'],
      models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }, { id: 'deepseek-flash', name: 'DeepSeek Flash', hint: 'fast_cheap' }] },
    { id: 'perplexity', name: 'Perplexity (Sonar)', who: 'Perplexity', short: 'Perplexity', group: 'other', rank: 4, format: 'openai-chat', base: 'https://api.perplexity.ai',
      keyUrl: 'https://www.perplexity.ai/account/api/keys', keyHint: 'pplx-…', where: 'perplexity.ai › Settings › API', modelsEndpoint: false, caps: { streaming: true }, cors: 'verified',
      docs: 'https://docs.perplexity.ai/guides/chat-completions-guide',
      aliases: ['perplexity', 'sonar', 'pplx', 'search'],
      models: [{ id: 'sonar', name: 'Sonar' }, { id: 'sonar-pro', name: 'Sonar Pro' }] },
    { id: 'cohere', name: 'Cohere (Compatibility API)', who: 'Cohere', short: 'Cohere', group: 'other', rank: 5, format: 'openai-chat', base: 'https://api.cohere.ai/compatibility/v1',
      keyUrl: 'https://dashboard.cohere.com/api-keys', where: 'dashboard.cohere.com › API keys', modelsEndpoint: false, caps: T, cors: 'verified', usageOption: false,
      docs: 'https://docs.cohere.com/docs/compatibility-api', aliases: ['cohere', 'command'],
      models: [{ id: 'command-a-plus-05-2026', name: 'Command A Plus' }, { id: 'command-a-vision-07-2025', name: 'Command A Vision' }] },
    { id: 'ai21', name: 'AI21 (Jamba)', who: 'AI21 Labs', short: 'AI21', group: 'other', rank: 6, format: 'openai-chat', base: 'https://api.ai21.com/studio/v1',
      keyUrl: 'https://studio.ai21.com/account/api-key', where: 'AI21 Studio › Settings › API Keys', modelsEndpoint: false, caps: { streaming: true }, cors: 'verified', usageOption: false,
      docs: 'https://docs.ai21.com/reference/jamba-1-6-api-ref', aliases: ['ai21', 'jamba'],
      models: [{ id: 'jamba-large', name: 'Jamba Large' }, { id: 'jamba-mini', name: 'Jamba Mini' }] },
    { id: 'moonshot', name: 'Kimi (Moonshot AI)', who: 'Moonshot AI', short: 'Kimi', group: 'other', rank: 7, format: 'openai-chat', base: 'https://api.moonshot.ai/v1',
      keyUrl: 'https://platform.kimi.ai/console/api-keys', keyHint: 'sk-…', where: 'platform.kimi.ai › API keys', modelsEndpoint: '/models', caps: TV, cors: 'verified',
      docs: 'https://platform.kimi.ai/docs/guide/start-using-kimi-api', aliases: ['kimi', 'moonshot'],
      models: [{ id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro' }, { id: 'kimi-k3.1-pro-highspeed', name: 'Kimi K3.1 Pro (high speed)' }] },
    { id: 'qwen', name: 'Qwen (Alibaba Cloud Model Studio)', who: 'Alibaba Cloud', short: 'Qwen', group: 'other', rank: 8, format: 'openai-chat', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      keyUrl: 'https://modelstudio.console.alibabacloud.com/', keyHint: 'sk-…', modelsEndpoint: '/models', caps: TV, cors: 'verified',
      docs: 'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope',
      aliases: ['qwen', 'alibaba', 'dashscope', 'tongyi', 'model studio'],
      models: [{ id: 'qwen3.8-max', name: 'Qwen 3.8 Max' }, { id: 'qwen-plus', name: 'Qwen Plus' }], prefer: [/^qwen3\.\d-max$/, /^qwen-plus$/, /^qwen-max$/] },
    { id: 'zai', name: 'GLM (Z.ai)', who: 'Z.ai', short: 'Z.ai', group: 'other', rank: 9, format: 'openai-chat', base: 'https://api.z.ai/api/paas/v4', caps: TV, cors: 'needs-proxy', modelsEndpoint: false,
      keyUrl: 'https://z.ai/manage-apikey/apikey-list', docs: 'https://docs.z.ai/api-reference/llm/chat-completion', aliases: ['glm', 'zhipu', 'z.ai', 'chatglm'],
      models: [{ id: 'glm-5.3', name: 'GLM 5.3' }] },
    { id: 'bigmodel', name: 'GLM (Zhipu, bigmodel.cn)', who: 'Zhipu AI', short: 'Zhipu', group: 'other', rank: 10, format: 'openai-chat', base: 'https://open.bigmodel.cn/api/paas/v4', caps: TV, cors: 'needs-proxy', modelsEndpoint: false,
      keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', docs: 'https://docs.bigmodel.cn/cn/guide/develop/http/introduction', aliases: ['glm', 'zhipu', 'bigmodel', 'chatglm'],
      models: [{ id: 'glm-5.3', name: 'GLM 5.3' }] },
  );
})();
