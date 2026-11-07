/* SlopAIKit catalog: the local models Slop AI offers. Classic script; adds SlopAIKit.catalog.
 * Ids are WebLLM prebuilt ids (vendor/web-llm prebuiltAppConfig.model_list, v0.2.86); vramMB and lowResource are
 * copied from there. sizeMB is the approximate one-time download (weights + tokenizer + kernels).
 * f32Id is the q4f32 build for GPUs without shader-f16. The site may hide models by maker (makers.js, the brand profile's
 * "ai"): list, byId and DEFAULT give only the models it offers, so a saved choice of a hidden one finds nothing. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  // People's words are read when shown (shared/i18n/ui/<code>/models.js): commercial use by licence, the blurb by model (k)
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const use = (key) => ({ get commercial() { return T('ui.models.lic.' + key); } });
  const LIC = {
    llama: Object.assign(use('llama_use'), { name: 'Llama 3.2 Community License', short: 'Llama community', url: 'https://www.llama.com/llama3_2/license/' }),
    apache: Object.assign(use('yes'), { name: 'Apache License 2.0', short: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' }),
    qwenResearch: Object.assign(use('qwen_research_use'), { name: 'Qwen Research License', short: 'Qwen research', url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE' }),
    mit: Object.assign(use('yes'), { name: 'MIT License', short: 'MIT', url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct/blob/main/LICENSE' }),
    gemma: Object.assign(use('gemma_use'), { name: 'Gemma Terms of Use', short: 'Gemma terms', url: 'https://ai.google.dev/gemma/terms' }),
  };
  const M = (id, o) => {
    const m = Object.assign({ id, maker: '', params: 0, sizeMB: 0, vramMB: 0, ctx: 4096, lowResource: false, f16: true, strengths: [], k: '' }, o);
    if (!Object.getOwnPropertyDescriptor(m, 'blurb')) Object.defineProperty(m, 'blurb', { enumerable: true, get: () => (m.k ? T('ui.models.ai.' + m.k) : '') });
    return m;
  };
  const all = [
    M('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', { name: 'Qwen2.5 0.5B', maker: 'Alibaba Qwen', params: 0.5, sizeMB: 290, vramMB: 944.62, lowResource: true, license: LIC.apache,
      f32Id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', vram32: 1060.2, strengths: ['tiny', 'fast'], k: 'qwen25_05b' }),
    M('Llama-3.2-1B-Instruct-q4f16_1-MLC', { name: 'Llama 3.2 1B', maker: 'Meta', params: 1.2, sizeMB: 700, vramMB: 879.04, lowResource: true, license: LIC.llama,
      f32Id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', vram32: 1128.82, strengths: ['fast', 'chat'], k: 'llama32_1b' }),
    M('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', { name: 'Qwen2.5 1.5B', maker: 'Alibaba Qwen', params: 1.5, sizeMB: 880, vramMB: 1629.75, lowResource: true, license: LIC.apache,
      f32Id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', vram32: 1888.97, strengths: ['balanced', 'multilingual', 'tools'], k: 'qwen25_15b' }),
    M('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', { name: 'Qwen2.5 Coder 1.5B', maker: 'Alibaba Qwen', params: 1.5, sizeMB: 880, vramMB: 1629.75, license: LIC.apache,
      f32Id: 'Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC', vram32: 1888.97, strengths: ['code', 'mini-apps'], k: 'qwen25_coder_15b' }),
    M('gemma-2-2b-it-q4f16_1-MLC', { name: 'Gemma 2 2B', maker: 'Google', params: 2.6, sizeMB: 1500, vramMB: 1895.3, license: LIC.gemma,
      f32Id: 'gemma-2-2b-it-q4f32_1-MLC', vram32: 2508.75, strengths: ['writing', 'chat'], k: 'gemma2_2b' }),
    M('Llama-3.2-3B-Instruct-q4f16_1-MLC', { name: 'Llama 3.2 3B', maker: 'Meta', params: 3.2, sizeMB: 1800, vramMB: 2263.69, lowResource: true, license: LIC.llama,
      f32Id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC', vram32: 2951.51, strengths: ['chat', 'summaries', 'tools'], k: 'llama32_3b' }),
    M('Qwen2.5-3B-Instruct-q4f16_1-MLC', { name: 'Qwen2.5 3B', maker: 'Alibaba Qwen', params: 3.1, sizeMB: 1750, vramMB: 2504.76, lowResource: true, license: LIC.qwenResearch,
      f32Id: 'Qwen2.5-3B-Instruct-q4f32_1-MLC', vram32: 2893.64, strengths: ['reasoning', 'multilingual', 'tools'], k: 'qwen25_3b' }),
    M('Phi-3.5-mini-instruct-q4f16_1-MLC', { name: 'Phi-3.5 mini', maker: 'Microsoft', params: 3.8, sizeMB: 2150, vramMB: 3672.07, license: LIC.mit,
      f32Id: 'Phi-3.5-mini-instruct-q4f32_1-MLC', vram32: 5483.12, strengths: ['reasoning', 'maths', 'code'], k: 'phi35_mini' }),
    M('Qwen2.5-7B-Instruct-q4f16_1-MLC', { name: 'Qwen2.5 7B', maker: 'Alibaba Qwen', params: 7.6, sizeMB: 4300, vramMB: 5106.67, license: LIC.apache,
      f32Id: 'Qwen2.5-7B-Instruct-q4f32_1-MLC', vram32: 5900.09, strengths: ['smartest', 'tools', 'multilingual'], k: 'qwen25_7b' }),
    M('Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', { name: 'Qwen2.5 Coder 7B', maker: 'Alibaba Qwen', params: 7.6, sizeMB: 4300, vramMB: 5106.67, license: LIC.apache,
      f32Id: 'Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC', vram32: 5900.09, strengths: ['code', 'mini-apps'], k: 'qwen25_coder_7b' }),
  ];
  const offered = (m) => !K.makers || K.makers.allowed(m);
  const list = () => all.filter(offered);
  const byId = (id) => all.find((m) => (m.id === id || m.f32Id === id) && offered(m)) || null;
  /** The model offered first: the small all-rounder, else the next of these the site offers (Llama when Qwen is hidden). */
  const FIRST = ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Phi-3.5-mini-instruct-q4f16_1-MLC', 'gemma-2-2b-it-q4f16_1-MLC'];
  const first = () => { const l = list(), m = FIRST.map((id) => l.find((x) => x.id === id)).find(Boolean) || l[0]; return m ? m.id : null; };
  /** GPUs whose driver reports shader-f16 but cannot compile the f16 kernels (a load failed with a shader validation
   * error and the f32 build worked): remembered on this device by adapter vendor, architecture and description. */
  const F16_KEY = 'slop-ai.f16-broken';
  const gpuKey = (g) => [g && g.vendor, g && g.architecture, g && g.description].map((x) => String(x || '')).join('|');
  const brokenList = () => { try { return JSON.parse(localStorage.getItem(F16_KEY)) || []; } catch (e) { return []; } };
  const f16Broken = (g) => !!g && brokenList().includes(gpuKey(g));
  function markF16Broken(g) { const l = brokenList(), k = gpuKey(g); if (!l.includes(k)) l.push(k); try { localStorage.setItem(F16_KEY, JSON.stringify(l)); } catch (e) { /* this visit only */ } }
  /** The id to load on this machine: the q4f32 build when the GPU lacks shader-f16, or its f16 kernels failed before. */
  const idFor = (m, sys) => (sys && sys.gpu && sys.gpu.ok && (!sys.gpu.f16 || f16Broken(sys.gpu)) && m.f32Id ? m.f32Id : m.id);
  /** A model record for a folder loaded from disk (see webllm.js loadFromDisk). */
  const folder = { get name() { return T('ui.models.lic.custom'); }, get short() { return T('ui.models.lic.custom_short'); }, url: '' };
  const custom = (id, o = {}) => { const m = M(id, Object.assign({ name: id, license: folder, custom: true, sizeMB: 0, vramMB: 0, k: 'custom' }, o)); if (!('maker' in o)) Object.defineProperty(m, 'maker', { enumerable: true, get: () => T('ui.models.ai.custom_maker') }); return m; };
  K.catalog = { get list() { return list(); }, all, byId, idFor, custom, gpuKey, f16Broken, markF16Broken, LICENSES: LIC, FIRST, get DEFAULT() { return first(); } };
})();
