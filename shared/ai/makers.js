/* SlopAIKit makers: who made each AI model, and which models this site offers. Classic script, no DOM (the Node tests run
 * it in a vm); adds SlopAIKit.makers. The one table of model makers, read by every list of models: the models on this
 * device (catalog.js), the providers and their suggested and fetched models (cloud/providers.js, engine.js, local.js),
 * the saved choices (cloud/keys.js) and the picture models (imagegen/core.js, run.js).
 *   MAKERS               [{ id, name, origin (ISO 3166 country of the maker; '*' a router, any maker), match (the ids and names of its models),
 *                         providers (catalog entries that are the maker's own API: every model there is its) }]
 *   of(model, pid)       → the makers of a model ({ id, name?, madeBy? } or an id; pid: the provider it is offered by).
 *                         A model can have two: a fine-tune names its base too (deepseek-r1-distill-llama).
 *   allowed(model, pid)  → false when the site hides it; filter(list, pid) → the allowed ones
 *   provider(p)          → false when the site hides a provider (listed, its maker hidden, or every model it has is
 *                         hidden and it fetches no list)
 *   config() · configure(cfg) → the rules in use; configure() replaces them (tests, previews), configure() with
 *                         nothing goes back to the profile's
 * The rules come from the brand profile's "ai" field (brand/README.md, "Profiles"), written into AI_MODELS at build time:
 *   hideOrigins ['CN']   every model whose maker is from these countries
 *   hideMakers           maker ids (MAKERS)        onlyMakers   only these makers (a model of no known maker is hidden too)
 *   hideModels           model id patterns, * for any text ('*-preview')        hideProviders  provider ids (cloud/catalog)
 * A model of no known maker is offered unless onlyMakers is set. A model is hidden when any of its makers is. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  // The brand profile sets this at build time (tools/whitelabel/emit.mjs); here it holds this site's own: nothing hidden.
  const AI_MODELS = /*profile:aiModels*/{};
  const M = (id, name, origin, match, providers = []) => ({ id, name, origin, match, providers });
  const MAKERS = [
    // China
    M('qwen', 'Qwen (Alibaba)', 'CN', /qwen|\bqwq|\bqvq|tongyi|\bwan-?2|wanx|alibaba|dashscope/i, ['qwen']),
    // R1 post-trained by others (Microsoft's MAI-DS-R1, Perplexity's R1 1776) counts as DeepSeek's too
    M('deepseek', 'DeepSeek', 'CN', /deepseek|mai-ds-r1|r1-1776/i, ['deepseek']),
    M('zhipu', 'GLM (Zhipu, Z.ai)', 'CN', /\bglm|zai-org|\bz-ai\/|\bthudm|zhipu|cogview|cogvideo|codegeex/i, ['zai', 'bigmodel']),
    M('moonshot', 'Kimi (Moonshot AI)', 'CN', /kimi|moonshot/i, ['moonshot']),
    M('minimax', 'MiniMax', 'CN', /minimax|\babab\d/i),
    M('baichuan', 'Baichuan', 'CN', /baichuan/i),
    M('01ai', 'Yi (01.AI)', 'CN', /01-ai|01\.ai|\byi-(large|lightning|medium|spark|vision|coder|\d)/i),
    M('internlm', 'InternLM (Shanghai AI Lab)', 'CN', /internlm|intern-?s1|internvl/i),
    M('tencent', 'Hunyuan (Tencent)', 'CN', /hunyuan|tencent/i),
    M('baidu', 'ERNIE (Baidu)', 'CN', /\bernie|baidu/i),
    M('bytedance', 'Doubao, Seed (ByteDance)', 'CN', /doubao|bytedance|seed-?oss|seedream|seededit|seedance|\bseed-\d|ui-tars/i),
    M('stepfun', 'Step (StepFun)', 'CN', /stepfun|\bstep-?[1-9]/i),
    M('meituan', 'LongCat (Meituan)', 'CN', /longcat|meituan/i),
    M('xiaomi', 'MiMo (Xiaomi)', 'CN', /\bmimo|xiaomi/i),
    M('ant', 'Ling, Ring (Ant Group)', 'CN', /inclusionai|\bling-|\bring-(mini|flash|lite|plus|1t)|bailing|antgroup/i),
    M('openbmb', 'MiniCPM (OpenBMB)', 'CN', /minicpm|openbmb/i),
    M('kuaishou', 'KAT, Kolors (Kuaishou)', 'CN', /kwaipilot|kwai|\bkat-|kolors|kling/i),
    M('skywork', 'Skywork (Kunlun)', 'CN', /skywork/i),
    M('rednote', 'dots (Xiaohongshu)', 'CN', /dots\.(llm|ocr|vlm)|rednote|xiaohongshu/i),
    M('iflytek', 'Spark (iFlytek)', 'CN', /iflytek|xunfei/i),
    M('sensetime', 'SenseNova (SenseTime)', 'CN', /sensenova|sensetime/i),
    M('baai', 'BAAI', 'CN', /\bbaai|\bbge-|aquila|\bemu3/i),
    // United States
    M('anthropic', 'Anthropic', 'US', /claude|anthropic/i, ['anthropic']),
    M('openai', 'OpenAI', 'US', /\bgpt|openai|chatgpt|dall-e|whisper|(^|\/)o\d(-|$)|davinci|babbage|text-embedding|\btts-|\bsora|codex/i, ['openai']),
    M('google', 'Google', 'US', /gemini|gemma|imagen|\bveo|nano-banana|\bpalm-?2|-bison\b|learnlm|google\//i, ['gemini']),
    M('meta', 'Meta', 'US', /llama|\bmeta\//i),
    M('xai', 'xAI', 'US', /grok|\bxai\b|\bx-ai\//i, ['xai']),
    M('microsoft', 'Microsoft', 'US', /\bphi-?\d|wizardlm|microsoft\//i),
    M('perplexity', 'Perplexity', 'US', /\bsonar|pplx|perplexity|r1-1776/i, ['perplexity']),
    M('nvidia', 'NVIDIA', 'US', /nvidia|nemotron/i),
    M('ibm', 'IBM', 'US', /granite|\bibm\b/i),
    M('amazon', 'Amazon', 'US', /amazon|\bnova-(micro|lite|pro|premier|canvas|reel|sonic)|\btitan/i),
    M('allenai', 'Ai2', 'US', /allenai|\bolmo|\bmolmo|\btulu/i),
    M('nous', 'Nous Research', 'US', /nousresearch|\bhermes/i),
    M('liquid', 'Liquid AI', 'US', /liquid\/|\blfm-?\d/i),
    M('huggingface', 'Hugging Face', 'US', /smollm|huggingfacetb|zephyr|idefics/i),
    M('recraft', 'Recraft', 'US', /recraft/i, ['recraft']),
    M('writer', 'Writer', 'US', /palmyra|\bwriter\//i),
    // the open-source OCR engine (HP, then Google, now its community; shared/ocr/engines.js)
    M('tesseract', 'Tesseract (open source)', 'US', /tesseract/i),
    // a router picks the model for each request (any maker): hidden whenever the site hides by maker or country
    M('router', 'A router (any maker)', '*', /^openrouter\//i),
    // Europe and elsewhere
    M('mistral', 'Mistral AI', 'FR', /mistral|mixtral|codestral|magistral|devstral|pixtral|ministral|voxtral/i, ['mistral']),
    M('bfl', 'Black Forest Labs', 'DE', /flux|black-forest/i, ['bfl']),
    M('stability', 'Stability AI', 'GB', /stable-?diffusion|stable-image|stability|\bsd3|sdxl/i, ['stability']),
    M('cohere', 'Cohere', 'CA', /\bcommand-|cohere|c4ai|\baya-/i, ['cohere']),
    M('ideogram', 'Ideogram', 'CA', /ideogram/i, ['ideogram']),
    M('ai21', 'AI21 Labs', 'IL', /jamba|ai21/i, ['ai21']),
    M('tii', 'TII (Falcon)', 'AE', /falcon|tiiuae/i),
    M('upstage', 'Upstage', 'KR', /upstage|\bsolar-/i),
    M('lg', 'LG AI Research', 'KR', /exaone|lgai/i),
  ];
  const byId = (id) => MAKERS.find((m) => m.id === id) || null;

  const list = (v, f) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => f(x.trim())) : []);
  /** A pattern with * as any text, matched against the whole id, case aside. */
  const glob = (s) => new RegExp('^' + s.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  function normal(c) {
    c = c && typeof c === 'object' ? c : {};
    const lower = (x) => x.toLowerCase();
    return { hideOrigins: list(c.hideOrigins, (x) => x.toUpperCase()), hideMakers: list(c.hideMakers, lower), onlyMakers: list(c.onlyMakers, lower),
      hideModels: list(c.hideModels, (x) => x), hideProviders: list(c.hideProviders, lower) };
  }
  let cfg = normal(AI_MODELS), pats = cfg.hideModels.map(glob);
  const config = () => JSON.parse(JSON.stringify(cfg));
  function configure(c) { cfg = normal(c === undefined ? AI_MODELS : c); pats = cfg.hideModels.map(glob); return config(); }
  /** True when the site hides anything: every list is then read through filter(). */
  const active = () => !!(cfg.hideOrigins.length || cfg.hideMakers.length || cfg.onlyMakers.length || pats.length || cfg.hideProviders.length);

  const idOf = (m) => String((m && typeof m === 'object' ? m.id : m) || '');
  /** The makers of a model: its madeBy (a catalog entry whose id says nothing, Azure's "deployment"), the provider's own
   * maker, and every maker whose pattern its id or name matches. */
  function of(m, pid) {
    const id = idOf(m), name = m && typeof m === 'object' && typeof m.name === 'string' ? m.name : '';
    const out = MAKERS.filter((x) => x.match.test(id) || (name && x.match.test(name)) || (pid && x.providers.includes(pid)));
    const own = m && typeof m === 'object' && byId(m.madeBy);
    if (own && !out.includes(own)) out.unshift(own);
    return out;
  }
  const makerHidden = (x) => cfg.hideMakers.includes(x.id) || (x.origin === '*' ? cfg.hideOrigins.length + cfg.hideMakers.length > 0 : cfg.hideOrigins.includes(x.origin)) || (cfg.onlyMakers.length > 0 && !cfg.onlyMakers.includes(x.id));
  function allowed(m, pid) {
    if (!active()) return true;
    const id = idOf(m);
    if (pats.some((re) => re.test(id))) return false;
    const ms = of(m, pid);
    if (!ms.length) return !cfg.onlyMakers.length;
    return !ms.some(makerHidden);
  }
  const filter = (items, pid) => (active() ? (items || []).filter((m) => allowed(m, pid)) : (items || []).slice());
  /** A provider is hidden when listed, when it is a hidden maker's own API, or when it has only models of its own (no
   * list to fetch) and every one is hidden. One that fetches a list stays: its list is filtered when it comes. */
  function provider(p) {
    if (!p || !active()) return true;
    if (cfg.hideProviders.includes(String(p.id).toLowerCase())) return false;
    if (MAKERS.some((x) => x.providers.includes(p.id) && makerHidden(x))) return false;
    const ms = p._models || p.models || [];
    return !(ms.length && p.modelsEndpoint === false && !ms.some((m) => allowed(m, p.id)));
  }

  K.makers = { MAKERS, byId, of, allowed, filter, provider, config, configure, active };
})();
