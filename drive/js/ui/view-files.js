/* Slop Drive — ui/view-files: the Grid (thumbnails), List (sortable columns) and Compact views.
 * Every item element carries data-key; folders also carry data-drop so items can be dragged onto them.
 * The List view's columns are in list-cols.js. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el;
  /** A file's icon: a coloured badge with its extension; folders get the folder glyph. */
  DR.badge = function (it, cls = 'badge') {
    if (it.isFolder) { const s = DR.icon('folder', 'ic fold'); return el('span', { class: cls + ' is-folder' }, s); }
    const e = (DR.ext(it.name) || (it.type || '').split('/').pop() || '?').slice(0, 4).toUpperCase();
    return el('span', { class: cls, style: `--k:${DR.kindColor(it)}` }, el('span', null, e));
  };
  /** The list's icon: the file's thumbnail when it is ready, otherwise its badge (folders always get the glyph). */
  DR.iconOf = function (it, cls = 'badge') {
    const b = DR.badge(it, cls);
    if (!it.isFolder) DR.fillThumb(b, it);
    return b;
  };
  function base(it, cls) {
    const key = DR.keyOf(it);
    const n = el('div', { class: 'it ' + cls + (S.sel.has(key) ? ' sel' : '') + (S.focus === key ? ' focus' : '') + (S.clip && S.clip.cut && S.clip.keys.includes(key) ? ' cut' : ''),
      role: 'option', 'aria-selected': String(S.sel.has(key)), 'data-key': key, title: it.name });
    if (it.isFolder && !it.trashedAt) n.dataset.drop = it.id;
    return n;
  }
  const star = (it) => (it.starred ? DR.icon('star', 'ic st') : '');

  function card(it) {
    const n = base(it, 'card'), th = el('div', { class: 'th' }, DR.badge(it, 'badge big'));
    if (!it.isFolder) DR.fillThumb(th, it);
    const sub = it.isFolder ? DR.t('drive.app.items_n', { n: DR.countOf(it.id) }) : DR.searching() || S.section !== 'folder' ? DR.pathOf(it.parent).map((f) => f.name).join(' / ') || DR.rootName() : `${DR.fmtSize(it.size)} · ${DR.fmtDate(it.modified || it.time)}`;
    n.append(th, el('div', { class: 'cap' }, el('div', { class: 'nm' }, star(it), el('span', null, it.name)), el('div', { class: 'sub' }, sub)));
    return n;
  }
  function row(it) {
    const n = base(it, 'row');
    for (const c of DR.listCols()) n.append(DR.listCell(c.key, it));
    return n;
  }
  function compact(it) {
    const n = base(it, 'mini');
    n.append(DR.badge(it, 'badge xs'), el('span', { class: 'nm' }, it.name), star(it), el('span', { class: 'sz' }, it.isFolder ? '' : DR.fmtSize(it.size)));
    return n;
  }
  /** Render list into the pane for view grid | list | compact. */
  DR.renderFiles = function (pane, list, view) {
    const wrap = el('div', { class: 'files v-' + view, role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': DR.placeName() });
    if (view === 'list') { wrap.style.setProperty('--cols', DR.listTemplate()); wrap.append(DR.listHead()); }
    const make = view === 'grid' ? card : view === 'list' ? row : compact;
    const CHUNK = 400;
    for (const it of list.slice(0, CHUNK)) wrap.append(make(it));
    if (list.length > CHUNK) { // render the rest when idle so huge folders stay snappy
      let i = CHUNK;
      const more = () => { if (!wrap.isConnected) return; const end = Math.min(list.length, i + CHUNK); for (; i < end; i++) wrap.append(make(list[i])); if (i < list.length) requestAnimationFrame(more); };
      requestAnimationFrame(more);
    }
    pane.append(wrap);
  };
})(window.DR);
