/* Slopnodes page: the controller. It holds the graph (model.js), works out every result (shared/calc/graph.js), draws it
 * (view.js), and answers the menus, the context menus, the keys, undo and redo, and Slop Drive projects (projects.js).
 * Classic script, last on the page. The working graph is kept on this device; a project is saved to Slop Drive. */
(function () {
  'use strict';
  const C = window.SlopCalc, G = C.graph, M = window.SlopNodesModel, V = window.SlopNodesView, CM = window.SlopNodesMenu;
  const P = window.SlopNodesProjects, K = window.SlopCalcKeep, R = window.SlopCalcRates;
  const $ = (id) => document.getElementById(id);
  const KEY = 'slopnodes.graph', TYPES = ['value', 'formula', 'output', 'note'];
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k), kindName = (type) => t(`nodes.kind.${type}`);
  const S = { g: null, res: new Map(), cycles: new Set(), undo: [], redo: [], sel: { kind: null, id: null }, typing: false,
    moveSnap: null, timer: 0, clip: null, last: { x: 80, y: 80 }, project: { driveId: null, name: '' } };

  const status = (msg) => { $('sn-status').textContent = msg; };
  const today = () => C.dates.localIso();
  const node = (id) => S.g.nodes.find((n) => n.id === id) || null;

  /** Every result, the cycles and the counts; then the drawing. */
  function compute() {
    const r = G.evaluate(S.g.nodes, { links: S.g.links, today: today(), rate: R.factor });
    S.res = r.results; S.cycles = r.cycles;
    V.paint(S.res, S.cycles);
    const shown = S.g.nodes.filter((n) => n.type !== 'note').length, errs = [...S.res.values()].filter((x) => !x.ok).length;
    $('sn-count').textContent = [t('nodes.count.nodes', { n: S.g.nodes.length }), t('nodes.count.wires', { n: S.g.links.length })]
      .concat(S.cycles.size ? [t('nodes.count.loop', { n: S.cycles.size })] : [], errs && shown ? [t('nodes.count.errors', { n: errs })] : []).join(' · ');
  }
  function persist() {
    clearTimeout(S.timer);
    S.timer = setTimeout(() => K.write(KEY, M.save(S.g)), 250);
  }
  /** A change to the graph: redraw the boxes and wires (when they changed), recompute, save the working copy. */
  function changed(redraw) {
    if (redraw) V.sync(S.g);
    compute();
    persist();
  }

  // ---- undo and redo: a snapshot is taken before each change; typing in one box is one step ----
  const snapshot = () => JSON.stringify(M.save(S.g));
  function pushUndo(snap) { S.undo.push(snap); if (S.undo.length > 100) S.undo.shift(); S.redo = []; }
  function beginTyping() { if (!S.typing) { pushUndo(snapshot()); S.typing = true; } }
  function restore(snap) { S.g = M.load(JSON.parse(snap)); S.sel = { kind: null, id: null }; V.select(null, null); changed(true); }
  function undo() { if (!S.undo.length) return status(t('ui.undo.nothing')); S.redo.push(snapshot()); restore(S.undo.pop()); status(t('nodes.st.undone')); }
  function redo() { if (!S.redo.length) return status(t('nodes.st.nothing_redo')); const next = S.redo.pop(); S.undo.push(snapshot()); restore(next); status(t('nodes.st.redone')); }

  // ---- the canvas handlers ----
  const H = {
    move(id, x, y, done) {
      const n = node(id);
      if (!n) return;
      n.x = x; n.y = y;
      if (!done) { if (!S.moveSnap) S.moveSnap = snapshot(); return; }
      if (S.moveSnap) { pushUndo(S.moveSnap); S.moveSnap = null; }
      V.drawWires(S.g);
      persist();
    },
    formula(id, text) { beginTyping(); M.setExpr(S.g, id, text); changed(false); },
    rename(id, text) {
      beginTyping();
      const problem = M.rename(S.g, id, text);
      status(problem || t('nodes.st.named'));
      changed(false);
    },
    connect(from, to) {
      pushUndo(snapshot());
      const problem = M.connect(S.g, from, to);
      if (problem) { S.undo.pop(); status(problem); return; }
      changed(true); status(t('nodes.st.connected'));
    },
    detach(linkId, to) {
      pushUndo(snapshot());
      if (to) {
        const problem = M.reconnect(S.g, linkId, to);
        if (problem) { S.undo.pop(); status(problem); return; }
        changed(true); status(t('nodes.st.wire_moved'));
      } else { M.disconnect(S.g, linkId); changed(true); status(t('nodes.st.wire_removed')); }
    },
    linksInto: (id) => S.g.links.filter((l) => l.to === id),
    nodeOf: (id) => node(id),
    select(kind, id) { S.sel = { kind, id }; },
    changed() { persist(); },
    context(x, y, kind, id) { openMenu(x, y, kind, id); },
  };

  /** World point under the pointer (the zoom and the scroll of the stage are taken into account). */
  function worldAt(clientX, clientY) {
    const r = $('sn-world').getBoundingClientRect(), z = V.zoomNow();
    return { x: Math.max(0, Math.round((clientX - r.left) / z)), y: Math.max(0, Math.round((clientY - r.top) / z)) };
  }
  function addAt(type, pt) {
    pushUndo(snapshot());
    const id = M.addNode(S.g, type, pt);
    S.sel = { kind: 'node', id };
    changed(true);
    const box = document.querySelector('.sn-node[data-id="' + id + '"] .sn-name');
    if (box) box.focus();
    status(t(`nodes.st.added_${type}`));
    return id;
  }
  function addCenter(type) {
    const st = $('sn-stage'), z = V.zoomNow();
    return addAt(type, { x: Math.round((st.scrollLeft + 80) / z), y: Math.round((st.scrollTop + 80) / z) });
  }
  function duplicate(id) {
    const n = node(id);
    if (!n) return;
    pushUndo(snapshot());
    const nid = M.addNode(S.g, n.type, { x: n.x + 36, y: n.y + 36 });
    const copy = node(nid);
    copy.expr = n.expr;
    if (n.type !== 'note') { copy.name = M.uniqueName(S.g, n.type); }
    S.sel = { kind: 'node', id: nid };
    changed(true); status(t('nodes.st.duplicated', { name: n.name }));
  }
  function copySel() {
    const n = S.sel.kind === 'node' ? node(S.sel.id) : null;
    if (!n) return status(t('nodes.st.select_copy'));
    S.clip = { type: n.type, expr: n.expr };
    status(t('nodes.st.copied', { name: n.name || kindName(n.type) }));
  }
  function pasteAt(pt) {
    if (!S.clip) return status(t('nodes.st.nothing_copied'));
    pushUndo(snapshot());
    const id = M.addNode(S.g, S.clip.type, pt || { x: S.last.x + 30, y: S.last.y + 30 });
    node(id).expr = S.clip.expr;
    S.sel = { kind: 'node', id };
    changed(true); status(t('nodes.st.pasted'));
  }
  async function deleteNode(id) {
    const n = node(id);
    if (!n) return;
    const usedBy = S.g.links.filter((l) => l.from === id).length;
    const ok = await SlopUI.confirm(n.name ? t('nodes.dlg.delete', { name: n.name }) : t('nodes.dlg.delete_this'), usedBy ? t('nodes.dlg.delete_wires', { n: usedBy }) : t('nodes.dlg.delete_body'), t('ui.delete'), { danger: true });
    if (!ok) return;
    pushUndo(snapshot());
    M.removeNode(S.g, id);
    S.sel = { kind: null, id: null };
    changed(true); status(t('nodes.st.deleted'));
  }
  function deleteSel() {
    if (S.sel.kind === 'link') { pushUndo(snapshot()); M.disconnect(S.g, S.sel.id); S.sel = { kind: null, id: null }; changed(true); return status(t('nodes.st.wire_removed')); }
    if (S.sel.kind === 'node') return deleteNode(S.sel.id);
    status(t('nodes.st.select_first'));
  }

  function openMenu(x, y, kind, id) {
    S.last = worldAt(x, y);
    if (kind === 'canvas') {
      const items = [
        ...TYPES.map((type) => ({ label: t(`nodes.menu.add_${type}`), act: () => addAt(type, S.last) })),
      ];
      if (S.clip) items.push('-', { label: t('nodes.menu.paste'), act: () => pasteAt(S.last) });
      return CM.open(x, y, items);
    }
    if (kind === 'link') {
      return CM.open(x, y, [{ label: t('nodes.menu.delete_wire'), act: () => { S.sel = { kind: 'link', id }; deleteSel(); } }]);
    }
    const n = node(id);
    if (!n) return;
    const items = [
      { label: t('ui.rename_dots'), act: () => { const b = document.querySelector('.sn-node[data-id="' + id + '"] .sn-name'); if (b) b.focus(); } },
      { label: t('nodes.menu.change_type'), sub: TYPES.map((k) => ({ label: kindName(k), disabled: k === n.type, act: () => { pushUndo(snapshot()); M.setType(S.g, id, k); changed(true); status(t(`nodes.st.now_${k}`)); } })) },
      { label: t('ui.duplicate'), keys: 'Ctrl+D', act: () => duplicate(id) },
      { label: t('ui.copy'), keys: 'Ctrl+C', act: () => { S.sel = { kind: 'node', id }; copySel(); } },
    ];
    if (S.g.links.some((l) => l.from === id || l.to === id)) items.push({ label: t('nodes.menu.disconnect'), act: () => { pushUndo(snapshot()); S.g.links = S.g.links.filter((l) => l.from !== id && l.to !== id); changed(true); status(t('nodes.st.wires_removed')); } });
    items.push('-', { label: t('ui.delete'), keys: 'Del', act: () => deleteNode(id) });
    CM.open(x, y, items);
  }

  // ---- projects in Slop Drive ----
  async function saveProject(asNew) {
    try {
      let name = S.project.name;
      if (asNew || !S.project.driveId) {
        name = await SlopUI.prompt(asNew ? t('nodes.dlg.save_copy') : t('nodes.dlg.save'), t('nodes.dlg.project_name'), name, { ok: t('menu.save') });
        if (!name) return;
        name = String(name).trim().slice(0, 80) || t('nodes.app.untitled');
      }
      const id = await P.save({ driveId: asNew ? null : S.project.driveId, name, graph: M.save(S.g) });
      S.project = { driveId: id, name };
      $('sn-project').textContent = name;
      status(t('nodes.st.saved', { name }));
    } catch (e) { status(t('nodes.st.not_saved', { why: e.message || e })); }
  }
  // Open project… is the one shared Slop Drive picker (SlopIntake.fromDrive, part 'nodes.project'); a file that is not
  // a Slopnodes project is refused in plain words by P.open
  function openProject() {
    const SI = window.SlopIntake;
    if (!SI) return status(t('nodes.st.no_drive'));
    return SI.fromDrive({ title: t('nodes.dlg.open'), accept: ['application/json'], to: SI.part({
      id: 'nodes.project', limit: 1, accept: { types: ['application/json'], exts: ['.json'], noun: 'nodes.app.noun' },
      process: async (f, ctx) => { if (ctx.drive) await loadProject(ctx.drive.id); return f.name; },
    }) });
  }
  async function loadProject(id) {
    try {
      const pr = await P.open(id);
      pushUndo(snapshot());
      S.g = M.load(pr.graph);
      S.project = { driveId: id, name: pr.name };
      $('sn-project').textContent = pr.name;
      changed(true);
      status(t('nodes.st.opened', { name: pr.name }));
    } catch (e) { status(e.message || t('nodes.st.not_opened')); }
  }
  async function newGraph() {
    if (S.g.nodes.length) {
      const ok = await SlopUI.confirm(t('nodes.menu.new'), t('nodes.dlg.new_body'), t('nodes.dlg.new_ok'), { danger: true });
      if (!ok) return;
    }
    pushUndo(snapshot());
    S.g = M.newGraph(); S.project = { driveId: null, name: t('nodes.app.untitled') };
    $('sn-project').textContent = S.project.name;
    changed(true); status(t('nodes.st.new'));
  }
  async function example() {
    if (S.g.nodes.length) {
      const ok = await SlopUI.confirm(t('nodes.menu.example'), t('nodes.dlg.example_body'), t('nodes.dlg.example_ok'), { danger: true });
      if (!ok) return;
    }
    pushUndo(snapshot());
    S.g = sample();
    changed(true); status(t('nodes.st.example'));
  }
  function sample() {
    const g = M.newGraph();
    const pos = (x, y) => ({ x, y });
    const price = M.addNode(g, 'value', pos(40, 60)), qty = M.addNode(g, 'value', pos(40, 230));
    const sub = M.addNode(g, 'formula', pos(330, 140)), total = M.addNode(g, 'output', pos(610, 140)), vat = M.addNode(g, 'formula', pos(610, 330));
    const set = (id, name, expr) => { M.rename(g, id, name); M.setExpr(g, id, expr); };
    set(price, 'price', '19.99 USD'); set(qty, 'qty', '3');
    set(sub, 'subtotal', 'price * qty'); set(total, 'total', 'tax(subtotal, 8)'); set(vat, 'vat', 'total - subtotal');
    M.connect(g, price, sub); M.connect(g, qty, sub); M.connect(g, sub, total); M.connect(g, sub, vat); M.connect(g, total, vat);
    const note = M.addNode(g, 'note', pos(40, 380)); M.setExpr(g, note, t('nodes.st.hint'));
    return g;
  }

  // ---- keys ----
  function onKey(e) {
    const inField = e.target.closest && e.target.closest('input, textarea');
    if (e.key === 'Escape') { if (!inField) V.select(null, null); S.sel = { kind: null, id: null }; return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { if (!inField) { e.preventDefault(); undo(); } return; }
    if (mod && ((e.key === 'z' || e.key === 'Z') && e.shiftKey || e.key === 'y')) { if (!inField) { e.preventDefault(); redo(); } return; }
    if (inField) return;
    if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); if (S.sel.kind === 'node') duplicate(S.sel.id); return; }
    if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copySel(); return; }
    if (mod && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); pasteAt(); return; }
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveProject(false); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); }
  }

  function boot() {
    V.mount($('sn-stage'), $('sn-world'), H);
    const saved = K.read(KEY, null);
    S.g = saved && Array.isArray(saved.nodes) && saved.nodes.length ? M.load(saved) : sample();
    V.zoom(1);
    V.sync(S.g);
    compute();
    if (!S.project.name) S.project.name = t('nodes.app.untitled');
    $('sn-project').textContent = S.project.name;
    $('sn-add-value').addEventListener('click', () => addCenter('value'));
    $('sn-add-formula').addEventListener('click', () => addCenter('formula'));
    $('sn-add-output').addEventListener('click', () => addCenter('output'));
    $('sn-add-note').addEventListener('click', () => addCenter('note'));
    $('sn-zin').addEventListener('click', () => V.zoom(V.zoomNow() * 1.2));
    $('sn-zout').addEventListener('click', () => V.zoom(V.zoomNow() / 1.2));
    $('sn-zreset').addEventListener('click', () => V.zoom(1));
    $('sn-save').addEventListener('click', () => saveProject(false));
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusout', (e) => { if (e.target.matches && e.target.matches('.sn-expr, .sn-name, .sn-note')) S.typing = false; });
    // menus as functions: their words are read in the page's language each time one opens
    if (window.SlopMenuBar) SlopMenuBar.mount({ app: 'Slopnodes', tools: ['#sn-add-value', '#sn-add-formula', '#sn-add-output', '#sn-add-note', '#sn-save'], menus: {
      File: () => [{ label: t('nodes.menu.new'), act: newGraph }, { label: t('nodes.menu.open'), act: openProject }, '-', { label: t('nodes.menu.save'), act: () => saveProject(false), keys: 'Ctrl+S' }, { label: t('nodes.menu.save_copy'), act: () => saveProject(true) }, '-', { label: t('nodes.menu.example'), act: example }],
      Edit: () => [{ label: t('ui.undo'), act: undo, keys: 'Ctrl+Z', disabled: () => !S.undo.length }, { label: t('ui.redo'), act: redo, keys: 'Ctrl+Y', disabled: () => !S.redo.length }, '-',
        { label: t('nodes.menu.copy'), act: copySel, keys: 'Ctrl+C' }, { label: t('nodes.menu.paste'), act: () => pasteAt(), keys: 'Ctrl+V', disabled: () => !S.clip }, { label: t('nodes.menu.duplicate'), act: () => S.sel.kind === 'node' && duplicate(S.sel.id), keys: 'Ctrl+D' }, '-',
        { label: t('nodes.menu.delete_sel'), act: deleteSel, keys: 'Del' }],
      Insert: () => TYPES.map((type) => ({ label: kindName(type), act: () => addCenter(type) })),
      View: () => [{ label: t('ui.zoom_in'), act: () => V.zoom(V.zoomNow() * 1.2) }, { label: t('ui.zoom_out'), act: () => V.zoom(V.zoomNow() / 1.2) }, { label: t('nodes.menu.actual'), act: () => V.zoom(1) }],
      Help: () => [{ label: t('nodes.menu.keys'), act: () => SlopUI.alert(t('nodes.menu.keys'), t('nodes.dlg.keys_body')) }],
    } });
    status(S.g.nodes.length ? t('nodes.st.hint') : t('nodes.st.empty'));
    // a language change: the boxes' type names, the counts and the hint again
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { V.sync(S.g); compute(); status(S.g.nodes.length ? t('nodes.st.hint') : t('nodes.st.empty')); });
  }
  document.addEventListener('DOMContentLoaded', boot);
  /** For the assistant's commands (ai-commands.js): edit(fn) is one change and one undo step (false from fn: no change). */
  window.SlopNodesApp = { compute, graph: () => S.g, results: () => S.res, project: () => S.project, undo,
    edit(fn) { const snap = snapshot(); let r; try { r = fn(S.g); } catch (e) { S.g = M.load(JSON.parse(snap)); changed(true); throw e; } if (r !== false) { pushUndo(snap); changed(true); } else { S.g = M.load(JSON.parse(snap)); changed(true); } return r; },
    replace(g, project) { pushUndo(snapshot()); S.g = g; if (project) { S.project = project; $('sn-project').textContent = project.name; } changed(true); },
    async saveAs(name) { const id = await P.save({ driveId: S.project.driveId, name, graph: M.save(S.g) }); S.project = { driveId: id, name }; $('sn-project').textContent = name; return id; } };
})();
