/* Slop PDF — the Layers dock section: the layers of the page in view (or the first selected page in the grid), top layer
   first. Each row: select, show or hide, lock or unlock, move up or down, delete. Edits are undoable commands
   (editor/layers-ops.js). Under them, the PDF's own layers (optional content groups: show, hide, delete; tools/ocg-panel.js).
   Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, A = SP.app, O = SP.organizer, L = SP.layers, D = SP.dock, h = U.h, t = U.t;

  /** The page the Layers section shows. */
  function pageId() {
    if (A.mode === 'page' && Ed.pid) return Ed.pid;
    var sel = O.selected();
    return sel[0] || O.focusId || (E.state.pages[0] && E.state.pages[0].id) || null;
  }
  /** A row button. key names it for focus after a re-render. */
  function act(key, label, name, onclick, extra) {
    var b = h('button', { type: 'button', class: 'lyr-b' + (extra && extra.cls ? ' ' + extra.cls : ''), 'data-key': key, 'aria-label': label, title: label, html: U.icon(name) });
    if (extra && extra.disabled) b.disabled = true;
    b.addEventListener('click', onclick);
    return b;
  }
  function select(pid, aid) {
    if (A.mode !== 'page') A.openPage(pid, true);
    Ed.select(aid);
    A.editorSelectionChanged();
  }
  function row(pid, it, n) {
    var a = it.a, id = a.id, hid = L.isHidden(a), lock = L.isLocked(a), on = Ed.selId === id;
    return h('li', { class: 'lyr' + (on ? ' on' : '') + (hid ? ' is-hidden' : '') + (lock ? ' is-locked' : ''), 'data-aid': id },
      act('vis:' + id, t(hid ? 'pdf.tool.layers.show' : 'pdf.tool.layers.hide', { name: it.name }), 'eye', function () { L.set(pid, id, 'hidden', !hid); }, { cls: 'lyr-vis' + (hid ? ' off' : '') }),
      h('button', { type: 'button', class: 'lyr-name', 'data-key': 'sel:' + id, 'aria-current': on ? 'true' : null, title: it.name, onclick: function () { select(pid, id); } }, it.name),
      act('lock:' + id, t(lock ? 'pdf.tool.layers.unlock' : 'pdf.tool.layers.lock', { name: it.name }), 'lock', function () { L.set(pid, id, 'locked', !lock); }, { cls: 'lyr-lock' + (lock ? ' on' : '') }),
      act('up:' + id, t('pdf.tool.layers.up', { name: it.name }), 'up', function () { L.moveLayer(pid, id, 1); }, { disabled: n === 0 }),
      act('down:' + id, t('pdf.tool.layers.down', { name: it.name }), 'down', function () { L.moveLayer(pid, id, -1); }, { disabled: n === it.count - 1 }),
      act('del:' + id, t('pdf.tool.layers.delete', { name: it.name }), 'trash', function () { L.deleteLayer(pid, id); }, { cls: 'lyr-del' }));
  }
  /** Which layers the section lists: 'page' (the page in view) or 'all' (every page, one group each). Kept for the session. */
  var scope = 'page';
  function scopeTabs() {
    var bar = h('div', { class: 'lyr-scope', role: 'tablist', 'aria-label': t('pdf.tool.layers.scope_aria') });
    [['page', t('pdf.tool.layers.scope_page')], ['all', t('pdf.tool.layers.scope_all')]].forEach(function (tb) {
      var b = h('button', { type: 'button', role: 'tab', class: 'lyr-scope-b' + (scope === tb[0] ? ' on' : ''), 'aria-selected': scope === tb[0] ? 'true' : 'false' }, tb[1]);
      b.addEventListener('click', function () { scope = tb[0]; D.refresh(); });
      bar.appendChild(b);
    });
    return bar;
  }
  /** The rows of one page, top layer first. */
  function pageRows(body, p) {
    var items = L.items(p);
    if (!items.length) { body.appendChild(h('p', { class: 'pp-note' }, t('pdf.tool.layers.page_empty'))); return; }
    var list = h('ul', { class: 'lyr-list', 'aria-label': t('pdf.tool.layers.list_aria', { page: String(E.indexOf(p.id) + 1) }) });
    items.forEach(function (it, k) { it.count = items.length; list.appendChild(row(p.id, it, k)); });
    body.appendChild(list);
  }
  function render(body) {
    body.appendChild(scopeTabs());
    if (scope === 'all') {
      var withLayers = E.state.pages.filter(function (p) { return (p.annots || []).length; });
      if (!withLayers.length) { body.appendChild(h('p', { class: 'pp-note' }, t('pdf.tool.layers.doc_empty'))); ocg(body); return; }
      body.appendChild(h('p', { class: 'pp-note' }, t('pdf.tool.layers.pages_with', { n: withLayers.length })));
      E.state.pages.forEach(function (p) {
        if (!(p.annots || []).length) return;
        var group = h('div', { class: 'lyr-group' }, h('h4', { class: 'lyr-group-h' }, t('pdf.tool.layers.page_n', { page: String(E.indexOf(p.id) + 1), n: p.annots.length })));
        body.appendChild(group);
        pageRows(group, p);
      });
    } else {
      var pid = pageId(), p = pid && E.pageById(pid);
      if (!p) { body.appendChild(h('p', { class: 'pp-note' }, t('pdf.tool.layers.no_doc'))); return; }
      body.appendChild(h('p', { class: 'pp-note' }, (p.annots || []).length ? t('pdf.tool.layers.page_n', { page: String(E.indexOf(p.id) + 1), n: p.annots.length }) : t('pdf.tool.layers.page', { page: String(E.indexOf(p.id) + 1) })));
      pageRows(body, p);
    }
    body.appendChild(h('p', { class: 'pp-hint lyr-hint' }, t('pdf.tool.layers.hint')));
    ocg(body);
  }
  /** The PDF's own layers (optional content groups, tools/ocg-panel.js, loaded after the first paint). */
  function ocg(body) { if (SP.ocgPanel && E.state.pages.length) SP.ocgPanel(body); }
  D.add({
    id: 'layers', title: function () { return t('pdf.tool.layers.title'); }, open: true, render: render,
    meta: function () { var pid = pageId(), p = pid && E.pageById(pid); return p && p.annots && p.annots.length ? String(p.annots.length) : ''; },
  });
})();
