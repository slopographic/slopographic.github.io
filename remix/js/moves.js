/* Reel Remix: moving clips and cuts. (1) Drag a clip on the preview from one slot onto another slot of the same cut to
   swap them; the target slot lights up while dragging. (2) Drag a cut in the cut list up or down to reorder it, within
   its layout span (cuts in another layout cannot change places). (3) Drag a clip within its own slot to pan it inside
   its cell (cover fill; the pan is kept on the slot, and Reset position clears it for the cut). A ghost of the clip
   follows the pointer while it moves. The planner's seed is untouched: these are edits of the plan. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo, R = SV.random, SEG = SV.segments, TM = SV.timing;
  const M = (RM.moves = { redraw: () => {}, say: () => {} });
  const round = (v) => Math.round(v * 100) / 100;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const CUT_MIME = 'application/x-rm-cut';

  /** Client rectangle of a region of the preview (letterboxed inside the canvas). */
  function frameMap() {
    const cv = RM.preview.canvas, rect = cv.getBoundingClientRect(), W = cv.width, H = cv.height;
    const s = Math.min(rect.width / W, rect.height / H), dw = W * s, dh = H * s;
    return { dw, dh, ox: rect.left + (rect.width - dw) / 2, oy: rect.top + (rect.height - dh) / 2 };
  }
  M.rectOf = function (reg) {
    const f = frameMap();
    return { left: f.ox + reg.x * f.dw, top: f.oy + reg.y * f.dh, width: reg.w * f.dw, height: reg.h * f.dh };
  };
  /** The region of slot `slot` of cut `ci`, or null. */
  M.regionOf = function (ci, slot) {
    const plan = RM.state.plan, beat = plan && plan.cuts[ci], it = beat && beat.find((x) => x.slot === slot);
    return it ? R.regionFor(plan, it) : null;
  };
  const itemOf = (ci, slot) => { const beat = RM.state.plan && RM.state.plan.cuts[ci]; return beat ? beat.find((x) => x.slot === slot) : null; };
  const mediaOf = (id) => RM.state.items.find((x) => x.id === id) || null;
  /** A video's in point, kept inside the clip for the slot's length (stills have none). */
  function fitIn(it) {
    const m = mediaOf(it.media);
    if (!m) return;
    it.in = m.kind === 'image' ? 0 : Math.max(0, Math.min(it.in || 0, m.dur - it.dur));
  }

  /** Swap the clips (and their in point, fill and pan) of two slots of cut ci. Timing stays with the slot. */
  RM.swapSlots = function (ci, a, b) {
    const x = itemOf(ci, a), y = itemOf(ci, b);
    if (!x || !y || a === b) return false;
    for (const k of ['media', 'in', 'fill', 'pan']) { const t = x[k]; x[k] = y[k]; y[k] = t; }
    fitIn(x); fitIn(y);
    RM.state.locks = RM.state.locks.map((l) => (l.cut !== ci ? l : Object.assign({}, l, { slot: l.slot === a ? b : l.slot === b ? a : l.slot })));
    return true;
  };
  /** Clear the pan of every slot of cut ci. */
  RM.resetPan = function (ci) {
    const beat = RM.state.plan && RM.state.plan.cuts[ci];
    if (!beat) return false;
    beat.forEach((x) => { delete x.pan; });
    RM.state.locks = RM.state.locks.map((l) => (l.cut === ci ? Object.assign({}, l, { pan: undefined }) : l));
    return true;
  };
  /**
   * Move cut `from` to position `to` (both 0-based cut numbers). Only cuts of one layout span, with the same slot count,
   * can change places, so every cut keeps a layout that fits it. Cut times are reassigned within the range, the holds
   * are recomputed, and the locks follow their cuts. Returns false when the move is not allowed.
   */
  RM.moveCut = function (from, to) {
    const plan = RM.state.plan;
    if (!plan || from === to || from < 0 || to < 0 || from >= plan.cuts.length || to >= plan.cuts.length) return false;
    const cuts = plan.cuts, lo = Math.min(from, to), hi = Math.max(from, to);
    const segOf = (ci) => SEG.at(plan.segments || [], cuts[ci][0].start);
    for (let i = lo; i <= hi; i++) if (segOf(i) !== segOf(lo) || cuts[i].length !== cuts[lo].length) return false;
    const entries = [];
    for (let i = lo; i <= hi; i++) entries.push({ idx: i, beat: cuts[i], base: Math.min(...cuts[i].map((x) => x.start)) });
    const bases = entries.map((e) => e.base);
    const moved = entries.splice(from - lo, 1)[0];
    entries.splice(to - lo, 0, moved);
    const perm = new Map();
    entries.forEach((e, k) => {
      perm.set(e.idx, lo + k);
      for (const it of e.beat) it.start = round(bases[k] + (it.start - e.base));
    });
    cuts.splice(lo, hi - lo + 1, ...entries.map((e) => e.beat));
    TM.holds(cuts, plan.total, plan.segments);
    RM.state.locks = RM.state.locks.map((l) => (perm.has(l.cut) ? Object.assign({}, l, { cut: perm.get(l.cut) }) : l));
    return true;
  };

  // Ghost: a small picture of the clip that follows the pointer.
  let ghost = null, hl = null;
  function ensureGhost() {
    if (ghost) return ghost;
    ghost = document.createElement('canvas');
    ghost.width = 120; ghost.height = 120;
    ghost.className = 'rm-ghost'; ghost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ghost);
    return ghost;
  }
  function showGhost(it, x, y) {
    const g = ensureGhost(), c = g.getContext('2d'), m = mediaOf(it && it.media), el = m && m.el;
    c.fillStyle = '#222'; c.fillRect(0, 0, 120, 120);
    const nw = el ? (m.kind === 'video' ? el.videoWidth : el.naturalWidth) : 0, nh = el ? (m.kind === 'video' ? el.videoHeight : el.naturalHeight) : 0;
    if (nw && nh && (m.kind !== 'video' || el.readyState >= 2)) {
      const k = Math.min(120 / nw, 120 / nh);
      c.globalAlpha = 0.85; c.drawImage(el, (120 - nw * k) / 2, (120 - nh * k) / 2, nw * k, nh * k); c.globalAlpha = 1;
    }
    g.style.display = 'block'; moveGhost(x, y);
  }
  function moveGhost(x, y) { if (ghost) { ghost.style.left = x + 14 + 'px'; ghost.style.top = y + 14 + 'px'; } }
  function hideGhost() { if (ghost) ghost.style.display = 'none'; }
  function highlight(reg) {
    if (!reg) { if (hl) hl.style.display = 'none'; return; }
    if (!hl) { hl = document.createElement('div'); hl.className = 'rm-hl'; document.body.appendChild(hl); }
    const r = M.rectOf(reg);
    Object.assign(hl.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }

  /** Pan: how far (in cell fractions of the free picture) a drag of dx pixels moves a cover picture. */
  function panFor(it, reg, dx, dy, start) {
    const m = mediaOf(it.media), el = m && m.el;
    const nw = el ? (m.kind === 'video' ? el.videoWidth : el.naturalWidth) : 0, nh = el ? (m.kind === 'video' ? el.videoHeight : el.naturalHeight) : 0;
    const f = frameMap(), cw = reg.w * f.dw, ch = reg.h * f.dh;
    if (!nw || !nh) return start;
    const k = Math.max(cw / nw, ch / nh), exX = Math.max(0, (nw * k - cw) / 2), exY = Math.max(0, (nh * k - ch) / 2);
    return {
      x: exX ? round(clamp((start.x || 0) + dx / exX, -1, 1)) : 0,
      y: exY ? round(clamp((start.y || 0) + dy / exY, -1, 1)) : 0
    };
  }

  let drag = null;
  function down(e) {
    if (e.button !== 0 || !RM.state.plan) return;
    const hit = RM.dnd.slotAt(e.clientX, e.clientY);
    if (!hit) return;
    RM.preview.pause();
    const it = itemOf(hit.cut, hit.slot);
    drag = { cut: hit.cut, slot: hit.slot, it, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, target: hit.slot, startPan: Object.assign({}, it.pan || {}) };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  }
  function move(e) {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.moved) {
      if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 5) return;
      drag.moved = true; showGhost(drag.it, drag.x, drag.y);
    }
    moveGhost(drag.x, drag.y);
    const hit = RM.dnd.slotAt(drag.x, drag.y);
    drag.target = hit && hit.cut === drag.cut ? hit.slot : null;
    highlight(drag.target != null && drag.target !== drag.slot ? M.regionOf(drag.cut, drag.target) : null);
    if (drag.target === drag.slot) { const reg = M.regionOf(drag.cut, drag.slot); if (reg) { drag.it.pan = panFor(drag.it, reg, drag.x - drag.x0, drag.y - drag.y0, drag.startPan); M.redraw(); } }
  }
  function up() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const d = drag;
    drag = null; hideGhost(); highlight(null);
    if (!d || !d.moved) return;
    if (d.target != null && d.target !== d.slot) {
      RM.swapSlots(d.cut, d.slot, d.target);
      M.say(RM.t('remix.drop.swapped', { a: d.slot + 1, b: d.target + 1, cut: d.cut + 1 }));
    } else if (d.target === d.slot) M.say(RM.t('remix.drop.panned', { slot: d.slot + 1, cut: d.cut + 1 }));
    M.redraw();
  }
  /** Start the pointer moves on the preview canvas. o: { redraw(), say(msg) }. */
  M.install = function (o) {
    M.redraw = o.redraw || M.redraw; M.say = o.say || M.say;
    RM.preview.canvas.addEventListener('pointerdown', down);
  };

  /** Cut-list reordering: the drag data is the cut's number. */
  M.cutDragStart = function (e, ci, li) {
    e.dataTransfer.setData(CUT_MIME, String(ci)); e.dataTransfer.effectAllowed = 'move';
    if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(li, 12, 12);
  };
  M.cutDragOver = function (e, li) {
    if (!Array.from(e.dataTransfer.types || []).includes(CUT_MIME)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const r = li.getBoundingClientRect();
    li.dataset.drop = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
  };
  M.cutDrop = function (e, ci) {
    const raw = e.dataTransfer.getData(CUT_MIME);
    if (raw === '') return;
    e.preventDefault();
    const from = +raw, to = ci;
    if (!RM.moveCut(from, to)) M.say(RM.t('remix.drop.no_move'));
    else M.say(RM.t('remix.drop.moved', { from: from + 1, to: to + 1 }));
    M.redraw();
  };
})();
