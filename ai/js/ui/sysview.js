/* Slop AI — ui/sysview: "Can my PC run it?" — the system report, the per-model verdict table and WebGPU help. */
'use strict';
(function (AI) {
  const K = AI.K, el = AI.el;
  AI.sys = null;
  AI.VERDICT = { good: ['✅', 'Runs well'], slow: ['⚠️', 'Slow'], no: ['❌', 'Won’t fit'] };
  AI.verdictText = (v) => (v.level === 'good' ? AI.t('ai.sys.v_good', { tps: String(v.tps) }) : v.level === 'slow' ? AI.t('ai.sys.v_slow', { tps: String(v.tps) }) : AI.t('ai.sys.v_no'));

  /** Run the check. bench defaults to true (about a second of GPU work); tests pass AI.sysOptions. */
  AI.runCheck = async function ({ bench = true } = {}) {
    const st = AI.$('sysStep');
    const opts = Object.assign({ bench, onStep: (t) => { if (st) st.textContent = t; } }, AI.sysOptions || {});
    AI.sysBusy = true; render();
    try { AI.sys = AI.sysMock ? JSON.parse(JSON.stringify(AI.sysMock)) : await K.sysinfo.collect(opts); }
    catch (e) { AI.sys = { gpu: { ok: false, reason: 'error', error: String(e.message || e) }, browser: {}, storage: {}, bench: null }; }
    AI.sysBusy = false;
    AI.emit('sys', AI.sys); render();
    return AI.sys;
  };
  AI.recommended = (purpose) => (AI.sys ? K.sysinfo.recommend(AI.sys, K.catalog.list, purpose) : null);

  const row = (k, v, cls) => el('div', { class: 'kv' + (cls ? ' ' + cls : '') }, el('span', null, k), el('b', null, v == null || v === '' ? '—' : v));
  const gb = (b) => (b ? (b / 1073741824).toFixed(b >= 1073741824 * 10 ? 0 : 1) + ' GB' : '—');
  const mb = (b) => (b ? Math.round(b / 1048576) + ' MB' : '—');

  function specCards(s) {
    const g = s.gpu || {}, b = s.browser || {}, st = s.storage || {}, be = s.bench;
    const T = AI.t, yes = T('ui.yes'), no = T('ui.no');
    const gpuName = g.ok ? [g.vendor, g.architecture].filter(Boolean).join(' · ') || T('ai.sys.unnamed_gpu') : T('ai.sys.no_webgpu');
    const cards = [
      el('div', { class: 'card spec' + (g.ok ? '' : ' bad') }, el('h3', null, 'GPU'), row(T('ai.sys.adapter'), gpuName), row(T('ai.sys.description'), g.description || (g.ok ? T('ai.sys.hidden') : '')),
        row('WebGPU', g.ok ? (g.isFallback ? T('ai.sys.software_only') : yes) : T('ai.sys.not_available')), row('shader-f16', g.ok ? (g.f16 ? yes : T('ai.sys.no_f16')) : '—')), // i18n-ignore: WebGPU is a name
      el('div', { class: 'card spec' }, el('h3', null, T('ai.sys.gpu_limits')), row('maxBufferSize', g.ok ? mb(g.limits.maxBufferSize) : '—'), row('maxStorageBufferBindingSize', g.ok ? mb(g.limits.maxStorageBufferBindingSize) : '—'),
        row(T('ai.sys.workgroup'), g.ok ? Math.round(g.limits.maxComputeWorkgroupStorageSize / 1024) + ' KB' : '—'), row(T('ai.sys.budget'), g.ok ? T('ai.sys.estimate', { size: AI.fmtMB(K.sysinfo.budgetMB(s)) }) : '—')),
      el('div', { class: 'card spec' }, el('h3', null, T('ai.sys.machine')), row('RAM', s.ramGB ? (s.ramGB >= 8 ? T('ai.sys.ram_8') : s.ramGB + ' GB') : T('ai.sys.not_reported')), row(T('ai.sys.threads'), s.cores),
        row(T('ai.sys.browser'), [b.name, b.version].filter(Boolean).join(' ')), row(T('ai.sys.system'), [b.os, b.osVersion, b.arch].filter(Boolean).join(' · '))),
      el('div', { class: 'card spec' }, el('h3', null, T('ai.models.storage')), row(T('ai.sys.free'), st.quota ? gb(st.quota - (st.usage || 0)) : '—'), row(T('ai.sys.used'), st.usage != null ? AI.fmtBytes(st.usage) : '—'),
        row(T('ai.sys.kept'), st.persisted == null ? '—' : st.persisted ? yes : no),
        st.persisted === false ? el('button', { type: 'button', class: 'btn sm', onclick: async () => { const ok = (await window.SlopQuota.request()) === 'granted'; AI.toast(T(ok ? 'ai.sys.kept_yes' : 'ai.sys.kept_no')); AI.runCheck({ bench: false }); } }, T('ai.sys.ask_keep')) : null),
      el('div', { class: 'card spec' }, el('h3', null, T('ai.sys.benchmark')), row(T('ai.sys.matmul'), be && be.gflops ? be.gflops + ' GFLOPS' : be && be.error ? T('ai.sys.failed') : '—'), row(T('ai.sys.bandwidth'), be && be.bandwidthGBs ? be.bandwidthGBs + ' GB/s' : '—'),
        el('button', { type: 'button', class: 'btn sm', id: 'btnBench', disabled: !g.ok || AI.sysBusy, onclick: () => AI.runCheck({ bench: true }) }, T(be ? 'ai.sys.run_again' : 'ai.sys.run_bench'))),
    ];
    return el('div', { class: 'spec-grid' }, cards);
  }

  function helpCard(s) {
    const tips = K.sysinfo.help(s);
    if (!tips.length) return null;
    return el('div', { class: 'card help' }, el('h2', null, AI.t(s.gpu.ok ? 'ai.sys.software_gpu' : 'ai.sys.missing')),
      el('p', { class: 'lead' }, AI.t('ai.sys.need_webgpu')),
      el('ul', null, tips.map((t) => el('li', null, t))),
      el('p', { class: 'dim' }, AI.t('ai.sys.demo_hint')),
      el('button', { type: 'button', class: 'btn', onclick: () => AI.switchEngine('fake').then(() => AI.setTab('models')) }, AI.t('ai.sys.try_demo')));
  }

  function verdictTable(s) {
    const rec = AI.recommended('chat'), recCode = AI.recommended('code');
    const t = el('table', { class: 'verdicts' }, el('thead', null, el('tr', null, [AI.t('ai.chip.model'), AI.t('ai.models.size'), AI.t('ai.models.gpu_mem'), AI.t('ai.sys.verdict'), ''].map((h) => el('th', null, h)))));
    const tb = el('tbody');
    for (const m of K.catalog.list) {
      const v = K.sysinfo.verdict(s, m);
      tb.append(el('tr', { class: 'v-' + v.level, 'data-id': m.id },
        el('td', null, el('b', null, m.name), m.id === rec ? el('span', { class: 'badge rec' }, AI.t('ai.models.recommended')) : m.id === recCode ? el('span', { class: 'badge rec' }, AI.t('ai.models.best_code')) : null, el('div', { class: 'faint' }, m.license.short)),
        el('td', null, '~' + AI.fmtMB(m.sizeMB)), el('td', null, AI.fmtMB(v.vram || m.vramMB)),
        el('td', null, el('span', { class: 'verdict ' + v.level }, AI.verdictText(v)), v.reason ? el('div', { class: 'faint' }, v.reason) : null),
        el('td', null, v.level !== 'no' ? el('button', { type: 'button', class: 'btn sm', onclick: () => { AI.focusModel = m.id; AI.setTab('models'); } }, AI.t('ai.sys.get')) : null)));
    }
    t.append(tb);
    return el('div', { class: 'card table-card' }, el('h2', null, AI.t('ai.sys.can_run')),
      el('p', { class: 'faint' }, AI.t('ai.sys.speeds')), el('div', { class: 'table-wrap' }, t));
  }

  function render() {
    const v = AI.$('view-sys');
    if (!v) return;
    v.textContent = '';
    const s = AI.sys;
    const head = el('div', { class: 'page-head' },
      el('div', null, el('h1', null, AI.tabLabel('sys')), el('p', { class: 'lead' }, AI.t('ai.sys.lead'))),
      el('div', { class: 'head-acts' },
        el('button', { type: 'button', class: 'btn', disabled: AI.sysBusy, onclick: () => AI.runCheck({ bench: !!(s && s.bench) }) }, AI.icon('redo'), AI.t('ai.sys.check_again')),
        el('button', { type: 'button', class: 'btn primary', id: 'btnSpecCard', disabled: !s || AI.sysBusy, onclick: () => AI.specCardDialog(AI.sys) }, AI.icon('share'), AI.t('ai.spec.title'))));
    const inner = el('div', { class: 'page-in' }, head);
    if (AI.sysBusy || !s) inner.append(el('div', { class: 'card busy' }, el('span', { class: 'spinner' }), el('span', { id: 'sysStep' }, AI.t('ai.sys.checking'))));
    if (s) inner.append(specCards(s), helpCard(s), verdictTable(s));
    v.append(inner);
  }
  AI.renderSys = render;
  AI.onLang(() => { if (AI.tab === 'sys' && !AI.sysBusy) render(); });
  AI.on('tab', ({ tab }) => {
    if (tab !== 'sys') return;
    if (!AI.sysBusy && (!AI.sys || (!AI.sys.bench && !AI.benchTried))) { AI.benchTried = true; AI.runCheck({ bench: true }); } else render();
  });
})(window.AI);
