/* Slop 3D outliner: the scene as a tree of objects and groups. Click selects (Shift or Ctrl adds), the eye button
 * shows or hides, double-click renames. Drag a row onto the middle of a group to put it inside, onto the top or
 * bottom edge to put it before or after. Selection syncs both ways with the viewport. Sets window.Slop3D.outliner. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const M = S.model, A = S.actions, st = S.state, s = st.s;
  const MIME = 'application/x-slop-3d-node';
  const ICON = { mesh: '◆', group: '▣', light: '☀' };
  const t = S.t;

  function create(root, { rename }) {
    const list = document.createElement('ul');
    list.className = 'outl-list';
    list.setAttribute('role', 'tree');
    list.setAttribute('aria-label', t('3d.outl.label'));
    root.append(list);
    let dragId = null;

    function row(entry) {
      const n = s.doc.nodes[entry.id];
      const li = document.createElement('li');
      li.className = 'outl-row' + (s.sel.includes(n.id) ? ' is-sel' : '') + (n.visible ? '' : ' is-hidden');
      li.dataset.id = n.id;
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-selected', String(s.sel.includes(n.id)));
      li.setAttribute('aria-level', String(entry.depth + 1));
      li.tabIndex = 0;
      li.draggable = true;
      li.style.paddingLeft = (6 + entry.depth * 16) + 'px';
      const kind = n.type === 'light' ? 'light' : n.type;
      const icon = document.createElement('span');
      icon.className = 'outl-icon outl-' + kind;
      icon.textContent = ICON[kind] || '◆';
      icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'outl-name';
      name.textContent = n.name;
      name.title = S.typeLabel(n);
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'outl-eye';
      eye.setAttribute('aria-pressed', String(n.visible));
      eye.setAttribute('aria-label', t(n.visible ? '3d.outl.hide' : '3d.outl.show', { name: n.name }));
      eye.textContent = n.visible ? '●' : '○';
      eye.addEventListener('click', (e) => { e.stopPropagation(); A.setVisible(n.id, !n.visible); });
      li.append(icon, name, eye);
      return li;
    }
    function select(e, id) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const cur = s.sel.slice(), i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1); else cur.push(id);
        st.select(cur);
      } else st.select([id]);
    }
    list.addEventListener('click', (e) => {
      const li = e.target.closest('.outl-row');
      if (li && !e.target.classList.contains('outl-eye')) select(e, li.dataset.id);
    });
    list.addEventListener('dblclick', (e) => {
      const li = e.target.closest('.outl-row');
      if (li) rename(li.dataset.id);
    });
    list.addEventListener('keydown', (e) => {
      const li = e.target.closest && e.target.closest('.outl-row');
      if (!li) return;
      const rows = [...list.querySelectorAll('.outl-row')], i = rows.indexOf(li);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) { next.focus(); select(e, next.dataset.id); }
      }
    });

    /** Drop zone for a row: 'into' (groups, middle), 'before' or 'after'. */
    function zoneOf(li, e) {
      const r = li.getBoundingClientRect(), f = (e.clientY - r.top) / r.height;
      const n = s.doc.nodes[li.dataset.id];
      if (n.type === 'group' && f > 0.25 && f < 0.75) return 'into';
      return f < 0.5 ? 'before' : 'after';
    }
    const clear = () => list.querySelectorAll('.drop-into,.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-into', 'drop-before', 'drop-after'));
    list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.outl-row');
      if (!li) return;
      dragId = li.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(MIME, dragId);
      e.dataTransfer.setData('text/plain', dragId);
    });
    list.addEventListener('dragover', (e) => {
      const li = e.target.closest('.outl-row');
      if (!dragId || !li) return;
      e.preventDefault();
      clear();
      li.classList.add('drop-' + zoneOf(li, e));
    });
    list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) clear(); });
    list.addEventListener('dragend', () => { dragId = null; clear(); });
    list.addEventListener('drop', (e) => { // intake-ok: an object moved in the outliner, not a file
      const li = e.target.closest('.outl-row');
      const id = dragId || e.dataTransfer.getData(MIME);
      clear();
      if (!li || !id) return;
      e.preventDefault();
      dragId = null;
      const target = li.dataset.id, zone = zoneOf(li, e);
      if (zone === 'into') { A.reparent(id, target, -1); return; }
      const parent = s.doc.nodes[target].parent;
      const sibs = M.siblingsOf(s.doc, parent).filter((x) => x !== id);
      const at = sibs.indexOf(target) + (zone === 'after' ? 1 : 0);
      if (id !== target) A.reparent(id, parent, at);
    });

    /** Redraws the rows. Cheap for normal scene sizes. */
    function render() {
      const fragment = document.createDocumentFragment();
      for (const entry of M.flatten(s.doc)) fragment.append(row(entry));
      list.replaceChildren(fragment);
      if (!s.doc.roots.length) {
        const empty = document.createElement('li');
        empty.className = 'outl-empty';
        empty.textContent = t('3d.outl.empty');
        list.append(empty);
      }
    }
    st.on('doc', render);
    st.on('lang', () => { list.setAttribute('aria-label', t('3d.outl.label')); render(); });
    st.on('sel', () => {
      list.querySelectorAll('.outl-row').forEach((li) => {
        const on = s.sel.includes(li.dataset.id);
        li.classList.toggle('is-sel', on);
        li.setAttribute('aria-selected', String(on));
      });
      const p = st.primary();
      const el = p && list.querySelector(`[data-id="${p}"]`);
      if (el && document.activeElement && list.contains(document.activeElement)) el.scrollIntoView({ block: 'nearest' });
    });
    render();
    return { render };
  }

  S.outliner = { create };
})();
