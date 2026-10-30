/* Slop Contacts: selection in the list. A click opens the contact in the card; Cmd or Ctrl click adds or removes one
 * row; Shift click selects the range from the last clicked row. Select mode (touch) makes every click a toggle.
 * Arrow keys move through the list, Enter opens, Space toggles, Delete asks first. Drags carry the selection to a
 * group. The bulk bar acts on the selection (group, stage, delete). Adds SlopContacts.select. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const $ = (id) => document.getElementById(id);
  const MIME = 'text/x-slop-ids';

  /** Opens one contact in the card (view mode) and makes it the keyboard position and the anchor. */
  function open(id) {
    S.open = id; S.focus = id; S.anchor = id;
    S.emit('render');
  }
  /** Ids between the anchor and id, in the order they are shown. */
  function rangeTo(id) {
    const ids = S.visible().map((c) => c.id);
    const a = ids.indexOf(S.anchor), b = ids.indexOf(id);
    if (a < 0 || b < 0) return [id];
    return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  }
  /** A click on a row. */
  function rowClick(id, e) {
    if (e && e.shiftKey && S.anchor) { S.setSel(new Set([...S.sel, ...rangeTo(id)])); S.focus = id; return; }
    if ((e && (e.metaKey || e.ctrlKey)) || S.selectMode) {
      const next = new Set(S.sel);
      if (next.has(id)) next.delete(id); else next.add(id);
      S.anchor = id; S.focus = id;
      S.setSel(next);
      return;
    }
    S.setSel([]);
    open(id);
  }
  /** Moves the keyboard position by delta rows, and opens that contact. */
  function move(delta) {
    const ids = S.visible().map((c) => c.id);
    if (!ids.length) return;
    const at = ids.indexOf(S.focus);
    const next = ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + delta))];
    S.setSel([]);
    open(next);
    const row = document.querySelector(`#rows .row[data-id="${CSS.escape(next)}"]`);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }
  /** Ids to drag: the selection when the row is in it, otherwise that row. */
  function dragIds(id) { return S.sel.has(id) ? [...S.sel] : [id]; }

  /** Removes contacts after the person confirms. Clears the card when it showed one of them. */
  async function remove(ids, { ask = true } = {}) {
    const list = ids ? [...ids] : [];
    if (!list.length) return false;
    const names = S.list.filter((c) => list.includes(c.id)).slice(0, 3).map((c) => c.fn);
    const what = list.length === 1 ? `”${names[0]}”` : SC.tr('contacts.sel.n_contacts', { n: list.length });
    if (ask && !(await UI.confirm(SC.tr(list.length === 1 ? 'contacts.sel.del_one_q' : 'contacts.sel.del_many_q'),
      SC.tr('contacts.sel.del_body', { what }), SC.tr('ui.delete'), { danger: true }))) return false;
    S.setList(S.list.filter((c) => !list.includes(c.id)));
    S.setSel([]);
    if (S.open && !S.byId(S.open)) { S.open = null; S.mode = 'view'; }
    S.emit('render');
    return true;
  }

  /** The bulk bar: shown when something is selected. */
  function syncBar() {
    const n = S.sel.size;
    $('bulkBar').hidden = !n;
    $('bulkCount').textContent = SC.tr('contacts.tbl.selected', { n });
    for (const r of document.querySelectorAll('#rows .row')) r.classList.toggle('is-focus', r.dataset.id === S.focus);
  }

  function mount() {
    const rows = $('rows');
    rows.addEventListener('click', (e) => {
      const li = e.target.closest && e.target.closest('.row');
      if (li) rowClick(li.dataset.id, e);
    });
    rows.addEventListener('dragstart', (e) => {
      const li = e.target.closest && e.target.closest('.row');
      if (!li || !e.dataTransfer) return;
      e.dataTransfer.setData(MIME, JSON.stringify(dragIds(li.dataset.id)));
      e.dataTransfer.setData('text/plain', dragIds(li.dataset.id).length + ' contacts');
      e.dataTransfer.effectAllowed = 'copyMove';
    });
    rows.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return; // the New contact name field has its own keys
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter' && S.focus) { e.preventDefault(); open(S.focus); }
      else if (e.key === ' ' && S.focus) {
        e.preventDefault();
        const next = new Set(S.sel); if (next.has(S.focus)) next.delete(S.focus); else next.add(S.focus);
        S.setSel(next);
      }
    });
    const stages = () => $('bulkStage').replaceChildren(new Option(SC.tr('contacts.sel.set_stage'), ''), ...S.STAGES.map((s) => new Option(SC.stageLabel(s), s)));
    stages();
    if (window.SlopI18n) window.SlopI18n.on(stages);
    $('bulkStage').addEventListener('change', (e) => {
      const st = e.target.value;
      e.target.value = '';
      if (!st) return;
      S.replaceMany(S.selected().map((c) => ({ ...c, stage: st })));
      UI.toast(SC.tr('contacts.sel.stage_set', { stage: SC.stageLabel(st), n: String(S.selected().length) }));
    });
    S.on('render', syncBar);
    S.on('change', syncBar);
  }

  SC.select = { mount, rowClick, move, open, remove, dragIds, MIME, syncBar };
})();
