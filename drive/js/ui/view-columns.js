/* Slop Drive — ui/view-columns: Finder-style Miller columns. One column per folder on the path to the open
 * folder; selecting a file adds a preview column, always the last one. → enters a folder, ← goes back out. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el;
  let colUrls = []; // object URLs of the preview column (the info panel keeps and frees its own)
  const freeUrls = () => { colUrls.forEach((u) => URL.revokeObjectURL(u)); colUrls = []; };
  const kindOk = (it) => S.kind === 'all' || (S.kind === 'folder' ? it.isFolder : !it.isFolder && DR.kindOf(it) === S.kind);
  function column(parent, openId) {
    const c = DR.children(parent), list = DR.sortItems([...c.folders, ...c.files].filter((it) => it.isFolder || kindOk(it)));
    const col = el('div', { class: 'col', role: 'listbox', 'aria-label': parent ? S.folders.get(parent).name : DR.rootName(), 'data-drop': parent == null ? 'root' : parent });
    for (const it of list) {
      const key = DR.keyOf(it);
      const n = el('div', { class: 'crow' + (S.sel.has(key) ? ' sel' : '') + (it.isFolder && it.id === openId ? ' open' : '') + (S.focus === key ? ' focus' : ''), role: 'option', 'data-key': key, title: it.name, 'aria-selected': String(S.sel.has(key)) },
        DR.badge(it, 'badge xs'), el('span', { class: 'nm' }, it.name), it.starred ? DR.icon('star', 'ic st') : '', it.isFolder ? DR.icon('chev', 'ic more') : el('span', { class: 'sz' }, DR.fmtSize(it.size)));
      if (it.isFolder) n.dataset.drop = it.id;
      col.append(n);
    }
    if (!list.length) col.append(el('p', { class: 'col-empty' }, DR.t('drive.view.empty_folder')));
    return col;
  }
  function previewCol(r) {
    const col = el('div', { class: 'col col-pv' });
    col.append(DR.previewOf(r, false, colUrls), el('b', { class: 'pv-name' }, r.name), el('div', { class: 'muted' }, `${DR.kindLabel(r)} · ${DR.fmtSize(r.size)}`), el('div', { class: 'muted' }, DR.t('drive.view.modified_at', { date: DR.fmtFull(r.modified || r.time) })), el('div', { class: 'muted' }, DR.t('drive.view.made_by', { app: DR.appName(r.from) })));
    return col;
  }
  /** The preview column: at most one, always the last column, showing the one selected file (if exactly one file is and the details panel is closed). */
  function placePreview(wrap) {
    wrap.querySelectorAll('.col-pv').forEach((n) => n.remove());
    freeUrls();
    const sel = DR.selected();
    // The details panel already shows the selected file's preview, so the column is left out while it is open.
    // S.info is read here, not the info-on class: DR.render() places the columns before renderInfo() sets the class.
    if (S.info) return;
    if (sel.length === 1 && !sel[0].isFolder) wrap.append(previewCol(sel[0]));
  }
  /** The folder columns: the root, then each folder on the path down to the open folder. */
  function folderCols(wrap) {
    const path = DR.pathOf(S.cwd);
    const parents = [null, ...path.map((f) => f.id)];
    parents.forEach((p, i) => wrap.append(column(p, path[i] ? path[i].id : null)));
  }
  DR.renderColumns = function (pane) {
    const wrap = el('div', { class: 'cols' });
    freeUrls();
    folderCols(wrap);
    placePreview(wrap);
    pane.append(wrap);
    requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  };
  // A selection change moves the preview column; folders open on click.
  DR.onSelectColumns = function () {
    if (DR.viewNow() !== 'columns') return;
    const wrap = DR.$('pane').querySelector('.cols'); if (!wrap) return;
    placePreview(wrap);
    wrap.scrollLeft = wrap.scrollWidth;
  };
  document.addEventListener('click', (e) => {
    if (DR.viewNow() !== 'columns' || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const row = e.target.closest('#pane .crow'); if (!row) return;
    const it = DR.item(row.dataset.key);
    if (it && it.isFolder && S.cwd !== it.id) { DR.go(it.id); DR.select(['d:' + it.id]); }
    else if (it && !it.isFolder && it.parent !== S.cwd) { DR.go(it.parent); DR.select([row.dataset.key]); }
  });
  /** Column-view arrow keys. Returns true when handled. */
  DR.columnKeys = function (e) {
    if (DR.viewNow() !== 'columns') return false;
    const it = DR.item(S.focus);
    if (e.key === 'ArrowRight' && it && it.isFolder) {
      e.preventDefault(); DR.go(it.id);
      // the newest folder column (the preview column is never a folder column)
      const cols = document.querySelectorAll('#pane .cols .col:not(.col-pv)');
      const first = cols.length && cols[cols.length - 1].querySelector('.crow'); if (first) DR.select([first.dataset.key]);
      return true;
    }
    if (e.key === 'ArrowLeft' && S.cwd) { e.preventDefault(); DR.up(); return true; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && it) {
      e.preventDefault();
      const col = document.querySelector(`#pane .crow[data-key="${CSS.escape(S.focus)}"]`).parentElement, rows = [...col.querySelectorAll('.crow')];
      const n = rows[rows.findIndex((r) => r.dataset.key === S.focus) + (e.key === 'ArrowUp' ? -1 : 1)];
      if (n) { const nit = DR.item(n.dataset.key); if (nit.isFolder) DR.go(nit.id); else if (nit.parent !== S.cwd) DR.go(nit.parent); DR.select([n.dataset.key]); const m = document.querySelector(`#pane .crow[data-key="${CSS.escape(n.dataset.key)}"]`); if (m) m.scrollIntoView({ block: 'nearest' }); }
      return true;
    }
    return false;
  };
})(window.DR);
