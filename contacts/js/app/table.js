/* Slop Contacts: the table view. Every shown contact (the group, the filters and the search) in one table: name,
 * organisation, e-mail, phone, groups, notes. A header click sorts (again flips the direction). A double click, or Enter
 * on a focused cell, edits the cell: Enter saves, Shift+Enter is a line break in notes, Escape cancels. A row click
 * selects it (Cmd or Ctrl adds one, Shift takes a range); the checkboxes do the same. The bulk bar acts on the selection,
 * and rows drag onto groups like list rows. Renders from SlopContacts.state. Adds SlopContacts.table. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const TM = SC.tableModel;
  const UI = window.SlopUI;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => SC.text.html(s);   // the one HTML escape (core/text.js)
  let editing = null; // { id, colId, td } while a cell has an input

  /** The shown contacts, sorted when a column is chosen. */
  const shown = () => (S.sort.id ? TM.sortBy(S.visible(), S.sort.id, S.sort.dir) : S.visible());

  function headHtml(list) {
    const allOn = list.length > 0 && list.every((c) => S.sel.has(c.id));
    const cells = TM.COLS.map((c) => {
      const on = S.sort.id === c.id;
      const mark = on ? (S.sort.dir === 'desc' ? '↓' : '↑') : '';
      return `<th scope="col" data-col="${c.id}" aria-sort="${on ? (S.sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}">`
        + `<button type="button" class="th-btn" data-sort="${c.id}">${esc(c.label)} <span class="sort-ind" aria-hidden="true">${mark}</span></button></th>`;
    }).join('');
    return `<thead><tr><th scope="col" class="tc-check"><input type="checkbox" id="tblAll" aria-label="${esc(SC.tr('contacts.tbl.select_all'))}"${allOn ? ' checked' : ''}></th>${cells}</tr></thead>`;
  }
  function rowHtml(c) {
    const on = S.sel.has(c.id);
    const cells = TM.COLS.map((col) => `<td data-col="${col.id}" title="${esc(col.get(c))}"${col.edit ? ' tabindex="0"' : ''}>${esc(col.get(c))}</td>`).join('');
    return `<tr data-id="${esc(c.id)}" draggable="true" class="${on ? 'is-sel' : ''}" aria-selected="${on}">`
      + `<td class="tc-check"><input type="checkbox" aria-label="${esc(SC.tr('contacts.tbl.select', { name: c.fn }))}"${on ? ' checked' : ''}></td>${cells}</tr>`;
  }

  /** Paints the table from the state. Not while a cell is being edited (the input would be lost). */
  function render() {
    const view = $('tableView');
    if (!view) return;
    const table = S.view === 'table';
    view.hidden = !table;
    $('listScroll').hidden = table;
    if (!table || editing) return;
    const list = shown();
    $('tbl').innerHTML = headHtml(list) + `<tbody>${list.map(rowHtml).join('')}</tbody>`;
    $('tblEmpty').hidden = list.length > 0;
    $('tblEmpty').textContent = SC.tr(S.list.length ? 'contacts.tbl.no_match' : 'contacts.tbl.none');
    $('tblBar').hidden = !S.sel.size;
    $('tblCount').textContent = SC.tr('contacts.tbl.selected', { n: S.sel.size });
  }

  /** The ids between two rows, in the order they are shown. */
  function rangeIds(a, b) {
    const ids = shown().map((c) => c.id), i = ids.indexOf(a), j = ids.indexOf(b);
    if (i < 0 || j < 0) return [b];
    return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
  }
  /** A row click: plain selects only that row, Cmd or Ctrl toggles it, Shift takes the range from the anchor. */
  function clickRow(id, e) {
    if (e.shiftKey && S.anchor) { S.setSel(new Set([...S.sel, ...rangeIds(S.anchor, id)])); return; }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(S.sel);
      if (next.has(id)) next.delete(id); else next.add(id);
      S.anchor = id;
      S.setSel(next);
      return;
    }
    S.anchor = id;
    S.setSel([id]);
  }
  /** A checkbox click: the row joins or leaves the selection (Shift takes the range from the anchor). */
  function tick(id, on, e) {
    const next = new Set(S.sel);
    const ids = e.shiftKey && S.anchor ? rangeIds(S.anchor, id) : [id];
    for (const x of ids) { if (on) next.add(x); else next.delete(x); }
    S.anchor = id;
    S.setSel(next);
  }

  const editable = (td) => { const col = TM.col(td.dataset.col); return !!(col && col.edit); };
  function startEdit(td) {
    if (editing) return;
    const id = td.closest('tr').dataset.id, colId = td.dataset.col, c = S.byId(id), col = TM.col(colId);
    if (!c || !col) return;
    const input = document.createElement(col.multi ? 'textarea' : 'input');
    if (!col.multi) input.type = 'text';
    input.className = 'tc-input';
    input.value = col.raw(c);
    input.setAttribute('aria-label', col.label);
    editing = { id, colId, td };
    td.classList.add('is-editing');
    td.replaceChildren(input);
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && !(e.key === 'Enter' && !(col.multi && e.shiftKey))) return;
      e.preventDefault();
      e.stopPropagation(); // the table's own Enter (which opens a cell) must not see this key
      finish(e.key !== 'Escape');
    });
    input.addEventListener('blur', () => finish(true));
  }
  /** Ends the edit: saves (through the state, so it is written at once) or cancels. Errors are shown and the cell reverts. */
  function finish(save) {
    const ed = editing;
    if (!ed) return;
    editing = null;
    const input = ed.td.querySelector('input, textarea');
    const text = input ? input.value : '';
    if (save) {
      const c = S.byId(ed.id);
      const r = c ? TM.edit(c, ed.colId, text) : null;
      if (r && r.error) UI.toast(r.error);
      else if (r && r.contact && !SC.model.sameContent(r.contact, c)) S.replaceMany([r.contact]);
    }
    render();
  }

  function mount() {
    const tbl = $('tbl');
    tbl.addEventListener('click', (e) => {
      const sort = e.target.closest('[data-sort]');
      if (sort) {
        const id = sort.dataset.sort;
        S.sort = S.sort.id === id ? { id, dir: S.sort.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' };
        S.emit('render');
        return;
      }
      const box = e.target.closest('input[type="checkbox"]');
      if (box) {
        // The state decides: a checkbox click toggles the row (or every shown row) against the selection.
        if (box.id === 'tblAll') { const all = shown(); S.setSel(all.every((c) => S.sel.has(c.id)) ? [] : all.map((c) => c.id)); }
        else { const id = box.closest('tr').dataset.id; tick(id, !S.sel.has(id), e); }
        return;
      }
      const td = e.target.closest('td[data-col]');
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (td && e.detail === 2 && editable(td)) { startEdit(td); return; }
      clickRow(tr.dataset.id, e);
    });
    tbl.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return; // keys inside an editor are handled there
      const td = e.target.closest && e.target.closest('td[data-col]');
      if (e.key === 'Enter' && td && !editing && editable(td)) { e.preventDefault(); startEdit(td); }
    });
    tbl.addEventListener('dragstart', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr || editing || !e.dataTransfer) return;
      const ids = SC.select.dragIds(tr.dataset.id);
      e.dataTransfer.setData(SC.select.MIME, JSON.stringify(ids));
      e.dataTransfer.setData('text/plain', ids.length + ' contacts');
      e.dataTransfer.effectAllowed = 'copyMove';
    });
    S.on('render', render);
  }

  SC.table = { mount, render, shown, startEdit, finish };
})();
