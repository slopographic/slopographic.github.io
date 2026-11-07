/* The AI provider catalog, group 'cloud': your own deployment at a cloud (RunPod, Azure, AWS, Cloudflare, Google
 * Cloud). Addresses are templates: the form asks for the {fields}. Fields: catalog/main.js. CORS checked 2026-10-24
 * from https://slopographic.com with tools/check-ai-cors.mjs; docs read the same day. Classic script. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const TV = { tools: true, vision: true, streaming: true };
  (C.catalog = C.catalog || []).push(
    { id: 'runpod', name: 'RunPod Serverless (vLLM)', who: 'RunPod', short: 'RunPod', group: 'cloud', rank: 1, format: 'openai-chat',
      base: 'https://api.runpod.ai/v2/{endpointId}/openai/v1',
      fields: [{ id: 'endpointId' }],
      keyUrl: 'https://console.runpod.io/user/settings', keyHint: 'rpa_…', where: 'console.runpod.io › Settings › API Keys', modelsEndpoint: '/models', caps: TV, cors: 'verified',
      docs: 'https://docs.runpod.io/serverless/vllm/openai-compatibility',
      aliases: ['runpod', 'run pod', 'serverless', 'vllm worker', 'gpu'] },
    { id: 'azure', name: 'Azure OpenAI (v1 API)', who: 'Microsoft Azure', short: 'Azure', group: 'cloud', rank: 2, format: 'openai-chat',
      base: 'https://{resource}.openai.azure.com/openai/v1', auth: { header: 'api-key' },
      fields: [{ id: 'resource', placeholder: 'my-openai', sample: 'example' }],
      keyUrl: 'https://ai.azure.com/', modelsEndpoint: '/models', caps: TV, cors: 'verified',
      docs: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle',
      aliases: ['azure', 'microsoft', 'foundry', 'openai'] },
    { id: 'azure-classic', name: 'Azure OpenAI (deployment and api-version)', who: 'Microsoft Azure', short: 'Azure', group: 'cloud', rank: 3, format: 'openai-chat',
      base: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}?api-version={apiVersion}', auth: { header: 'api-key' },
      fields: [{ id: 'resource', placeholder: 'my-openai', sample: 'example' }, { id: 'deployment', placeholder: 'gpt-4o' },
        { id: 'apiVersion', default: '2024-10-21' }],
      keyUrl: 'https://ai.azure.com/', modelsEndpoint: false, caps: TV, cors: 'verified',
      docs: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/reference',
      aliases: ['azure', 'api-version', 'deployment'], models: [{ id: 'deployment', hint: 'by_address', madeBy: 'openai' }] },
    { id: 'bedrock', name: 'Amazon Bedrock (API key)', who: 'Amazon Web Services', short: 'Bedrock', group: 'cloud', rank: 4, format: 'openai-chat',
      base: 'https://bedrock-mantle.{region}.api.aws/v1',
      fields: [{ id: 'region', default: 'us-east-1' }],
      keyUrl: 'https://console.aws.amazon.com/bedrock/home#/api-keys', modelsEndpoint: '/models', caps: { tools: true, streaming: true }, cors: 'verified',
      docs: 'https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html',
      aliases: ['aws', 'amazon', 'bedrock', 'mantle'],
      models: [{ id: 'openai.gpt-oss-120b-1:0', name: 'gpt-oss 120B' }] },
    { id: 'bedrock-sigv4', name: 'Amazon Bedrock (IAM access keys)', who: 'Amazon Web Services', short: 'Bedrock', group: 'cloud', rank: 5, format: 'openai-chat',
      base: 'https://bedrock-runtime.{region}.amazonaws.com/openai/v1', fields: [{ id: 'region', default: 'us-east-1' }], caps: { tools: true }, cors: 'needs-proxy', blocker: 'auth', modelsEndpoint: false,
      docs: 'https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html', aliases: ['aws', 'sigv4', 'iam', 'bedrock runtime'] },
    { id: 'cloudflare', name: 'Cloudflare Workers AI', who: 'Cloudflare', short: 'Workers AI', group: 'cloud', rank: 6, format: 'openai-chat',
      base: 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1',
      fields: [{ id: 'accountId' }],
      keyUrl: 'https://dash.cloudflare.com/profile/api-tokens', caps: { tools: true, streaming: true }, cors: 'needs-proxy', modelsEndpoint: false,
      docs: 'https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/', aliases: ['cloudflare', 'workers ai', 'cf'],
      models: [{ id: '@cf/openai/gpt-oss-120b', name: 'gpt-oss 120B' }] },
    { id: 'vertex', name: 'Google Vertex AI', who: 'Google Cloud', short: 'Vertex', group: 'cloud', rank: 7, format: 'openai-chat',
      base: 'https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/openapi',
      fields: [{ id: 'project' }, { id: 'location', default: 'us-central1' }], caps: TV, cors: 'needs-proxy', blocker: 'auth', modelsEndpoint: false,
      docs: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/migrate/openai/overview', aliases: ['vertex', 'google cloud', 'gcp'] },
  );
})();
