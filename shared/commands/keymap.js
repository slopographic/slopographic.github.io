/* SlopCmd part: the keyboard shortcut editor (SlopUI dialog). Search, click a shortcut to record a
 * new one, + to add, × to remove, ↺ to reset one, Reset all, conflict warnings, export/import JSON.
 * Shortcuts are stored per app in localStorage 'slop.keys.<app>'. */
(function () {
  'use strict';
  const C = window.SlopCmd;
  if (!C || !C._parts || C._parts.keymap) return;
  /** A word from the shared tables (shared/i18n/ui/<code>.js) in the chosen language. */
  function tr(key, vars) { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; }   // shared/i18n/ui/<code>.js; the key where no table is loaded
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') n.className = v; else n.setAttribute(k, v === true ? '' : v); }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  };
  const appName = () => { const a = (window.SLOP_APPS || []).find((x) => x.id === C.app); return a ? a.name : document.title.split(/\s[—–-]\s/)[0]; };
  const keysEl = (b) => el('span', { class: 'scmd-keys' }, C.format(b).split(' ').map((s) => el('kbd', null, s)));
  let cur = null;

  function open() {
    if (cur && cur.dlg.box.isConnected) { cur.search.focus(); return cur; }
    if (!window.SlopUI) throw new Error('SlopCmd.openKeymap needs shared/slopui.js');
    const R = C._parts.recorder;
    const search = el('input', { class: 'sui-input scmd-km-search', type: 'search', placeholder: tr('ui.cmd.km_search'), 'aria-label': tr('ui.cmd.km_search'), autocomplete: 'off', spellcheck: 'false' });
    const list = el('div', { class: 'scmd-km-list', role: 'list', 'aria-label': tr('ui.cmd.km_list') });
    const note = el('p', { class: 'scmd-km-note' }, tr('ui.cmd.km_note', { app: appName() }));
    const live = el('div', { class: 'scmd-sr', 'aria-live': 'assertive' });
    const body = el('div', { class: 'scmd-km' }, search, note, list, live);
    let rec = null;
    const stopRec = () => { if (rec) { rec.cancel(); rec = null; } };
    const dlg = SlopUI.dialog({
      title: tr('ui.cmd.km_title'), cls: 'sui-wide scmd-km-dlg', body,
      buttons: [
        { label: tr('ui.import_dots'), act: () => { R.importFile(); return false; } },
        { label: tr('ui.export_dots'), act: () => { R.exportFile(); return false; } },
        { label: tr('ui.cmd.reset_all'), act: async () => { if (await SlopUI.confirm(tr('ui.cmd.reset_all_title'), tr('ui.cmd.reset_all_body', { app: appName() }), tr('ui.cmd.reset_all'), { danger: true })) C.resetKeys(); return false; } },
        { label: tr('ui.done'), primary: true },
      ],
      onClose: () => { stopRec(); offChange(); cur = null; },
    });
    function startRec(btn, id, old) {
      stopRec();
      btn.classList.add('scmd-recording');
      btn.textContent = tr('ui.cmd.press_keys');
      btn.setAttribute('aria-pressed', 'true');
      live.textContent = tr('ui.cmd.recording');
      const r = rec = R.record({ keepOn: btn, onStep: (b) => { btn.textContent = C.format(b) + ' …'; } });
      r.promise.then(async (b) => {
        if (rec === r) rec = null;
        if (b) { await R.assign(id, old, b); live.textContent = tr('ui.cmd.set_to', { keys: C.format(b) }); } else live.textContent = tr('ui.cmd.rec_cancelled');
        render();
        const again = list.querySelector('[data-id="' + CSS.escape(id) + '"] .scmd-add');
        if (again) again.focus({ preventScroll: true });
      });
    }
    function row(c, conflicts) {
      const binds = el('span', { class: 'scmd-km-binds' });
      for (const b of c.keys) {
        const chip = el('button', { type: 'button', class: 'scmd-chip', title: tr('ui.cmd.change'), 'aria-label': tr('ui.cmd.change_aria', { keys: C.format(b), title: c.title }) }, keysEl(b));
        chip.addEventListener('click', () => startRec(chip, c.id, b));
        const x = el('button', { type: 'button', class: 'scmd-chip-x', 'aria-label': tr('ui.cmd.remove_aria', { keys: C.format(b), title: c.title }), title: tr('ui.remove') }, '×');
        x.addEventListener('click', () => { R.removeBinding(c.id, b); live.textContent = tr('ui.cmd.removed'); });
        binds.append(el('span', { class: 'scmd-chipwrap' }, chip, x));
      }
      const add = el('button', { type: 'button', class: 'scmd-add', title: tr('ui.cmd.add'), 'aria-label': tr('ui.cmd.add_aria', { title: c.title }) }, '+');
      add.addEventListener('click', () => startRec(add, c.id, null));
      binds.append(add);
      const changed = JSON.stringify(c.keys.map((k) => C.canon(k))) !== JSON.stringify(c.defaults.map((k) => C.canon(k)));
      const reset = el('button', { type: 'button', class: 'scmd-reset', title: tr('ui.cmd.reset_one'), 'aria-label': tr('ui.cmd.reset_aria', { title: c.title }), disabled: !changed }, '↺');
      reset.addEventListener('click', () => C.resetKeys(c.id));
      const warn = conflicts && conflicts.length ? el('span', { class: 'scmd-km-warn', title: tr('ui.cmd.conflict') }, tr('ui.cmd.also', { names: [...new Set(conflicts.map((x) => x.title))].join(', ') })) : null;
      return el('div', { class: 'scmd-km-row' + (changed ? ' scmd-changed' : ''), role: 'listitem', 'data-id': c.id },
        el('span', { class: 'scmd-km-name' }, el('span', { class: 'scmd-km-title' }, c.title), warn), binds, reset);
    }
    function render() {
      if (rec) return;
      const q = search.value.trim();
      let cmds = C.list().filter((c) => !c.hidden);
      if (q) {
        const S = C._parts.search;
        const fmt = (c) => c.keys.map((k) => C.format(k) + ' ' + k).join(' ');
        cmds = cmds.filter((c) => (S ? S.rank(q, [c], null).length : (c.title + c.id).toLowerCase().includes(q.toLowerCase())) || fmt(c).toLowerCase().includes(q.toLowerCase()));
      }
      const all = C.allConflicts(), groups = new Map();
      for (const c of cmds) { const g = c.group || 'Commands'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
      if (groups.has('Help')) { const h = groups.get('Help'); groups.delete('Help'); groups.set('Help', h); }
      const scroll = list.scrollTop;
      list.textContent = '';
      for (const [g, items] of groups) {
        list.append(el('div', { class: 'scmd-km-hdr', role: 'presentation' }, C._parts.search && C._parts.search.groupLabel ? C._parts.search.groupLabel(g) : g));
        for (const c of items) list.append(row(c, all[c.id]));
      }
      if (!cmds.length) list.append(el('p', { class: 'scmd-km-note' }, tr('ui.cmd.no_match', { q })));
      list.scrollTop = scroll;
    }
    const offChange = C.on('change', render);
    search.addEventListener('input', render);
    render();
    cur = { dlg, search, list, render, get recording() { return rec; } };
    return cur;
  }
  C._parts.keymap = { open, get current() { return cur; } };
})();
