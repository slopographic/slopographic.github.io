/* SlopAIKit sysinfo: "Can my PC run it?". Classic script; adds SlopAIKit.sysinfo.
 *   collect({ bench }) → a plain JSON snapshot (WebGPU adapter, limits, f16, RAM, cores, browser/OS, storage, bench)
 *   verdict(sys, model) → { level: 'good'|'slow'|'no', tps, id, reason }   (pure: tests feed mocked snapshots)
 *   recommend(sys, list, purpose) → the best model id for this machine
 *   help(sys) → what to do when WebGPU is missing */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai2.js
  const GB = 1024;

  async function browserInfo() {
    const ua = navigator.userAgent || '', b = { ua, name: 'Unknown browser', version: '', os: 'Unknown OS', mobile: /Mobi|Android|iPhone|iPad/.test(ua) };
    const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/g) || [];
    const pick = (re) => { for (const s of m) { const x = s.match(re); if (x) return x[1]; } return ''; };
    if (/Edg\//.test(ua)) Object.assign(b, { name: 'Edge', version: pick(/Edg\/(\d+)/) });
    else if (/OPR\//.test(ua)) Object.assign(b, { name: 'Opera', version: pick(/OPR\/(\d+)/) });
    else if (/Firefox\//.test(ua)) Object.assign(b, { name: 'Firefox', version: pick(/Firefox\/(\d+)/) });
    else if (/Chrome\//.test(ua)) Object.assign(b, { name: 'Chrome', version: pick(/Chrome\/(\d+)/) });
    else if (/Safari\//.test(ua)) Object.assign(b, { name: 'Safari', version: pick(/Version\/(\d+)/) });
    b.os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : b.os;
    const d = navigator.userAgentData;
    if (d) {
      b.os = d.platform || b.os; b.mobile = !!d.mobile;
      try {
        const h = await d.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList']);
        const brand = (h.fullVersionList || []).find((x) => !/Not.?A.?Brand|Chromium/i.test(x.brand)) || (h.fullVersionList || [])[0];
        if (brand) { b.name = brand.brand.replace('Google ', '').replace('Microsoft ', ''); b.version = brand.version; }
        if (h.platformVersion) b.osVersion = h.platformVersion;
        if (h.architecture) b.arch = h.architecture + (h.bitness ? '-' + h.bitness : '');
        if (h.model) b.model = h.model;
      } catch (e) { /* UA-CH not allowed */ }
    }
    return b;
  }

  async function gpuInfo() {
    const g = { ok: false, reason: '' };
    if (!navigator.gpu) { g.reason = 'no-api'; return g; }
    let adapter = null;
    try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { g.reason = 'error'; g.error = String(e && e.message || e); return g; }
    if (!adapter) { g.reason = 'no-adapter'; return g; }
    let info = adapter.info;
    if (!info && adapter.requestAdapterInfo) try { info = await adapter.requestAdapterInfo(); } catch (e) { /* old API */ }
    info = info || {};
    const L = adapter.limits || {};
    Object.assign(g, {
      ok: true, vendor: info.vendor || '', architecture: info.architecture || '', description: info.description || '', device: info.device || '',
      isFallback: !!(adapter.isFallbackAdapter || info.isFallbackAdapter), f16: !!(adapter.features && adapter.features.has('shader-f16')),
      features: adapter.features ? [...adapter.features].sort() : [],
      limits: { maxBufferSize: L.maxBufferSize || 0, maxStorageBufferBindingSize: L.maxStorageBufferBindingSize || 0, maxComputeWorkgroupStorageSize: L.maxComputeWorkgroupStorageSize || 0, maxComputeInvocationsPerWorkgroup: L.maxComputeInvocationsPerWorkgroup || 0 },
    });
    Object.defineProperty(g, 'adapter', { value: adapter, enumerable: false });
    return g;
  }

  /** From SlopQuota (shared/storage/quota.js), the one copy of the storage calls. */
  async function storageInfo() {
    const s = window.SlopQuota ? await window.SlopQuota.estimate() : {};
    return { quota: s.quota == null ? null : s.quota, usage: s.usage == null ? null : s.usage, persisted: s.persisted == null ? null : s.persisted };
  }

  async function collect({ bench = false, onStep } = {}) {
    const step = (t) => onStep && onStep(t);
    step(T('ui.ai.sys.looking'));
    const [gpu, browser, storage] = await Promise.all([gpuInfo(), browserInfo(), storageInfo()]);
    const sys = { time: Date.now(), gpu, browser, storage, ramGB: navigator.deviceMemory || null, cores: navigator.hardwareConcurrency || null, bench: null };
    if (bench && gpu.ok && K.bench) { step(T('ui.ai.sys.benchmark')); try { sys.bench = await K.bench.run(gpu.adapter, { onStep: step }); } catch (e) { sys.bench = { error: String(e && e.message || e) }; } }
    return sys;
  }

  /** MB the GPU can probably give a model. Browsers hide VRAM, so: half of the reported RAM (deviceMemory caps at 8),
   * or 4 GB when unknown; a software (fallback) adapter gets 1 GB. */
  function budgetMB(sys) {
    if (!sys || !sys.gpu || !sys.gpu.ok) return 0;
    let mb = sys.ramGB ? sys.ramGB * GB * 0.5 : 4 * GB;
    const d = (sys.gpu.vendor + ' ' + sys.gpu.description + ' ' + sys.gpu.architecture).toLowerCase();
    if (sys.ramGB >= 8 && /nvidia|radeon rx|geforce|rtx|arc a/.test(d)) mb = Math.max(mb, 6 * GB); // a discrete GPU has its own memory
    if (/apple|metal-3|m1|m2|m3|m4/.test(d) && sys.ramGB >= 8) mb = Math.max(mb, 5 * GB);           // unified memory, generous
    if (sys.gpu.isFallback) mb = Math.min(mb, GB);
    return Math.round(mb);
  }
  /** Memory bandwidth in GB/s: measured, else a guess from the matmul result, else a typical laptop. */
  function bandwidth(sys) {
    const b = sys && sys.bench;
    if (b && b.bandwidthGBs > 0) return b.bandwidthGBs;
    if (b && b.gflops > 0) return Math.max(2, b.gflops / 12);
    return sys && sys.gpu && sys.gpu.isFallback ? 3 : 30;
  }
  const round = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);

  function verdict(sys, model) {
    const gpu = sys && sys.gpu;
    if (!gpu || !gpu.ok) return { level: 'no', tps: 0, id: model.id, reason: T('ui.ai.sys.no_webgpu') };
    const f32 = !gpu.f16;
    if (f32 && !model.f32Id) return { level: 'no', tps: 0, id: model.id, reason: T('ui.ai.sys.no_f16') };
    const id = f32 ? model.f32Id : model.id, vram = f32 ? model.vram32 || model.vramMB * 1.3 : model.vramMB;
    const bind = gpu.limits && gpu.limits.maxStorageBufferBindingSize;
    if (!model.lowResource && bind && bind < (1 << 30)) return { level: 'no', tps: 0, id, vram, reason: T('ui.ai.sys.buffer', { mb: Math.round(bind / 1048576) }) };
    const budget = budgetMB(sys);
    if (vram > budget * 1.15) return { level: 'no', tps: 0, id, vram, reason: T('ui.ai.sys.memory', { need: Math.round((vram / GB) * 10) / 10, have: Math.round((budget / GB) * 10) / 10 }) };
    const weightGB = Math.max(0.2, (model.sizeMB || vram * 0.7) / GB) * (f32 ? 1.35 : 1);
    const tps = Math.max(0.3, Math.min(250, (bandwidth(sys) * 0.55) / weightGB));
    const out = { id, vram, tps: round(tps), level: 'good', reason: f32 ? T('ui.ai.sys.f32') : '' };
    if (vram > budget * 0.85) Object.assign(out, { level: 'slow', reason: T('ui.ai.sys.tight') });
    else if (tps < 6) Object.assign(out, { level: 'slow', reason: T('ui.ai.sys.slowly') });
    return out;
  }

  /** Best model for this machine: the largest 'good' one that still streams at ≥ 10 tok/s (purpose 'code' prefers Coder). */
  function recommend(sys, list, purpose = 'chat') {
    const rows = list.map((m) => ({ m, v: verdict(sys, m) }));
    const fit = (r) => { const code = r.m.strengths.includes('code'); return purpose === 'code' ? code : !code && !(r.m.license && r.m.license.short === 'Qwen research'); };
    const good = rows.filter((r) => r.v.level === 'good' && fit(r));
    const fast = good.filter((r) => r.v.tps >= 10).sort((a, b) => b.m.params - a.m.params);
    if (fast.length) return fast[0].m.id;
    if (good.length) return good.sort((a, b) => b.v.tps - a.v.tps)[0].m.id;
    const slow = rows.filter((r) => r.v.level === 'slow' && fit(r)).sort((a, b) => a.m.params - b.m.params);
    return slow.length ? slow[0].m.id : null;
  }

  /** Advice when WebGPU is missing or software-only. */
  function help(sys) {
    const b = (sys && sys.browser) || {}, g = (sys && sys.gpu) || {}, tips = [];
    if (g.ok && g.isFallback) tips.push(T('ui.ai.sys.tip_software'));
    if (!g.ok) {
      if (g.reason === 'no-adapter') tips.push(T('ui.ai.sys.tip_no_adapter'));
      if (b.name === 'Firefox') tips.push(T('ui.ai.sys.tip_firefox'));
      else if (b.name === 'Safari') tips.push(T('ui.ai.sys.tip_safari'));
      else if (b.os === 'Linux') tips.push(T('ui.ai.sys.tip_linux'));
      else tips.push(T('ui.ai.sys.tip_chrome'));
      tips.push(T('ui.ai.sys.tip_browsers'));
    }
    return tips;
  }

  K.sysinfo = { collect, verdict, recommend, help, budgetMB, bandwidth, browserInfo };
})();
