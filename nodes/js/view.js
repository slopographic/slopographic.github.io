/* Slopnodes canvas: draws the node boxes and the wires, and handles the pointer. It reports what the person does to the app
 * through handlers (it changes no graph data itself). Classic script. Exposes window.SlopNodesView:
 *   mount(stage, world, handlers)   stage = the scrolling box, world = the zoomed layer (positioned children)
 *   sync(graph)                     make the boxes match graph.nodes; wires match graph.links
 *   paint(results, cycles)          result lines and states
 *   zoom(z) / zoomNow()             the zoom (0.5 to 1.6)
 *   select(kind, id) / selection()  kind 'node' | 'link' | null
 * Handlers: move(id, x, y, done), formula(id, text), rename(id, text), connect(from, to), detach(linkId, to|null),
 *   context(clientX, clientY, kind, id), select(kind, id), changed(). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 230, HEAD = 34, MIN_Z = 0.5, MAX_Z = 1.6;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const KIND = (type) => t(`nodes.kind.${type in { value: 1, output: 1, note: 1 } ? type : 'formula'}`);
  let stage = null, world = null, wires = null, temp = null, H = {}, boxes = new Map(), z = 1, sel = { kind: null, id: null };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const at = (clientX, clientY) => { const r = world.getBoundingClientRect(); return { x: (clientX - r.left) / z, y: (clientY - r.top) / z }; };

  function mount(s, w, handlers) {
    stage = s; world = w; H = handlers || {};
    wires = svg('svg', { class: 'sn-wires', 'aria-hidden': 'true' });
    temp = svg('path', { class: 'sn-wire sn-temp', hidden: '' });
    wires.append(temp);
    world.prepend(wires);
    // A touch surface (shared/input): one finger drags nodes, wires or the canvas (never a page scroll); two fingers
    // pinch the zoom and pan the stage.
    stage.setAttribute('data-touch-surface', '');
    stage.touchSurface = { zoom: (f) => zoomBy(f), pan: (dx, dy) => { stage.scrollLeft -= dx; stage.scrollTop -= dy; } };
    world.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const node = e.target.closest('.sn-node'), hit = e.target.closest('.sn-hit');
      const kind = node ? 'node' : hit ? 'link' : 'canvas', id = node ? node.dataset.id : hit ? hit.dataset.id : null;
      if (kind !== 'canvas') select(kind, id);
      if (H.context) H.context(e.clientX, e.clientY, kind, id);
    });
    world.addEventListener('pointerdown', background);
    world.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); } }, { passive: false });
  }

  /** Empty canvas: a click clears the selection; a drag pans the stage. */
  function background(e) {
    if (e.button !== 0 || e.target.closest('.sn-node, .sn-hit')) return;
    select(null, null);
    let x = e.clientX, y = e.clientY;
    const move = (ev) => { stage.scrollLeft -= (ev.clientX - x); stage.scrollTop -= (ev.clientY - y); x = ev.clientX; y = ev.clientY; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function select(kind, id) {
    sel = { kind, id };
    for (const [nid, box] of boxes) box.classList.toggle('is-sel', kind === 'node' && nid === id);
    wires.querySelectorAll('.sn-wire[data-id]').forEach((p) => p.classList.toggle('is-sel', kind === 'link' && p.dataset.id === id));
    if (H.select) H.select(kind, id);
  }
  const selection = () => ({ ...sel });

  /** One box per node: a head (type, name, menu), the formula or note text, the result, and two ports. */
  function build(n) {
    const box = el('div', 'sn-node');
    box.dataset.id = n.id; box.dataset.type = n.type;
    const head = el('div', 'sn-head');
    head.append(el('span', 'sn-kind', KIND(n.type)));
    const name = el('input', 'sn-name'); name.spellcheck = false; name.autocomplete = 'off';
        name.addEventListener('input', () => H.rename && H.rename(n.id, name.value));
    const more = el('button', 'sn-more', '⋯'); more.type = 'button'; more.dataset.i18nAttr = 'aria-label:nodes.view.menu'; more.setAttribute('aria-label', t('nodes.view.menu'));
    more.addEventListener('click', (e) => { const r = more.getBoundingClientRect(); select('node', n.id); H.context && H.context(r.left, r.bottom, 'node', n.id); e.stopPropagation(); });
    head.append(name, more);
    let body;
    if (n.type === 'note') {
      body = el('textarea', 'sn-note'); body.spellcheck = true;
      body.dataset.i18nAttr = 'aria-label:nodes.view.note_aria'; body.setAttribute('aria-label', t('nodes.view.note_aria'));
    } else {
      body = el('input', 'sn-expr'); body.spellcheck = false; body.autocomplete = 'off';
    }
    body.addEventListener('input', () => H.formula && H.formula(n.id, body.value));
    const res = el('p', 'sn-res'); res.setAttribute('aria-live', 'polite');
    box.append(head, body, res);
    if (n.type !== 'note') {
      const pin = el('span', 'sn-port sn-in'); pin.dataset.id = n.id; pin.dataset.i18nAttr = 'title:nodes.view.pin_in'; pin.title = t('nodes.view.pin_in');
      const pout = el('span', 'sn-port sn-out'); pout.dataset.id = n.id; pout.dataset.i18nAttr = 'title:nodes.view.pin_out'; pout.title = t('nodes.view.pin_out');
      box.append(pin, pout);
      pin.addEventListener('pointerdown', (e) => portDown(e, n.id, 'in'));
      pout.addEventListener('pointerdown', (e) => portDown(e, n.id, 'out'));
    }
    head.addEventListener('pointerdown', (e) => { if (!e.target.closest('input, button')) dragNode(e, box, n.id); else select('node', n.id); });
    box.addEventListener('pointerdown', (e) => { if (e.target === box || e.target.closest('.sn-res')) select('node', n.id); });
    box._parts = { name, body, res, type: n.type };
    return box;
  }

  function place(box, n) {
    box.style.left = n.x + 'px'; box.style.top = n.y + 'px';
    box.dataset.type = n.type;
    box.querySelector('.sn-kind').textContent = KIND(n.type);
    const p = box._parts;
    if (document.activeElement !== p.name) p.name.value = n.name;
    p.name.setAttribute('aria-label', t(`nodes.view.name_${n.type in { value: 1, output: 1, note: 1 } ? n.type : 'formula'}`));
    if (n.type !== 'note') p.body.setAttribute('aria-label', n.name ? t('nodes.view.expr_aria', { name: n.name }) : t('nodes.view.expr_aria_any'));
    if (document.activeElement !== p.body && p.body.value !== n.expr) p.body.value = n.expr;
  }

  function sync(graph) {
    const keep = new Set(graph.nodes.map((n) => n.id));
    for (const [id, box] of boxes) if (!keep.has(id)) { box.remove(); boxes.delete(id); }
    for (const n of graph.nodes) {
      let box = boxes.get(n.id);
      if (!box || box._parts.type !== n.type) { if (box) box.remove(); box = build(n); boxes.set(n.id, box); world.append(box); }
      place(box, n);
    }
    drawWires(graph);
  }

  /** The wires: a visible curve and a wide invisible one for pointing at it. */
  function drawWires(graph) {
    wires.querySelectorAll('.sn-wire[data-id], .sn-hit[data-id]').forEach((p) => p.remove());
    const at2 = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const l of graph.links) {
      const a = at2.get(l.from), b = at2.get(l.to);
      if (!a || !b) continue;
      const x1 = a.x + W, y1 = a.y + HEAD / 2, x2 = b.x, y2 = b.y + HEAD / 2, dx = Math.max(60, Math.abs(x2 - x1) / 2);
      const d = `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const hit = svg('path', { d, class: 'sn-hit', 'data-id': l.id });
      hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); select('link', l.id); });
      const vis = svg('path', { d, class: 'sn-wire' + (sel.kind === 'link' && sel.id === l.id ? ' is-sel' : ''), 'data-id': l.id });
      wires.insertBefore(hit, temp); wires.insertBefore(vis, temp);
    }
  }

  function paint(results, cycles) {
    for (const [id, box] of boxes) {
      const r = results.get(id), p = box._parts;
      if (p.type === 'note') { p.res.hidden = true; continue; }
      p.res.hidden = false;
      p.res.textContent = !r ? '' : r.ok ? r.text : r.error.message;
      p.res.classList.toggle('sn-err', !!r && !r.ok);
      p.res.classList.toggle('is-big', !!r && r.ok && p.type === 'output');
      box.classList.toggle('is-cycle', cycles.has(id));
      box.classList.toggle('is-bad', !!r && !r.ok && !cycles.has(id));
    }
  }

  /** Dragging a node by its head. The move is reported live and once more at the end (done = true). */
  function dragNode(e, box, id) {
    if (e.button !== 0) return;
    select('node', id);
    const start = at(e.clientX, e.clientY), x0 = parseFloat(box.style.left) || 0, y0 = parseFloat(box.style.top) || 0;
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* a finished or synthetic pointer */ }
    box.classList.add('is-drag');
    const move = (ev) => {
      const p = at(ev.clientX, ev.clientY);
      const nx = Math.max(0, Math.round(x0 + p.x - start.x)), ny = Math.max(0, Math.round(y0 + p.y - start.y));
      box.style.left = nx + 'px'; box.style.top = ny + 'px';
      if (H.move) H.move(id, nx, ny, false);
    };
    const up = (ev) => {
      box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up);
      box.classList.remove('is-drag');
      const p = at(ev.clientX, ev.clientY);
      if (H.move) H.move(id, Math.max(0, Math.round(x0 + p.x - start.x)), Math.max(0, Math.round(y0 + p.y - start.y)), true);
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up); // a second finger (the pinch) or the system took it: it stays where it is
  }

  /** Ports. From an output: a wire follows the pointer and lands on an input. From an input that has wires: the last wire
   *  into it is picked up at its input end; dropped on another input it moves, dropped elsewhere it is removed. */
  function portDown(e, id, side) {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const linkFrom = side === 'in' ? lastLinkInto(id) : null;
    const fromId = side === 'out' ? id : (linkFrom ? linkFrom.from : null);
    if (!fromId) return;
    const linkId = linkFrom ? linkFrom.id : null;
    const src = H.nodeOf ? H.nodeOf(fromId) : null;
    if (!src) return;
    const sx = src.x + W, sy = src.y + HEAD / 2;
    temp.removeAttribute('hidden');
    const draw = (p) => {
      const dx = Math.max(50, Math.abs(p.x - sx) / 2);
      temp.setAttribute('d', `M${sx} ${sy} C${sx + dx} ${sy}, ${p.x - dx} ${p.y}, ${p.x} ${p.y}`);
    };
    const move = (ev) => draw(at(ev.clientX, ev.clientY));
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      temp.setAttribute('hidden', '');
      if (ev.type === 'pointercancel') return;
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const port = target && target.closest && target.closest('.sn-in');
      const to = port ? port.dataset.id : null;
      if (side === 'out') { if (to && H.connect) H.connect(fromId, to); }
      else if (linkId) { if (H.detach) H.detach(linkId, to); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    draw(at(e.clientX, e.clientY));
  }
  function lastLinkInto(id) { const links = H.linksInto ? H.linksInto(id) : []; return links.length ? links[links.length - 1] : null; }

  function zoomNow() { return z; }
  function zoom(v) {
    z = Math.max(MIN_Z, Math.min(MAX_Z, Math.round(v * 100) / 100));
    world.style.transform = `scale(${z})`;
    const sizer = world.parentElement;
    if (sizer) { sizer.style.width = (2400 * z) + 'px'; sizer.style.height = (1600 * z) + 'px'; }
    if (H.changed) H.changed();
  }
  function zoomBy(f, clientX, clientY) { zoom(z * f); }

  window.SlopNodesView = { mount, sync, paint, zoom, zoomNow, select, selection, drawWires, W, HEAD };
})();
