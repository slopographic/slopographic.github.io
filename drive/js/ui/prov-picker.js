/* Slop Drive — ui/prov-picker: the destination picker for Move to… and Copy to…. It shows the same places as the sidebar,
 * Slop Drive first, then the Local folder and each named drive, each one expandable. A folder being moved (and what is in
 * it) is greyed out, and a place that needs access first is shown but cannot be chosen. Resolves to a 'pv:' target value
 * (see providers.js resolveDest), or undefined when cancelled. */
'use strict';
(function (DR) {
  const el = DR.el;
  const key = (id, ref) => id + '|' + (ref || '');

  DR.providerPicker = async function ({ title = DR.t('drive.dlg.choose_folder'), ok = DR.t('drive.dlg.move_here'), exclude = [], start = null } = {}) {
    const places = await DR.providerList().catch(() => []);
    const open = new Set(), cache = new Map();
    const place = (id) => places.find((p) => p.id === id);
    const blocked = (d, ref) => exclude.some((x) => x.id === d.id && d.provider.within(x.ref, ref));
    const ancestors = (d, ref) => (d.provider.kind === 'internal'
      ? DR.pathOf(ref || null).map((f) => f.id)
      : String(ref || '').split('/').filter(Boolean).map((_, i, a) => a.slice(0, i + 1).join('/')));
    let chosen = null;
    if (start && place(start.id)) {
      const d = place(start.id);
      open.add(key(d.id, ''));
      for (const a of ancestors(d, start.ref)) open.add(key(d.id, a));
      chosen = { id: d.id, ref: start.ref || '', label: d.label };
    }

    const tree = el('div', { class: 'pick-tree', role: 'tree', 'aria-label': title });
    const hint = el('p', { class: 'sui-p pick-hint', 'aria-live': 'polite' }, '');
    const listOf = async (d, ref) => {
      const k = key(d.id, ref);
      if (!cache.has(k)) cache.set(k, await d.provider.list(ref).catch((e) => ({ error: e.message || DR.t('drive.prov.unreadable') })));
      return cache.get(k);
    };
    const row = (d, ref, name, depth, isOpen, off, isRoot, expandable) => {
      const on = !!chosen && chosen.id === d.id && chosen.ref === (ref || '');
      const tw = el('span', { class: 'twisty' + (expandable ? '' : ' none') + (isOpen ? ' open' : ''), 'aria-hidden': 'true' }, DR.icon('chev'));
      const b = el('button', { type: 'button', class: 'node pick-row' + (on ? ' on' : '') + (off ? ' off' : ''), role: 'treeitem', 'aria-selected': String(on), 'aria-expanded': expandable ? String(isOpen) : null, 'aria-disabled': off ? 'true' : null, style: `--d:${depth}`, title: name },
        tw, DR.icon(isRoot ? 'home' : 'folder'), el('span', { class: 'nm' }, name));
      tw.addEventListener('click', (e) => { e.stopPropagation(); if (!expandable) return; if (isOpen) open.delete(key(d.id, ref)); else open.add(key(d.id, ref)); redraw(); });
      b.addEventListener('click', () => { if (off) return; chosen = { id: d.id, ref: ref || '', label: d.label }; hint.textContent = ''; redraw(); });
      return b;
    };
    async function rowsFor(d, ref, depth, out) {
      const c = await listOf(d, ref);
      if (c.error) { out.push(el('div', { class: 'pv-note', style: `--d:${depth}` }, c.error)); return; }
      for (const f of c.folders) {
        const off = blocked(d, f.ref), isOpen = !off && open.has(key(d.id, f.ref));
        out.push(row(d, f.ref, f.name, depth, isOpen, off, false, !off));
        if (isOpen) await rowsFor(d, f.ref, depth + 1, out);
      }
    }
    async function redraw() {
      const out = [];
      for (const d of places) {
        const granted = d.status === 'granted', isOpen = granted && open.has(key(d.id, ''));
        const name = d.provider.kind === 'internal' ? DR.rootName() : d.label;
        const off = !granted;
        out.push(row(d, '', name, 0, isOpen, off, true, granted));
        if (off) out.push(el('div', { class: 'pv-note', style: '--d:1' }, DR.t('drive.dlg.allow_sidebar')));
        if (isOpen) await rowsFor(d, '', 1, out);
      }
      tree.replaceChildren(...out);
    }

    return new Promise((resolve) => {
      let result;
      window.SlopUI.dialog({
        title, cls: 'pick-dlg', body: el('div', { class: 'pick-body' }, tree, hint),
        buttons: [{ label: DR.t('menu.cancel') }, {
          label: ok, primary: true,
          act: () => {
            if (!chosen) { hint.textContent = DR.t('drive.dlg.choose_first'); return false; }
            result = DR.pv(chosen.id, chosen.ref);
          },
        }],
        onClose: () => resolve(result),
      });
      redraw();
    });
  };
})(window.DR);
