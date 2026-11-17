/* SlopCut: a minimal built-in shortcut dispatcher, command palette and shortcut list, used only while
   the shared SlopCmd package (shared/commands/) is not available, e.g. in the offline .html. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, h = U.h;
  const F = SE.cmdFallback = {};
  let list = [];

  function keyName(e) {
    let k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key; // i18n-ignore: key names
    if (k === '+') k = '=';
    if ((e.altKey || e.ctrlKey || e.metaKey) && /^Key[A-Z]$/.test(e.code || '')) k = e.code.slice(3);
    const mods = [];
    if (e.shiftKey && k.length > 1 || e.shiftKey && /[A-Z]/.test(k)) mods.push('Shift'); // i18n-ignore: key names
    if (e.altKey) mods.push('Alt'); // i18n-ignore: key names
    if (e.ctrlKey || e.metaKey) mods.push('Mod'); // i18n-ignore: key names
    return mods.concat(k).join('+');
  }
  function norm(k) { // canonical order Shift+Alt+Mod+Key
    const parts = k.split('+'), key = parts.pop();
    const order = ['Shift', 'Alt', 'Mod']; // i18n-ignore: key names
    return order.filter((m) => parts.includes(m)).concat(key.length === 1 ? key.toUpperCase() : key).join('+');
  }
  F.install = function (cmds) {
    list = cmds;
    const map = new Map();
    for (const c of cmds) for (const k of c.keys || []) map.set(norm(k), c);
    document.addEventListener('keydown', (e) => {
      if (SlopUI.openDialogs || e.defaultPrevented) return;
      if (document.querySelector('.sui-menu')) return;
      const k = keyName(e), c = map.get(k);
      if (!c) return;
      if (window.SlopTyping && window.SlopTyping.yields(e)) return; // a field keeps its own keys (shared/input/typing.js)
      if (c.when && !c.when()) return;
      e.preventDefault();
      c.run({});
    });
  };
  F.palette = function () {
    const input = h('input', { class: 'sui-input cmdp-q', type: 'search', placeholder: U.t('slopedit.fb.type_a_command'), 'aria-label': U.t('slopedit.fb.search_commands') });
    const ul = h('div', { class: 'cmdp-list', role: 'listbox' });
    let rows = [], idx = 0, dlg;
    function score(c, q) {
      const s = (c.title + ' ' + c.group + ' ' + (c.keywords || []).join(' ')).toLowerCase();
      if (!q) return 1;
      return q.split(/\s+/).every((w) => s.includes(w)) ? (c.title.toLowerCase().startsWith(q) ? 3 : 2) : 0;
    }
    function render() {
      const q = input.value.trim().toLowerCase();
      rows = list.filter((c) => (!c.when || c.when()) && score(c, q)).sort((a, b) => score(b, q) - score(a, q)).slice(0, 60);
      idx = Math.min(idx, Math.max(0, rows.length - 1));
      ul.replaceChildren(...rows.map((c, i) => h('button', { type: 'button', class: 'cmdp-row' + (i === idx ? ' on' : ''), role: 'option', onclick: () => go(c) },
        h('span', { class: 'cmdp-g' }, c.group), h('span', { class: 'cmdp-t' }, c.title), h('kbd', null, SE.cmd.keyFor(c.id)))));
      const on = ul.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function go(c) { dlg.close(true); setTimeout(() => c.run({}), 0); }
    input.addEventListener('input', () => { idx = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(rows.length - 1, idx + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (rows[idx]) go(rows[idx]); }
    });
    dlg = SlopUI.dialog({ title: U.t('slopedit.fb.search_commands'), body: h('div', { class: 'cmdp' }, input, ul), cls: 'cmdp-dlg', dismissable: true });
    render();
  };
  F.keymap = function () {
    const groups = new Map();
    for (const c of list) if (c.keys && c.keys.length) { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push(c); }
    const body = h('div', { class: 'keys-grid' }, [...groups].map(([g, cs]) => h('section', null, h('h3', null, g),
      h('dl', { class: 'keys' }, cs.map((c) => [h('dt', null, c.keys.map((k) => SE.cmd.keyFor(c.id) && k === c.keys[0] ? SE.cmd.keyFor(c.id) : k.replace('Mod+', 'Ctrl+')).join(' / ')), h('dd', null, c.title)])))));
    SlopUI.dialog({ title: U.t('slopedit.fb.keyboard_shortcuts'), body, cls: 'sui-wide', buttons: [{ label: U.t('slopedit.fb.close'), primary: true }] });
  };
})();
