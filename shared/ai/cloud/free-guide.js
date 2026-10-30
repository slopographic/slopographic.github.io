/* SlopAIKit cloud freeGuide: "Get a free key in 2 minutes", the collapsible guide in "Use your own AI account"
 * (connect.js). Classic script; adds SlopAIKit.cloud.freeGuide = { render({ onChoose(id), onSignin(id), tools() }) → <details> }.
 * Steps for Gemini, Groq and OpenRouter in plain words (keys ui.ai.cloud.guide_*). Their sign-up links, limits and what the provider may do with
 * free-tier data come from the catalog's `free` field (cloud/catalog/*.js), so the guide and the badges say the same.
 * Gemini and Groq come first: they use the app's tools on their free tier. At OpenRouter only some free models can.
 * A provider with a sign-in (OpenRouter, cloud/signin.js) gets "Sign in with <name>" first: the easiest way, no key to copy. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = K.cloud;
  const h = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); return n; };
  const CSS = `
.sap-free-guide { border: 1px solid var(--p-line); border-radius: var(--p-radius); padding: 6px 10px; background: var(--p-bg2); }
.sap-free-guide > summary { cursor: pointer; font-weight: 600; color: var(--p-fg); }
.sap-free-guide section { display: grid; gap: 4px; padding: 8px 0 4px; border-top: 1px solid var(--p-line); margin-top: 6px; }
.sap-free-guide h4 { margin: 0; font-size: 13px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.sap-free-guide ol { margin: 0; padding-inline-start: 20px; display: grid; gap: 2px; }
.sap-free-guide a { color: var(--p-fg); }
.sap-free-guide .sap-btn { justify-self: start; height: 28px; }`;
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const style = () => { if (!document.getElementById('sap-free-guide-style')) document.head.append(h('style', { id: 'sap-free-guide-style' }, CSS)); };

  /** The steps for each provider: the keys of its why line and steps (ui.ai.cloud.guide_<id>_why, _step_1..3); {link}
   * in a step is its sign-up page from the catalog. */
  const STEPS = { gemini: 3, groq: 3, openrouter: 3 };

  function section(id, o) {
    const p = C.byId(id), f = p && C.free.tier(p), n = STEPS[id] || 0;
    if (!f) return null;
    const link = () => h('a', { href: f.signup, target: '_blank', rel: 'noopener', class: 'sap-free-link' }, f.signup.replace(/^https:\/\//, ''));
    const steps = Array.from({ length: n }, (x, i) => T(`ui.ai.cloud.guide_${id}_step_${i + 1}`)).map((line) => { const [a, b] = line.split('{link}'); return h('li', null, a, b === undefined ? null : link(), b || null); });
    const tools = id === 'openrouter' ? h('p', { class: 'sap-dim' }, T('ui.ai.cloud.guide_tools')) : null;
    return h('section', { 'data-provider': id },
      h('h4', null, p.short, h('span', { class: 'sap-pp-b free' }, C.free.label(p))),
      h('p', { class: 'sap-dim' }, T(`ui.ai.cloud.guide_${id}_why`)), h('ol', null, steps),
      h('p', { class: 'sap-dim' }, h('b', null, T('ui.ai.cloud.guide_limits') + ' '), f.note),
      f.training ? h('p', { class: 'sap-dim' }, h('b', null, T('ui.ai.cloud.guide_data') + ' '), f.training) : null, tools,
      h('div', { class: 'sap-acts' }, p.signin ? h('button', { type: 'button', class: 'sap-btn primary sap-free-signin', onclick: () => o.onSignin && o.onSignin(id) }, T('ui.ai.cloud.or_signin', { name: p.short })) : null,
        h('button', { type: 'button', class: 'sap-btn sap-free-choose', onclick: () => o.onChoose && o.onChoose(id) }, T('ui.ai.cloud.guide_choose', { name: p.short }))));
  }

  function render(o = {}) {
    style();
    return h('details', { class: 'sap-free-guide' }, h('summary', null, T('ui.ai.cloud.guide_title')),
      h('p', { class: 'sap-dim' }, T('ui.ai.cloud.guide_intro')),
      ['gemini', 'groq', 'openrouter'].map((id) => section(id, o)),
      h('p', { class: 'sap-dim' }, T('ui.ai.cloud.guide_private')));
  }

  C.freeGuide = { render, STEPS };
})();
