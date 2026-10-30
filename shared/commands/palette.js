/* SlopCmd part: the Spotlight palette. A combobox input driving a listbox of commands (ARIA
 * 1.2 pattern with aria-activedescendant), focus trapped inside, Esc/backdrop closes and focus
 * returns where it was. On phones it is a full-width sheet; an optional floating search button. */
(function () {
  'use strict';
  const C = window.SlopCmd;
  if (!C || !C._parts || C._parts.palette) return;
  /** A word from the shared tables (shared/i18n/ui/<code>.js) in the chosen language. */
  function tr(key, vars) { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; }   // shared/i18n/ui/<code>.js; the key where no table is loaded
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v === true ? '' : v); }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const lang = () => (window.SlopI18n && SlopI18n.get ? SlopI18n.get() : '');   // the palette is built again after a change
  let uid = 0;
  const S = { root: null, input: null, list: null, items: [], active: -1, prevFocus: null, query: '' };

  function kbd(binding) { return el('span', { class: 'scmd-keys' }, C.format(binding).split(' ').map((s) => el('kbd', null, s))); }
  function iconOf(it) {
    if (!it.icon) return el('span', { class: 'scmd-ico', 'aria-hidden': 'true' });
    return /^\s*</.test(it.icon) ? el('span', { class: 'scmd-ico', 'aria-hidden': 'true', html: it.icon }) : el('span', { class: 'scmd-ico', 'aria-hidden': 'true' }, it.icon);
  }
  function build() {
    const id = 'scmd-' + (++uid);
    const input = el('input', { class: 'scmd-input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': id + '-list', 'aria-autocomplete': 'list', 'aria-label': tr('ui.cmd.search'), placeholder: tr('ui.cmd.placeholder'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' });
    const close = el('button', { class: 'scmd-close', type: 'button', 'aria-label': tr('menu.close') }, el('kbd', { class: 'scmd-esc slop-esc-hint', 'aria-hidden': 'true' }, 'Esc'), el('span', { class: 'scmd-x', 'aria-hidden': 'true' }, '×'));
    const list = el('div', { class: 'scmd-list', id: id + '-list', role: 'listbox', 'aria-label': tr('ui.cmd.commands') });
    const keysBtn = el('button', { class: 'scmd-link', type: 'button' }, tr('ui.cmd.keymap_dots'));
    const hint = el('span', { class: 'scmd-hint' }, el('kbd', null, '↑'), el('kbd', null, '↓'), ' ' + tr('ui.cmd.hint_move') + ' ', el('kbd', null, '↵'), ' ' + tr('ui.cmd.hint_run'));
    const status = el('div', { class: 'scmd-sr', role: 'status', 'aria-live': 'polite' });
    const box = el('div', { class: 'scmd-pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('ui.cmd.search') },
      el('div', { class: 'scmd-bar' }, el('span', { class: 'scmd-lens', html: ICON_SEARCH }), input, close), list, el('div', { class: 'scmd-foot' }, hint, keysBtn), status);
    const root = el('div', { class: 'scmd-back', 'data-scmd': '' }, box);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) { e.preventDefault(); closePalette(); } });
    close.addEventListener('click', () => closePalette());
    keysBtn.addEventListener('click', () => C.openKeymap());
    input.addEventListener('input', () => { S.query = input.value; render(); });
    root.addEventListener('keydown', onKey);
    list.addEventListener('pointermove', (e) => { const o = e.target.closest('[role="option"]'); if (o && e.pointerType === 'mouse') setActive(+o.dataset.i, false); });
    list.addEventListener('click', (e) => { const o = e.target.closest('[role="option"]'); if (o) choose(+o.dataset.i); });
    Object.assign(S, { root, input, list, status, box, id, lang: lang() });
  }
  function render() {
    const sections = C._parts.search.results(S.query);
    S.items = []; S.list.textContent = '';
    let n = 0;
    for (const sec of sections) {
      if (!sec.items.length) continue;
      const hid = S.id + '-g' + n;
      const grp = el('div', { role: 'group', class: 'scmd-group' }, sec.title ? el('div', { class: 'scmd-hdr', id: hid, role: 'presentation' }, sec.title) : null);
      if (sec.title) grp.setAttribute('aria-labelledby', hid);
      for (const it of sec.items) {
        const i = S.items.length;
        S.items.push(it);
        const dis = it.enabled === false;
        const opt = el('div', { role: 'option', id: S.id + '-o' + i, class: 'scmd-opt' + (dis ? ' scmd-dis' : ''), 'data-i': i, 'data-id': it.id, 'aria-selected': 'false', 'aria-disabled': dis ? 'true' : null },
          iconOf(it), el('span', { class: 'scmd-title' }, it.title, it.checked ? el('span', { class: 'scmd-check', 'aria-label': ' ' + tr('ui.cmd.on') }, ' ✓') : null),
          !sec.title || sec.id === 'recent' || it.provided ? (it.group ? el('span', { class: 'scmd-grp' }, C._parts.search.groupLabel ? C._parts.search.groupLabel(it.group) : it.group) : null) : null,
          it.keys && it.keys.length ? kbd(it.keys[0]) : null);
        grp.append(opt);
      }
      S.list.append(grp); n++;
    }
    if (!S.items.length) S.list.append(el('div', { class: 'scmd-empty', role: 'presentation' }, tr('ui.cmd.no_match', { q: S.query })));
    S.status.textContent = S.items.length ? tr('ui.cmd.results', { n: S.items.length }) : tr('ui.cmd.no_results');
    const first = S.items.findIndex((x) => x.enabled !== false);
    setActive(first, true);
  }
  function setActive(i, scroll = true) {
    const prev = S.list.querySelector('[aria-selected="true"]');
    if (prev) prev.setAttribute('aria-selected', 'false');
    S.active = i;
    const opt = i >= 0 ? S.list.querySelector('#' + S.id + '-o' + i) : null;
    if (opt) { opt.setAttribute('aria-selected', 'true'); S.input.setAttribute('aria-activedescendant', opt.id); if (scroll) opt.scrollIntoView({ block: 'nearest' }); } else S.input.removeAttribute('aria-activedescendant');
  }
  function move(d) {
    const n = S.items.length; if (!n) return;
    let i = S.active;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (S.items[i].enabled !== false) break; }
    setActive(i);
  }
  function choose(i) {
    const it = S.items[i]; if (!it) return;
    if (it.enabled === false) { if (window.SlopUI) SlopUI.toast(tr('ui.cmd.not_available_short', { title: it.title })); return; }
    closePalette(true);
    if (it.go) { C._parts.search.goTo(it.go); return; }
    if (it.provided) { try { it.provided({ source: 'palette' }); } catch (err) { console.error(err); } return; }
    C.run(it.id, { source: 'palette' });
  }
  function focusables() { return [...S.box.querySelectorAll('input, button')].filter((x) => !x.disabled && x.offsetParent !== null); }
  function onKey(e) {
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (S.input.value && document.activeElement === S.input) { S.input.value = ''; S.query = ''; render(); } else closePalette(); return; }
    if (k === 'Tab') { const f = focusables(); if (!f.length) return; const i = f.indexOf(document.activeElement); e.preventDefault(); (f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length] || f[0]).focus(); return; }
    if (e.target !== S.input) return;
    if (k === 'ArrowDown' || (k === 'n' && e.ctrlKey)) { e.preventDefault(); move(1); } else if (k === 'ArrowUp' || (k === 'p' && e.ctrlKey)) { e.preventDefault(); move(-1); } else if (k === 'PageDown') { e.preventDefault(); for (let j = 0; j < 8; j++) move(1); } else if (k === 'PageUp') { e.preventDefault(); for (let j = 0; j < 8; j++) move(-1); } else if (k === 'Enter' && !e.isComposing) { e.preventDefault(); choose(S.active); }
    e.stopPropagation();
  }
  function open(query = '') {
    if (!S.root || (S.lang !== lang() && !S.root.isConnected)) build();
    if (!S.root.isConnected) { S.prevFocus = document.activeElement; document.body.append(S.root); C._setOpen(true); }
    S.root.classList.toggle('scmd-sheet', matchMedia('(max-width: 640px)').matches);
    S.input.value = query || ''; S.query = S.input.value;
    render();
    requestAnimationFrame(() => { try { S.input.focus({ preventScroll: true }); } catch (e) { S.input.focus(); } S.input.select(); });
    try { S.input.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return S.root;
  }
  function closePalette(running) {
    if (!S.root || !S.root.isConnected) return;
    S.root.remove();
    C._setOpen(false);
    const pf = S.prevFocus; S.prevFocus = null;
    if (pf && pf.focus && document.contains(pf) && pf !== document.body) try { pf.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    if (!running) C._emit('dismiss');
  }
  /** Floating search button. mode true: always; 'touch': only on touch screens / narrow windows. */
  function fab(mode = true) {
    let b = document.querySelector('.scmd-fab');
    if (!b) {
      b = el('button', { class: 'scmd-fab', type: 'button', html: ICON_SEARCH });
      b.addEventListener('click', () => C.open());
      document.body.append(b);
      const words = () => { b.setAttribute('aria-label', tr('ui.cmd.search')); b.title = tr('ui.cmd.fab_tip', { key: C.keyFor('cmd.palette') }); };
      words();
      if (window.SlopI18n && SlopI18n.on) SlopI18n.on(words);
    }
    b.classList.toggle('scmd-fab-touch', mode === 'touch');
    return b;
  }
  C._parts.palette = { open, close: () => closePalette(), fab, get state() { return S; } };
})();
