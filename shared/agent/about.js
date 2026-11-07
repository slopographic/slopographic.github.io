/* SlopAgentAbout: the "AI agents" note of every app (Help ▸ AI agents…, and Ctrl+K), with the site-wide setting
 * "Let AI agents use this app". Classic script, loaded by shared/agent/boot.js on first use; needs SlopUI.
 *   open()          the note in a SlopUI dialog
 *   note()          the note as a DOM fragment (the Settings page shows the same one)
 *   LINES           the plain-words text (ui.agent.about_1 … 6, read when asked), one source for the dialog and Settings
 * An element with data-slop-agents-note gets the note when this script loads (the Settings page). */
(function (g) {
  'use strict';
  if (g.SlopAgentAbout) return;
  const tr = (k, v) => { const I = g.SlopI18n; return I ? I.t(k, v) : k; };
  /** The note in plain words, one paragraph per key (ui.agent.about_1 …), read in the chosen language when drawn. */
  const lines = () => [1, 2, 3, 4, 5, 6].map((i) => tr('ui.agent.about_' + i));
  const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };

  function note({ compact = false } = {}) {
    const A = g.SlopAgents, frag = document.createDocumentFragment();
    const all = lines();
    for (const line of compact ? all.slice(1, 4) : all) frag.append(el('p', {}, line));
    const status = el('p', { class: 'sag-status', role: 'status' });
    const box = el('input', { type: 'checkbox', id: 'sag-on' + Math.random().toString(36).slice(2, 6) });
    box.checked = !!(A && A.enabled());
    const show = () => {
      const on = !!(A && A.enabled()), here = !!(A && A.supported()), W = g.SlopWebMCP;
      if (status.dataset.drawn && !status.isConnected) { document.removeEventListener('slop:agent-tools', show); return; }   // drawn again in another language
      status.textContent = !here ? tr('ui.agent.no_webmcp') : !on ? tr('ui.agent.off') : tr('ui.agent.on_n', { n: W ? W.tools().length : 0 });
    };
    box.addEventListener('change', async () => { A.set(box.checked); await (box.checked ? A.start() : null); show(); });
    const label = el('label', { for: box.id, class: 'sag-toggle' }, box, ' ' + tr('ui.agent.toggle'));
    const link = el('button', { type: 'button', class: 'sui-btn sag-connect' }, tr('ui.agent.connect_dots'));
    link.addEventListener('click', () => { if (A && A.connect) A.connect({ ask: true }); });
    frag.append(label, el('p', { class: 'sag-hint' }, tr('ui.agent.setting_hint')), status, el('p', {}, link));
    show();
    status.dataset.drawn = '1';
    document.addEventListener('slop:agent-tools', show);
    return frag;
  }

  function open() {
    const body = el('div', { class: 'sag-note' });
    body.append(note());
    return g.SlopUI.dialog({ title: tr('ui.agent.about_title'), body, buttons: [{ label: tr('menu.close'), primary: true }], dismissable: true });
  }

  g.SlopAgentAbout = { open, note, get LINES() { return lines(); } };
  // the Settings page's note is drawn once: drawn again when the language changes
  const hosts = [...document.querySelectorAll('[data-slop-agents-note]')];
  const fill = () => { for (const host of hosts) host.replaceChildren(note()); };
  fill();
  if (hosts.length && g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(fill);
})(window);
