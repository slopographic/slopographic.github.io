/* The AI provider catalog, group 'main': the four the panel offers first. Classic script; pushes into
 * SlopAIKit.cloud.catalog (cloud/providers.js normalizes and serves them). Data only: no provider has code of its own.
 * An entry:
 *   id, name (in the picker), who (the company, for "goes to <who>"), short (buttons), group (providers.js GROUPS), rank
 *   format: 'anthropic' | 'openai-responses' | 'openai-chat' | 'gemini' (chat) or a picture format (providers.js)
 *   base: the API root the format appends to, or a template with {fields} (fields: [{ id, label, placeholder, help,
 *     default, sample (for tools/check-ai-cors.mjs) }], asked in the form); a query in it (?api-version={apiVersion}) stays at the end of every URL
 *   auth: 'bearer' (default) | 'none' | 'optional' | { header, prefix }; headers: extra headers; keyUrl, keyHint, where
 *   modelsEndpoint: the path of its model list ('/models'), or false (then models are the only choices)
 *   models: [{ id, name, hint, by, madeBy }] shown before the list is fetched (hint: the note's key, ui.ai.cloud.hint_<hint>;
 *     madeBy: the maker's id in shared/ai/makers.js when the id does not say it); prefer: patterns for the fetched list; modelHints
 *   caps: { tools, vision, images, streaming }; prices: { model: [in, out] } $ per million tokens; priceSource
 *   cors: 'verified' (a browser preflight from https://slopographic.com is allowed, checked 2026-10-24 with
 *     tools/check-ai-cors.mjs) | 'needs-proxy' (the browser is refused; corsNote says why in plain words) | 'unknown'
 *   blocker: 'auth' when a needs-proxy entry is held back by its sign-in (signing, short-lived tokens), not by CORS
 *   docs (https), aliases (search words), local / anyAddress (an address the person types)
 *   The words people read (name when it is not a brand, notes, where, corsNote, setup and after lines, pull, start, the
 *   free texts, field labels and help) are not here: they are keys in shared/i18n/ui/<code>/ai5-8.js by id, read through
 *   getters that cloud/providers.js (words) adds; see its comment for the key names.
 *   signin: "Sign in with <short>" instead of pasting a key (cloud/signin.js, OAuth PKCE straight from the browser):
 *     { auth (the consent page), keys (where the code becomes a key), manage (where the person caps or revokes it), docs, verified }
 *   testPath: a key check of its own (OpenRouter's list is public); toolsOnly, maxTokens, usageOption: request options
 *   free: what costs nothing, read from the provider's own pricing or limits page on `verified` (cloud/free.js reads it):
 *     { tier: 'free' | 'free-models' (some models are free) | 'free-trial' (credit that runs out) | 'none' (checked: no
 *     free use), note (the limits in plain words), limits (the short form for a rate-limit message), reset, training
 *     (what the provider may do with free-tier data, in plain words; null when nothing leaves the computer), signup (where
 *     to get the key), docs (the page it was read from), verified 'YYYY-MM-DD', models ('all', or ids and patterns of
 *     the free models; OpenRouter's come from its list), rank (order in the free guide and suggestions) } */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  const origin = () => { try { return location.origin; } catch (e) { return 'https://slopographic.com'; } };
  (C.catalog = C.catalog || []).push(
    { id: 'anthropic', name: 'Claude (Anthropic)', who: 'Anthropic', short: 'Claude', group: 'main', rank: 1, format: 'anthropic', base: 'https://api.anthropic.com',
      auth: { header: 'x-api-key' }, keyUrl: 'https://platform.claude.com/settings/keys', keyHint: 'sk-ant-…',
      modelsEndpoint: '/v1/models', caps: { tools: true, vision: true, streaming: true }, cors: 'verified', priceSource: 'Anthropic’s published prices',
      docs: 'https://platform.claude.com/docs/en/api/messages', aliases: ['claude', 'anthropic', 'opus', 'sonnet', 'haiku'],
      models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5', hint: 'capable' }, { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', hint: 'fast_capable' }, { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', hint: 'fastest_cheapest' }],
      prefer: [/^claude-opus-5-5$/, /^claude-sonnet-5-5$/, /^claude-haiku-5-5$/],
      prices: { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-haiku-5-5': [0.1, 0.5], 'claude-fable-5-1': [10, 50, 0.25], 'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-opus-4-8': [5, 25], 'claude-sonnet-4-6': [3, 15], 'claude-haiku-4-5': [1, 5] } },
    { id: 'openai', name: 'ChatGPT (OpenAI)', who: 'OpenAI', short: 'OpenAI', group: 'main', rank: 2, format: 'openai-responses', base: 'https://api.openai.com/v1',
      keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…',
      modelsEndpoint: '/models', caps: { tools: true, vision: true, images: true, streaming: true }, cors: 'verified',
      docs: 'https://platform.openai.com/docs/api-reference/responses', aliases: ['chatgpt', 'gpt', 'openai', 'o3'],
      models: [{ id: 'gpt-6-astra', name: 'gpt-6-astra', hint: 'recommended', by: 'OpenAI' }, { id: 'gpt-5.6-terra', name: 'gpt-5.6-terra', hint: 'lower_cost' }, { id: 'gpt-5.6-luna', name: 'gpt-5.6-luna', hint: 'fastest_cheapest' }],
      prefer: [/^gpt-6-astra$/, /^gpt-5\.6-terra$/, /^gpt-5\.6-luna$/, /^gpt-6/, /^gpt-5/] },
    { id: 'gemini', name: 'Gemini (Google)', who: 'Google', short: 'Gemini', group: 'main', rank: 3, format: 'gemini', base: 'https://generativelanguage.googleapis.com',
      auth: { header: 'x-goog-api-key' }, keyUrl: 'https://aistudio.google.com/app/apikey', keyHint: 'AIza…', where: 'Google AI Studio › Get API key',
      modelsEndpoint: '/v1beta/models', caps: { tools: true, vision: true, images: true, streaming: true }, cors: 'verified',
      docs: 'https://ai.google.dev/gemini-api/docs', aliases: ['google', 'gemini', 'ai studio', 'bard'],
      models: [{ id: 'gemini-3.8-pro', name: 'Gemini 3.8 Pro', hint: 'capable' }, { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', hint: 'fast' }, { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', hint: 'cheapest' }],
      prefer: [/^gemini-[\d.]+-pro$/, /^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash-lite$/],
      free: { tier: 'free', rank: 1, verified: '2026-10-25', docs: 'https://ai.google.dev/gemini-api/docs/pricing', signup: 'https://aistudio.google.com/app/apikey',
        models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', /^gemma-4/] } },
    { id: 'openrouter', name: 'OpenRouter (many models, one key)', who: 'OpenRouter', short: 'OpenRouter', group: 'main', rank: 4, format: 'openai-chat', base: 'https://openrouter.ai/api/v1',
      keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…', where: 'openrouter.ai › Keys', testPath: '/key',
      headers: { 'HTTP-Referer': origin(), 'X-OpenRouter-Title': 'Slopographic' }, maxTokens: 16000, toolsOnly: true,
      modelsEndpoint: '/models', caps: { tools: true, vision: true, images: true, streaming: true }, cors: 'verified', priceSource: 'its model list',
      signin: { auth: 'https://openrouter.ai/auth', keys: 'https://openrouter.ai/api/v1/auth/keys', manage: 'https://openrouter.ai/settings/keys', docs: 'https://openrouter.ai/docs/use-cases/oauth-pkce', verified: '2026-10-26' },
      docs: 'https://openrouter.ai/docs/api/reference/overview', aliases: ['openrouter', 'router', 'many models'],
      modelHints: ['llama', 'qwen', 'deepseek', 'mistral', 'kimi', 'glm', 'grok', 'claude', 'gpt', 'gemini'],
      models: [], prefer: [/^anthropic\/claude-sonnet/, /^openai\/gpt-/, /^google\/gemini-[\d.]+-flash$/, /^anthropic\/claude-haiku/],
      free: { tier: 'free-models', rank: 3, verified: '2026-10-25', docs: 'https://openrouter.ai/docs/api/reference/limits', signup: 'https://openrouter.ai/keys',
         } },
  );
})();
