/* SlopAIKit gpuHelp: what to say when a model's GPU kernels cannot run on this graphics card (both the f16 and the f32
 * build failed with a shader or pipeline error; webllm.js tried them). Classic script; adds SlopAIKit.gpuHelp.
 *   gpuHelp.details(model, error, sys) → plain text for a bug report: the model, what was tried, the error, the browser
 *        and the GPU (sysinfo.js)
 *   gpuHelp.render(box, { model, error, sys, onSmaller, onCloud }) → the message, "Copy details", "Try a smaller model",
 *        "Use your own AI account" */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai.js (the details stay English: a bug report)
  const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { if (attrs[k] == null) continue; if (k === 'class') n.className = attrs[k]; else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); } n.append(...kids.filter((x) => x != null)); return n; };

  function details(m, e, sys) {
    const g = (sys && sys.gpu) || {}, b = (sys && sys.browser) || {};
    return [`Slop AI could not load ${m ? m.name || m.id : 'the model'}.`,
      `Tried: ${((e && e.tried) || []).join(', ') || (m && m.id) || '?'}`,
      `Error: ${String((e && e.message) || e).slice(0, 600)}`,
      `Browser: ${[b.name, b.version].filter(Boolean).join(' ') || '?'} on ${b.os || '?'}`,
      `GPU: ${[g.vendor, g.architecture, g.description].filter(Boolean).join(' / ') || '?'}${g.f16 != null ? `, shader-f16: ${g.f16 ? 'yes' : 'no'}` : ''}${g.isFallback ? ' (software)' : ''}`,
      `Page: ${location.origin}${location.pathname}`].join('\n');
  }

  function render(box, o = {}) {
    const m = o.model || {}, text = details(m, o.error, o.sys), both = ((o.error && o.error.tried) || []).length > 1;
    const msg = el('span', { class: 'sap-dim sap-gpu-copied', role: 'status' });
    const copy = el('button', { type: 'button', class: 'sap-btn sap-gpu-copy', onclick: async () => {
      try { await navigator.clipboard.writeText(text); msg.textContent = T('ui.ai.gpu.copied'); } catch (e) { msg.textContent = T('ui.ai.gpu.copy_failed'); }
    } }, T('ui.ai.gpu.copy_details'));
    const wrap = el('div', { class: 'sap-gpu', role: 'alert' },
      el('p', { class: 'sap-pick-no' }, T(both ? 'ui.ai.gpu.no_run_both' : 'ui.ai.gpu.no_run', { model: m.name || T('ui.ai.gpu.this_model') })),
      el('p', { class: 'sap-dim' }, T('ui.ai.gpu.hint')),
      el('pre', { class: 'sap-gpu-details' }, text),
      el('div', { class: 'sap-acts' }, copy,
        o.onSmaller ? el('button', { type: 'button', class: 'sap-btn sap-gpu-smaller', onclick: () => o.onSmaller() }, T('ui.ai.gpu.smaller')) : null,
        o.onCloud ? el('button', { type: 'button', class: 'sap-btn primary sap-gpu-cloud', onclick: () => o.onCloud() }, T('ui.ai.own_account')) : null),
      msg);
    box.append(wrap);
    return wrap;
  }

  K.gpuHelp = { details, render };
})();
