/* Slop Drive — ui/view-nodes: the open folder as an interactive tree graph (SVG). Pan by dragging the
 * background, zoom with the wheel, pinch or the ± buttons, collapse folders with their ± knob, drag a node
 * onto a folder node to move it (generic drag in dnd.js), double-click to open. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el, NS = 'http://www.w3.org/2000/svg';
  const MAX_FILES = 40, MAX_NODES = 1500, DX = 230, DY = 34, W = 180, H = 26;
  const sv = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  let tx = { x: 40, y: 40, k: 1 }, txFor = undefined;

  /** Build the visible tree from a folder. Returns { root, count }. */
  DR.nodeTree = function (rootId) {
    let count = 0;
    const kindOk = (it) => S.kind === 'all' || it.isFolder || DR.kindOf(it) === S.kind;
    const build = (it, depth) => {
      count++;
      const n = { it, depth, kids: [], more: 0, open: false };
      if (!it.isFolder) return n;
      const c = DR.children(it.id === '__root' ? null : it.id);
      n.hasKids = c.folders.length + c.files.length > 0;
      n.open = n.hasKids && !S.collapsed.has(it.id) && (depth < 4 || S.collapsed.has('+' + it.id)) && count < MAX_NODES;
      if (!n.open) return n;
      const files = DR.sortItems(c.files.filter(kindOk));
      for (const f of DR.sortItems(c.folders)) n.kids.push(build(f, depth + 1));
      for (const f of files.slice(0, MAX_FILES)) { if (count >= MAX_NODES) break; n.kids.push(build(f, depth + 1)); }
      n.more = Math.max(0, files.length - Math.min(files.length, MAX_FILES));
      return n;
    };
    const top = S.cwd ? S.folders.get(S.cwd) : { id: '__root', name: DR.rootName(), isFolder: true, parent: null };
    return { root: build(top, 0), count };
  };
  function layout(root) {
    let row = 0;
    const walk = (n) => {
      n.x = n.depth * DX;
      if (!n.kids.length) { n.y = row++ * DY; if (n.more) row++; return; }
      n.kids.forEach(walk);
      if (n.more) row++;
      n.y = (n.kids[0].y + n.kids[n.kids.length - 1].y) / 2;
    };
    walk(root);
    return row;
  }
  function draw(svg, g, root) {
    const edges = sv('g', { class: 'edges' }), nodes = sv('g', { class: 'nds' });
    const walk = (n) => {
      for (const c of n.kids) edges.append(sv('path', { d: `M${n.x + W},${n.y + H / 2} C${n.x + W + 30},${n.y + H / 2} ${c.x - 30},${c.y + H / 2} ${c.x},${c.y + H / 2}` }));
      if (n.more) {
        const y = (n.kids.length ? n.kids[n.kids.length - 1].y : n.y) + DY;
        edges.append(sv('path', { d: `M${n.x + W},${n.y + H / 2} C${n.x + W + 30},${n.y + H / 2} ${n.x + DX - 30},${y + H / 2} ${n.x + DX},${y + H / 2}` }));
        nodes.append(sv('text', { x: n.x + DX + 8, y: y + H / 2 + 4, class: 'more' }, DR.t('drive.view.more_files', { n: n.more })));
      }
      const it = n.it, real = it.id !== '__root', key = real ? DR.keyOf(it) : null;
      const gN = sv('g', { class: 'nd' + (it.isFolder ? ' fold' : '') + (key && S.sel.has(key) ? ' sel' : '') + (key && S.focus === key ? ' focus' : ''), transform: `translate(${n.x},${n.y})`, 'data-key': key, 'data-drop': it.isFolder ? (real ? it.id : 'root') : null });
      const label = it.name.length > 22 ? it.name.slice(0, 21) + '…' : it.name;
      gN.append(sv('title', null, `${it.name} · ${DR.fmtSize(real ? DR.sizeOf(it) : DR.liveFiles().reduce((a, r) => a + r.size, 0))}`),
        sv('rect', { width: W, height: H, rx: 7 }), sv('rect', { class: 'dot', x: 6, y: 7, width: 12, height: 12, rx: it.isFolder ? 2 : 6, fill: DR.kindColor(it) }),
        sv('text', { x: 24, y: 17 }, label));
      if (n.hasKids) {
        const knob = sv('g', { class: 'knob no-drag no-open', transform: `translate(${W},${H / 2})`, 'data-toggle': it.id }, sv('circle', { r: 8 }), sv('text', { y: 4, 'text-anchor': 'middle' }, n.open ? '−' : '+'));
        gN.append(knob);
      }
      nodes.append(gN);
      n.kids.forEach(walk);
    };
    walk(root);
    g.replaceChildren(edges, nodes);
  }
  const apply = (g) => g.setAttribute('transform', `translate(${tx.x},${tx.y}) scale(${tx.k})`);
  DR.renderNodes = function (pane) {
    if (txFor !== S.cwd) { tx = { x: 40, y: 40, k: 1 }; txFor = S.cwd; }
    const { root } = DR.nodeTree(S.cwd);
    const rows = layout(root);
    const svg = sv('svg', { class: 'viz nodes-svg', role: 'tree', 'aria-label': DR.t('drive.view.folder_graph'), 'data-touch-surface': '' }), g = sv('g');
    svg.append(g); draw(svg, g, root); apply(g);
    const btn = (label, title, fn) => { const b = el('button', { type: 'button', class: 'tb', title, 'aria-label': title }, label); b.addEventListener('click', fn); return b; };
    const zoomBy = (f, cx, cy) => { const r = svg.getBoundingClientRect(); cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy; const k = Math.min(3, Math.max(0.15, tx.k * f)); tx.x = cx - ((cx - tx.x) * k) / tx.k; tx.y = cy - ((cy - tx.y) * k) / tx.k; tx.k = k; apply(g); };
    const fit = () => { const r = svg.getBoundingClientRect(), b = g.getBBox(); const k = Math.min(1.5, Math.max(0.15, Math.min((r.width - 60) / (b.width || 1), (r.height - 60) / (b.height || 1)))); tx = { k, x: 30 - b.x * k, y: 30 - b.y * k }; apply(g); };
    const tools = el('div', { class: 'viz-tools' }, btn('+', DR.t('drive.view.zoom_in'), () => zoomBy(1.25)), btn('−', DR.t('drive.view.zoom_out'), () => zoomBy(0.8)), btn(DR.t('drive.view.fit'), DR.t('drive.view.fit_tip'), fit),
      btn(DR.t('drive.view.all'), DR.t('drive.view.expand_all'), () => { S.collapsed.clear(); for (const f of S.folders.values()) S.collapsed.add('+' + f.id); DR.savePrefs(); DR.render(); }),
      el('span', { class: 'muted' }, DR.t('drive.view.rows_hint', { n: rows })));
    const box = el('div', { class: 'nodes' }, svg, tools);
    pane.append(box);
    // collapse / expand knobs
    svg.addEventListener('click', (e) => {
      const k = e.target.closest('[data-toggle]'); if (!k) return;
      e.stopPropagation();
      const id = k.dataset.toggle, n = find(root, id);
      if (n && n.open) { S.collapsed.add(id); S.collapsed.delete('+' + id); } else { S.collapsed.delete(id); S.collapsed.add('+' + id); }
      DR.savePrefs(); DR.render();
    }, true);
    // pan & pinch
    const pts = new Map();
    let pan = null, pinch = null;
    // Touch: the graph is a touch surface (shared/input) with its own pinch and pan below, so the layer leaves fingers to it.
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-key], [data-toggle]') && e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: tx.k }; pan = null; }
      else pan = { x: e.clientX - tx.x, y: e.clientY - tx.y, moved: false };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()], r = svg.getBoundingClientRect(); zoomBy((Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) * pinch.k / tx.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
      else if (pan) { tx.x = e.clientX - pan.x; tx.y = e.clientY - pan.y; pan.moved = true; apply(g); }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) pan = null; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); else { tx.x -= e.deltaX; tx.y -= e.deltaY; apply(g); } }, { passive: false });
    DR.nodesView = { zoomBy, fit, get tx() { return tx; } };
  };
  function find(n, id) { if (n.it.id === id) return n; for (const c of n.kids) { const f = find(c, id); if (f) return f; } return null; }
})(window.DR);
