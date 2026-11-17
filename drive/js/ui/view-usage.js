/* Slop Drive — ui/view-usage: where the bytes are, WinDirStat / DaisyDisk style. A squarified treemap
 * (nested folders) or a sunburst (rings by depth), sized by bytes and coloured by kind. Click a folder to
 * drill in (the breadcrumbs go back out), click a file to select it, hover for name and size. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el, NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };

  /** Size tree of a folder: { it, size, kids } (files are leaves). */
  DR.usageTree = function (id, depth = 0, max = 6) {
    const c = DR.children(id), kids = [];
    for (const f of c.folders) { const t = depth < max ? DR.usageTree(f.id, depth + 1, max) : { size: DR.sizeOf(f), kids: [] }; t.it = f; kids.push(t); }
    for (const r of c.files) if (S.kind === 'all' || DR.kindOf(r) === S.kind) kids.push({ it: r, size: r.size || 0, kids: [] });
    kids.sort((a, b) => b.size - a.size);
    return { it: id ? S.folders.get(id) : null, size: kids.reduce((n, k) => n + k.size, 0), kids };
  };
  /** Squarified treemap (Bruls et al.): lays items [{ size }] into rect, returns [{ node, x, y, w, h }]. */
  DR.squarify = function (items, x, y, w, h) {
    const out = [], total = items.reduce((n, i) => n + i.size, 0);
    if (!total || w <= 0 || h <= 0) return out;
    const scale = (w * h) / total, rest = items.filter((i) => i.size > 0).map((i) => ({ node: i, a: i.size * scale }));
    const worst = (row, side) => { const s = row.reduce((n, r) => n + r.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
    let row = [];
    while (rest.length) {
      const side = Math.min(w, h), next = rest[0];
      if (!row.length || worst(row.concat(next), side) <= worst(row, side)) { row.push(rest.shift()); continue; }
      ({ x, y, w, h } = place(row, x, y, w, h, out)); row = [];
    }
    if (row.length) place(row, x, y, w, h, out);
    return out;
  };
  function place(row, x, y, w, h, out) {
    const s = row.reduce((n, r) => n + r.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; for (const r of row) { const rh = r.a / cw; out.push({ node: r.node, x, y: cy, w: cw, h: rh }); cy += rh; } return { x: x + cw, y, w: w - cw, h }; }
    const ch = s / w; let cx = x; for (const r of row) { const rw = r.a / ch; out.push({ node: r.node, x: cx, y, w: rw, h: ch }); cx += rw; } return { x, y: y + ch, w, h: h - ch };
  }
  const keyAttr = (n) => (n.it ? DR.keyOf(n.it) : null);
  const tip = (n, total) => `${n.it ? n.it.name : DR.rootName()}\n${DR.fmtSize(n.size)}${total ? ` · ${((n.size / total) * 100).toFixed(1)}%` : ''}`;

  function treemap(svg, tree, W, H) {
    const total = tree.size;
    const walk = (n, x, y, w, h, depth) => {
      for (const c of DR.squarify(n.kids, x, y, w, h)) {
        const fold = c.node.it && c.node.it.isFolder, key = keyAttr(c.node);
        const g = sv('g', { class: 'tm' + (fold ? ' fold' : '') + (S.sel.has(key) ? ' sel' : ''), 'data-key': key, 'data-drop': fold ? c.node.it.id : null, 'data-tip': tip(c.node, total) });
        g.append(sv('rect', { x: c.x + 0.5, y: c.y + 0.5, width: Math.max(0, c.w - 1), height: Math.max(0, c.h - 1), fill: fold ? 'var(--panel-2)' : DR.kindColor(c.node.it), 'fill-opacity': fold ? 1 : Math.max(0.45, 0.95 - depth * 0.12) }));
        const big = c.w > 54 && c.h > 18;
        if (big) g.append(sv('text', { x: c.x + 5, y: c.y + 13, class: fold ? 'tl' : 'tl ink' }, fit(c.node.it.name, c.w - 10) + (c.w > 120 ? '  ' + DR.fmtSize(c.node.size) : '')));
        svg.append(g);
        if (fold && c.node.kids.length && c.w > 40 && c.h > 40 && depth < 5) walk(c.node, c.x + 3, c.y + (big ? 18 : 3), c.w - 6, c.h - (big ? 21 : 6), depth + 1);
      }
    };
    walk(tree, 0, 0, W, H, 0);
  }
  const fit = (s, w) => { const n = Math.max(1, Math.floor(w / 6.4)); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };

  function sunburst(svg, tree, W, H) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 8, ring = R / 5, total = tree.size;
    const arc = (r0, r1, a0, a1) => {
      if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
      const p = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`, big = a1 - a0 > Math.PI ? 1 : 0;
      return `M${p(r0, a0)}L${p(r1, a0)}A${r1},${r1} 0 ${big} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${big} 0 ${p(r0, a0)}Z`;
    };
    const walk = (n, a0, a1, depth) => {
      let a = a0;
      for (const c of n.kids) {
        const span = n.size ? ((a1 - a0) * c.size) / n.size : 0;
        if (span > 0.004) {
          const fold = c.it && c.it.isFolder, key = keyAttr(c);
          const col = fold ? mixFolder(c) : DR.kindColor(c.it);
          svg.append(sv('path', { d: arc(ring * depth, ring * (depth + 1) - 1, a - Math.PI / 2, a + span - Math.PI / 2), fill: col, 'fill-opacity': fold ? 0.55 : 0.92,
            class: 'sb' + (fold ? ' fold' : '') + (S.sel.has(key) ? ' sel' : ''), 'data-key': key, 'data-drop': fold ? c.it.id : null, 'data-tip': tip(c, total) }));
          if (fold && depth < 4) walk(c, a, a + span, depth + 1);
        }
        a += span;
      }
    };
    walk(tree, 0, Math.PI * 2, 1);
    const center = sv('g', { class: 'sb-c', 'data-tip': tip(tree, 0), 'data-up': '1' }, sv('circle', { cx, cy, r: ring - 2 }),
      sv('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'c1' }, fit(tree.it ? tree.it.name : DR.rootName(), ring * 2 - 10)),
      sv('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'c2' }, DR.fmtSize(tree.size)));
    svg.append(center);
  }
  /** A folder's colour: the colour of the kind that takes most of its bytes. */
  function mixFolder(n) {
    const by = new Map(), add = (t) => { for (const k of t.kids) if (k.it && !k.it.isFolder) by.set(DR.kindOf(k.it), (by.get(DR.kindOf(k.it)) || 0) + k.size); else add(k); };
    add(n);
    let best = 'folder', bv = -1; for (const [k, v] of by) if (v > bv) { bv = v; best = k; }
    return DR.KIND[best].color;
  }

  DR.renderUsage = function (pane) {
    const tree = DR.usageTree(S.cwd);
    const seg = el('div', { class: 'seg' }, ['treemap', 'sunburst'].map((m) => { const b = el('button', { type: 'button', 'data-usage': m, 'aria-pressed': String(S.usageMode === m), style: 'width:auto;padding:0 10px' }, DR.t(m === 'treemap' ? 'drive.view.treemap' : 'drive.view.sunburst')); b.addEventListener('click', () => { S.usageMode = m; DR.savePrefs(); DR.render(); }); return b; }));
    const legend = el('div', { class: 'legend' }, DR.KINDS.filter((k) => k.id !== 'folder').map((k) => el('span', { style: `--k:${k.color}` }, DR.kindName(k.id))));
    const box = el('div', { class: 'usage' }, el('div', { class: 'viz-tools top' }, seg, el('b', null, `${DR.placeName()} · ${DR.fmtSize(tree.size)}`), legend));
    const stage = el('div', { class: 'stage' }), tipEl = el('div', { class: 'viz-tip', hidden: true });
    box.append(stage, tipEl);
    pane.append(box);
    const r = stage.getBoundingClientRect(), W = Math.max(200, r.width), H = Math.max(200, r.height);
    const svg = sv('svg', { class: 'viz', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': DR.t('drive.view.usage_of', { place: DR.placeName() }) });
    stage.append(svg);
    if (!tree.size) { stage.replaceChildren(el('p', { class: 'muted center' }, DR.t('drive.view.usage_empty'))); return; }
    if (S.usageMode === 'sunburst') sunburst(svg, tree, W, H); else treemap(svg, tree, W, H);
    svg.addEventListener('pointermove', (e) => {
      const t = e.target.closest('[data-tip]'); tipEl.hidden = !t; if (!t) return;
      tipEl.textContent = t.dataset.tip;
      const br = box.getBoundingClientRect();
      tipEl.style.left = Math.min(br.width - 180, e.clientX - br.left + 14) + 'px'; tipEl.style.top = (e.clientY - br.top + 14) + 'px';
    });
    svg.addEventListener('pointerleave', () => { tipEl.hidden = true; });
    svg.addEventListener('click', (e) => {
      if (e.target.closest('[data-up]')) { if (S.cwd) DR.up(); return; }
      const t = e.target.closest('[data-key]'); if (!t || e.shiftKey || e.ctrlKey || e.metaKey) return;
      const it = DR.item(t.dataset.key);
      if (it && it.isFolder) { e.stopPropagation(); DR.go(it.id); }
    }, true);
  };
})(window.DR);
