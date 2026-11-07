/* The AI provider catalog, group 'local': model servers on this computer (or, over https, on your network), all
 * OpenAI Chat Completions (cloud/compat.js), each with its default port and the one setting that lets this website
 * use it (setup: plain lines, {site} = this website's origin). Flags and ports from each server's docs or source,
 * read 2026-10-24. cors 'unknown': it depends on how the server was started (cloud/local.js diagnoses it). Classic script. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const L = { group: 'local', format: 'openai-chat', local: true, auth: 'none', cors: 'unknown', modelsEndpoint: '/models', caps: { tools: true, streaming: true }, models: [], prefer: [/./] };
  // a server on this computer is free: no account, no limits but the computer's own (each of these servers is free to download and run)
  const FREE = { tier: 'free', rank: 9, verified: '2026-10-25', training: null };   // its note: ui.ai.prov.local_free_note (the words people read are in shared/i18n/ui)
  const add = (e) => Object.assign({}, L, e, e.anyAddress ? {} : { free: Object.assign({ docs: e.docs, signup: e.docs }, FREE) });
  (C.catalog = C.catalog || []).push(
    add({ id: 'ollama', short: 'Ollama', rank: 1, base: 'http://localhost:11434/v1', port: 11434,
      docs: 'https://docs.ollama.com/api/openai-compatibility', aliases: ['ollama', 'local'], prefer: [/qwen|llama|mistral|gemma/i] }),
    add({ id: 'lmstudio', short: 'LM Studio', rank: 2, base: 'http://localhost:1234/v1', port: 1234, usageOption: false,
      docs: 'https://lmstudio.ai/docs/developer/core/server', aliases: ['lm studio', 'lmstudio', 'lms'] }),
    add({ id: 'vllm', short: 'vLLM', rank: 3, base: 'http://localhost:8000/v1', port: 8000, auth: 'optional',
      docs: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html', aliases: ['vllm'] }),
    add({ id: 'llamacpp', short: 'llama.cpp', rank: 4, base: 'http://localhost:8080/v1', port: 8080, altPorts: [9931], auth: 'optional',
      docs: 'https://github.com/ggml-org/llama.cpp/tree/master/tools/server', aliases: ['llama.cpp', 'llamacpp', 'llama-server', 'gguf'] }),
    add({ id: 'jan', short: 'Jan', rank: 5, base: 'http://127.0.0.1:1337/v1', port: 1337, auth: 'optional',
      docs: 'https://www.jan.ai/docs/desktop/api-server', aliases: ['jan', 'jan.ai'] }),
    add({ id: 'localai', name: 'LocalAI', who: 'LocalAI', short: 'LocalAI', rank: 6, base: 'http://localhost:8080/v1', port: 8080, auth: 'optional',
      docs: 'https://localai.io/basics/getting_started/', aliases: ['localai', 'local ai'] }),
    add({ id: 'koboldcpp', name: 'KoboldCpp', who: 'KoboldCpp', short: 'KoboldCpp', rank: 7, base: 'http://localhost:5001/v1', port: 5001, auth: 'optional', caps: { streaming: true },
      docs: 'https://github.com/LostRuins/koboldcpp/wiki', aliases: ['kobold', 'koboldcpp'] }),
    add({ id: 'textgen', name: 'text-generation-webui', who: 'text-generation-webui', short: 'text-gen-webui', rank: 8, base: 'http://127.0.0.1:5000/v1', port: 5000, auth: 'optional',
      docs: 'https://github.com/oobabooga/text-generation-webui/wiki/12-%E2%80%90-OpenAI-API', aliases: ['oobabooga', 'text generation webui', 'textgen', 'tgwui'] }),
    add({ id: 'custom', rank: 9, base: '', local: false, anyAddress: true, auth: 'optional',
      docs: 'https://platform.openai.com/docs/api-reference/chat', aliases: ['custom', 'any', 'address', 'url', 'openai compatible', 'proxy', 'self-hosted', 'server'] }),
  );
})();
