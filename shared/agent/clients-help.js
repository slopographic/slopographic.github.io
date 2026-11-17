/* The help for AI apps on a computer ("Use Slopographic from Claude Code and other AI apps", how-it-works#ai-apps):
 * fills each [data-slop-ai-clients] with the setup of every AI app from shared/agent/clients.js (load that first), with
 * a Copy button per snippet, and shows or hides each [data-slop-ai-soon] ("coming soon") from its PUBLISHED flag.
 * Classic script; window.SlopAgentClientsHelp.render(host). */
(function (g) {
  'use strict';
  const C = g.SlopAgentClients;
  const tr = (k, v) => { const I = g.SlopI18n; return I ? I.t(k, v) : k; };
  const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) n.setAttribute(k, attrs[k]); n.append(...kids.filter((x) => x != null)); return n; };

  function snippet(s) {
    const code = el('code', {}, s.code), btn = el('button', { type: 'button', class: 'sac-copy' }, tr('ui.copy'));
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(s.code); btn.textContent = tr('ui.agent.copied'); } catch (e) { btn.textContent = tr('ui.agent.select_copy'); }
      setTimeout(() => { btn.textContent = tr('ui.copy'); }, 1600);
    });
    return el('figure', { class: 'sac-snip' }, el('figcaption', {}, s.label, s.file ? el('small', {}, ' · ' + s.file) : null), el('pre', {}, code), btn);
  }
  const CSS = `.sac-client{border:1px solid var(--line,#333);border-radius:8px;padding:6px 12px;margin:8px 0}.sac-client summary{cursor:pointer;font-weight:600;padding:4px 0}
    .sac-snip{position:relative;margin:8px 0}.sac-snip figcaption{font-size:.9em;opacity:.8;margin-bottom:4px}
    .sac-snip pre{margin:0;padding:10px 64px 10px 12px;overflow-x:auto;border:1px solid var(--line,#333);border-radius:6px;background:var(--ink-2,#1a1a1a);font:13px/1.45 var(--mono,ui-monospace,monospace)}
    .sac-snip pre code{background:none;border:0;padding:0;word-break:normal;white-space:pre}
    .sac-copy{position:absolute;right:6px;top:22px;font:inherit;font-size:12px;padding:2px 8px;border-radius:4px;border:1px solid var(--line,#444);background:var(--ink,#111);color:inherit;cursor:pointer}`;
  function render(host) {
    if (!document.getElementById('sac-css')) document.head.append(Object.assign(el('style', { id: 'sac-css' }), { textContent: CSS }));
    host.textContent = '';
    for (const c of C.list) {
      const box = el('details', { class: 'sac-client', id: 'ai-app-' + c.id }, el('summary', {}, c.name));
      for (const t of c.steps) box.append(el('p', {}, t));
      for (const s of c.snippets) box.append(snippet(s));
      const [pre, post] = tr('ui.agent.format_from').split('{doc}');
      box.append(el('p', { class: 'note' }, pre, el('a', { href: c.doc, rel: 'noopener' }, tr('ui.agent.the_docs')), post || ''));
      host.append(box);
    }
  }
  function apply() {
    for (const n of document.querySelectorAll('[data-slop-ai-soon]')) n.hidden = !!C.PUBLISHED;
    for (const host of document.querySelectorAll('[data-slop-ai-clients]')) render(host);
  }
  if (C && g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(apply);   // the buttons and notes follow a language switch
  g.SlopAgentClientsHelp = { render, apply };
  if (C) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true }); else apply(); }
})(window);
