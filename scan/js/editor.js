/* Slop Scan: the corners. The page's photo with its four corners as handles to drag (a finger, a pen or the mouse:
 * pointer events, the stage marked data-touch-surface so a drag never scrolls), a magnifier beside the finger while a
 * corner moves, and the arrow keys on a focused corner (Shift: ten times further). A corner is kept inside the photo and
 * the four stay a convex page. The new corners go to the page when the drag ends (one change, one new render).
 * Classic script; window.SlopScan.editor: mount(stage), show(page), layout(), quad() (the corners shown, 0..1). */
(function (g) {
  'use strict';
  const S = g.SlopScan, G = S.geom, NS = 'http://www.w3.org/2000/svg';
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const NAMES = ['scan.edit.corner_tl', 'scan.edit.corner_tr', 'scan.edit.corner_br', 'scan.edit.corner_bl'];
  const LOUPE = 128, ZOOM = 3;
  let stage = null, cv = null, svg = null, loupe = null, poly = null, dots = [], page = null, q = null, drag = null;

  function el(tag, attrs) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function mount(root) {
    stage = root;
    cv = root.querySelector('#sc-photo'); svg = root.querySelector('#sc-handles'); loupe = root.querySelector('#sc-loupe');
    poly = el('polygon', { class: 'sc-poly' });
    svg.append(el('path', { class: 'sc-shade', 'fill-rule': 'evenodd' }), poly);
    dots = NAMES.map((name, i) => {
      const gr = el('g', { class: 'sc-handle', tabindex: '0', role: 'button', 'data-i': String(i) });
      gr.append(el('circle', { class: 'sc-hit', r: '22' }), el('circle', { class: 'sc-dot', r: '9' }));
      gr.addEventListener('keydown', key);
      svg.append(gr);
      return gr;
    });
    // on the stage, not the handles: a finger is taken wherever the browser hit-tests it (the photo under a handle's edge too)
    for (const [type, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]]) stage.addEventListener(type, fn);
    if (g.ResizeObserver) new ResizeObserver(() => layout()).observe(stage);
    words();
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(words);
  }
  function words() { dots.forEach((d, i) => d.setAttribute('aria-label', t(NAMES[i]) + '. ' + t('scan.edit.corner_keys'))); }
  /** The photo of a page, its corners on it. */
  function show(p) {
    page = p;
    if (!p) return;
    const src = p.photo.small;
    cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0);
    svg.setAttribute('viewBox', `0 0 ${src.width} ${src.height}`);
    q = (p.quad || G.norm(G.inset(1, 1), 1, 1)).map((c) => ({ x: c.x, y: c.y }));
    layout();
  }
  /** The photo fitted to the stage; the handles keep their size on screen whatever the zoom. */
  function layout() {
    if (!page || !stage || stage.hidden) return;
    const W = cv.width, H = cv.height, cs = getComputedStyle(stage);
    const bw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), bh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!(bw > 0 && bh > 0)) return;
    const k = Math.min(bw / W, bh / H), w = Math.floor(W * k), h = Math.floor(H * k);
    for (const n of [cv, svg]) { n.style.width = w + 'px'; n.style.height = h + 'px'; }
    const unit = W / w;   // photo pixels per screen pixel
    const hit = g.matchMedia && g.matchMedia('(pointer: coarse)').matches ? 26 : 18;
    for (const d of dots) { d.firstChild.setAttribute('r', String(hit * unit)); d.lastChild.setAttribute('r', String(9 * unit)); d.lastChild.style.strokeWidth = String(2.5 * unit); }
    poly.style.strokeWidth = '2';   // screen pixels (non-scaling stroke)
    paint();
  }
  function paint() {
    const W = cv.width, H = cv.height, P = G.denorm(q, W, H);
    const pts = P.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    poly.setAttribute('points', pts);
    svg.querySelector('.sc-shade').setAttribute('d', `M0 0H${W}V${H}H0Z M${pts.split(' ').join(' L')}Z`);
    dots.forEach((d, i) => d.setAttribute('transform', `translate(${P[i].x.toFixed(1)} ${P[i].y.toFixed(1)})`));
  }
  /** Moves corner i to (x, y) in 0..1 when the page stays convex; the photo's edges hold it. */
  function place(i, x, y) {
    const next = q.map((c) => ({ x: c.x, y: c.y }));
    next[i] = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    if (!G.convex(G.denorm(next, cv.width, cv.height))) return false;
    q = next; paint();
    return true;
  }
  function at(e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  /** The corner a press takes: the handle it landed on, else the nearest corner within the handle's reach (a browser
   *  may hit-test the photo under a finger's edge, not the handle's transparent ring). */
  function cornerAt(e, p) {
    const h = e.target.closest && e.target.closest('.sc-handle');
    if (h) return Number(h.dataset.i);
    const r = svg.getBoundingClientRect(), reach = parseFloat(dots[0].firstChild.getAttribute('r')) * r.width / cv.width;
    let best = -1, d = Infinity;
    q.forEach((c, i) => { const dd = Math.hypot((c.x - p.x) * r.width, (c.y - p.y) * r.height); if (dd < d) { d = dd; best = i; } });
    return d <= reach ? best : -1;
  }
  function down(e) {
    const p = at(e), i = cornerAt(e, p);
    if (i < 0) return;
    drag = { i, id: e.pointerId, dx: q[i].x - p.x, dy: q[i].y - p.y };
    try { stage.setPointerCapture(e.pointerId); } catch (x) { /* a pointer the browser no longer tracks: the drag still follows moves over the photo */ }
    dots[i].classList.add('is-drag');
    e.preventDefault();
    magnify(i);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = at(e);
    place(drag.i, p.x + drag.dx, p.y + drag.dy);
    magnify(drag.i);
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    dots[drag.i].classList.remove('is-drag');
    drag = null;
    loupe.hidden = true;
    commit();
  }
  function commit() { if (page) S.pages.set(page.id, { quad: q.map((c) => ({ x: c.x, y: c.y })), found: true }); }
  function key(e) {
    const i = Number(e.currentTarget.dataset.i), step = (e.shiftKey ? 10 : 1) / cv.width, stepY = (e.shiftKey ? 10 : 1) / cv.height;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -stepY], ArrowDown: [0, stepY] }[e.key];
    if (!d) return;
    e.preventDefault();
    if (place(i, q[i].x + d[0], q[i].y + d[1])) commit();
  }
  /** The magnifier: the photo around the corner at ZOOM times, from the full-size picture, with a cross on the corner. It
   *  sits in the stage's top corner away from the finger. */
  function magnify(i) {
    const full = page.photo.full, c = q[i], x = loupe.getContext('2d');
    loupe.width = loupe.height = LOUPE;
    const span = LOUPE / ZOOM * (full.width / Math.max(1, parseFloat(cv.style.width) || cv.width));
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#000'; x.fillRect(0, 0, LOUPE, LOUPE);
    x.drawImage(full, c.x * full.width - span / 2, c.y * full.height - span / 2, span, span, 0, 0, LOUPE, LOUPE);
    x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(LOUPE / 2, 8); x.lineTo(LOUPE / 2, LOUPE - 8); x.moveTo(8, LOUPE / 2); x.lineTo(LOUPE - 8, LOUPE / 2); x.stroke();
    x.strokeStyle = '#2a7fff'; x.lineWidth = 1.5; x.stroke();
    loupe.classList.toggle('is-right', c.x < 0.5);
    loupe.hidden = false;
  }
  S.editor = { mount, show, layout, quad: () => q && q.map((c) => ({ x: c.x, y: c.y })), place, commit };
})(window);
