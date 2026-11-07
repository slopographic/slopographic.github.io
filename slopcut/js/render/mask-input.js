/* SlopCut: masks in the monitor, pointer and keyboard side. Draw tools (SE.maskInput.tool: rect, ellipse, rrect, free,
   pen) create a mask on the selected clip. Edit mode (SE.maskInput.edit = clip id) drags the handles and moves the
   shape. A finished shape is one undo step; a handle or move drag is one step too. The SE.act.mask* actions are the
   commands behind the Clip menu, the clip context menu and the Inspector. Outline and handles: mask-view.js. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, MK = SE.mask, V = SE.maskView, A = SE.app, PV = SE.preview;
  const MI = (SE.maskInput = { tool: null, edit: null, pending: null });
  const HINT = {
    rect: U.t('slopedit.mask.drag_on_the_monitor_to'),
    ellipse: U.t('slopedit.mask.drag_on_the_monitor_to_2'),
    rrect: U.t('slopedit.mask.drag_on_the_monitor_to_3'),
    free: U.t('slopedit.mask.drag_to_draw_a_freehand'),
    pen: U.t('slopedit.mask.click_to_add_points_drag')
  };
  const KINDS = ['video', 'image', 'title', 'color'];
  let drag = null, stage = null;

  const toast = (m) => SlopUI.toast(m);
  const eligible = (c) => !!c && KINDS.includes(c.kind);
  const stop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  /** Keep the pointer on the monitor during a drag (ignored for synthetic or finished pointers). */
  const capture = (e) => { try { stage.setPointerCapture(e.pointerId); } catch (err) { /* no active pointer */ } };
  /** A handle's hit radius in overlay px for this pointer: 22 CSS px for a finger, 12 for a pen (shared/input; the
   *  monitor is a touch surface, data-touch-surface in preview-input.js), else the mouse's own (mask-view.js). */
  function touchR(e) {
    const ov = A.els.overlay, w = ov.getBoundingClientRect().width || 1;
    const css = window.SlopTouch && SlopTouch.hit ? SlopTouch.hit(e, 0) : e.pointerType === 'touch' ? 22 : e.pointerType === 'pen' ? 12 : 0;
    return css * (ov.width / w);
  }
  /** One undo step: the mask of clip id becomes `mask` (or none). */
  function commit(label, id, mask, { tool = false } = {}) {
    SE.change(label, (p) => { const c = M.clip(p, id); if (c) c.mask = MK.clean(mask); });
    MI.edit = id; MI.pending = null; drag = null;
    if (tool) MI.tool = null;
    PV.request();
  }
  function cancelTool() { MI.tool = null; MI.pending = null; drag = null; PV.request(); }

  /* ------------------------------------------------------------ tools and actions */
  MI.setTool = function (tool) {
    const c = A.primary();
    MI.pending = null; drag = null;
    if (!tool) { MI.tool = null; PV.request(); return; }
    if (!eligible(c)) { MI.tool = null; toast(c ? U.t('slopedit.mask.masks_apply_to_video_image') : U.t('slopedit.pre.select_a_clip_first')); PV.request(); return; }
    MI.tool = tool; MI.edit = c.id;
    toast(HINT[tool]);
    PV.request();
  };
  SE.act.maskAdd = function (shape) {
    const c = A.primary();
    if (!eligible(c)) return toast(U.t('slopedit.mask.select_a_video_image_title'));
    commit(U.t('slopedit.mask.add_mask'), c.id, MK.make(shape, SE.doc), { tool: false });
    SE.emit('select', {});
  };
  SE.act.maskTool = (tool) => MI.setTool(MI.tool === tool ? null : tool);
  SE.act.maskRemove = function () {
    const c = A.primary();
    if (!c || !c.mask) return;
    SE.change(U.t('slopedit.cmd.remove_mask'), (p) => { M.clip(p, c.id).mask = null; });
    if (MI.edit === c.id) MI.edit = null;
    SE.emit('select', {});
  };
  SE.act.maskInvert = function () {
    const c = A.primary();
    if (!c || !c.mask) return;
    SE.change(U.t('slopedit.cmd.invert_mask'), (p) => { const m = M.clip(p, c.id).mask; m.invert = !m.invert; });
    SE.emit('select', {});
  };
  SE.act.maskEdit = function () {
    const c = A.primary();
    if (!c || !c.mask) return;
    MI.tool = null; MI.pending = null;
    MI.edit = MI.edit === c.id ? null : c.id;
    PV.request(); SE.emit('select', {});
  };

  /* ------------------------------------------------------------ pointer */
  function penDown(e, c, q) {
    if (!MI.pending || MI.pending.kind !== 'pen' || MI.pending.id !== c.id) MI.pending = { kind: 'pen', id: c.id, pts: [] };
    const pen = MI.pending, o = V.ovPt(e);
    if (pen.pts.length >= 3) {
      const f = V.lOv(c, pen.pts[0]);
      if (Math.hypot(f.x - o.x, f.y - o.y) <= 10) return finishPen(c);
    }
    if (e.detail >= 2) return finishPen(c);
    pen.pts.push({ x: q.x, y: q.y, ix: 0, iy: 0, ox: 0, oy: 0 });
    drag = { kind: 'pen', id: c.id, i: pen.pts.length - 1 };
    PV.request();
  }
  function finishPen(c) {
    const pen = MI.pending;
    MI.pending = null; drag = null;
    if (!pen || pen.pts.length < 3) { toast(U.t('slopedit.mask.a_path_needs_at_least')); MI.tool = null; PV.request(); return; }
    commit(U.t('slopedit.mask.draw_mask'), c.id, MK.make('path', null, { pts: pen.pts }), { tool: true });
  }
  function down(e) {
    if (e.button !== 0 || SE.player.playing) return;
    const c = A.primary();
    if (MI.tool) {
      if (!eligible(c)) return;
      stop(e);
      const q = V.toLocal(c, V.framePt(e));
      if (MI.tool === 'pen') return penDown(e, c, q);
      if (MI.tool === 'free') { drag = { kind: 'free', id: c.id, pts: [q] }; MI.pending = { kind: 'free', id: c.id, pts: drag.pts }; }
      else { drag = { kind: 'box', id: c.id, shape: MI.tool, a: q, b: q }; MI.pending = { kind: 'box', id: c.id, shape: MI.tool, a: q, b: q }; }
      capture(e);
      return;
    }
    if (!c || !c.mask || MI.edit !== c.id) return;
    const q = V.toLocal(c, V.framePt(e)), h = V.hitHandle(c, V.ovPt(e), touchR(e));
    const m = c.mask;
    if (h) {
      stop(e);
      const opp = h.kind === 'corner' ? { x: m.x - (h.sx * m.w) / 2, y: m.y - (h.sy * m.h) / 2 } : null;
      drag = { kind: 'handle', id: c.id, h, opp, q0: q, label: h.kind === 'anchor' || h.kind === 'hi' || h.kind === 'ho' ? U.t('slopedit.mask.edit_mask_point') : U.t('slopedit.mask.reshape_mask') };
    } else if (MK.inside(m, q.x, q.y)) {
      stop(e);
      drag = { kind: 'move', id: c.id, q0: q, s0: { x: m.x, y: m.y }, p0: m.pts.map((p) => ({ x: p.x, y: p.y })), label: U.t('slopedit.mask.move_mask') };
    } else return;
    capture(e);
  }
  function move(e) {
    if (!drag) { if (MI.tool && stage) stage.style.cursor = 'crosshair'; return; }
    stop(e);
    const d = drag, c = M.clip(SE.doc, d.id);
    if (!c) { drag = null; return; }
    const q = V.toLocal(c, V.framePt(e));
    if (d.kind === 'box') { d.b = q; MI.pending.b = q; PV.request(); return; }
    if (d.kind === 'free') { const last = d.pts[d.pts.length - 1]; if (Math.hypot(q.x - last.x, q.y - last.y) >= 1.5) d.pts.push(q); PV.request(); return; }
    if (d.kind === 'pen') {
      const a = MI.pending.pts[d.i];
      if (a) { a.ox = q.x - a.x; a.oy = q.y - a.y; a.ix = -a.ox; a.iy = -a.oy; }
      PV.request(); return;
    }
    if (!d.begun) { if (Math.hypot(q.x - d.q0.x, q.y - d.q0.y) < 0.5) return; SE.history.begin(d.label); d.begun = true; }
    const m = c.mask, dx = q.x - d.q0.x, dy = q.y - d.q0.y;
    if (d.kind === 'move') {
      if (m.shape === 'path') m.pts.forEach((p, i) => { p.x = d.p0[i].x + dx; p.y = d.p0[i].y + dy; });
      else { m.x = d.s0.x + dx; m.y = d.s0.y + dy; }
    } else if (d.h.kind === 'corner') {
      m.x = (q.x + d.opp.x) / 2; m.y = (q.y + d.opp.y) / 2;
      m.w = Math.abs(q.x - d.opp.x); m.h = Math.abs(q.y - d.opp.y);
    } else if (d.h.kind === 'radius') {
      m.r = U.clamp(q.x - (m.x - m.w / 2), 0, Math.min(m.w, m.h) / 2);
    } else {
      const p = m.pts[d.h.i];
      if (!p) return;
      if (d.h.kind === 'anchor') { p.x = q.x; p.y = q.y; }
      else if (d.h.kind === 'hi') { p.ix = q.x - p.x; p.iy = q.y - p.y; }
      else { p.ox = q.x - p.x; p.oy = q.y - p.y; }
    }
    SE.emit('change', { label: d.label, live: true });
  }
  function up(e) {
    if (!drag) return;
    stop(e);
    const d = drag;
    drag = null;
    if (d.kind === 'box') {
      const b = MI.pending && MI.pending.b;
      if (b && Math.abs(b.x - d.a.x) >= 2 && Math.abs(b.y - d.a.y) >= 2) {
        commit(U.t('slopedit.mask.add_mask'), d.id, MK.make(d.shape, null, { x: (d.a.x + b.x) / 2, y: (d.a.y + b.y) / 2, w: Math.abs(b.x - d.a.x), h: Math.abs(b.y - d.a.y) }), { tool: true });
      } else { MI.pending = null; PV.request(); }
      return;
    }
    if (d.kind === 'free') {
      const pts = d.pts;
      if (pts.length >= 3) commit(U.t('slopedit.mask.draw_mask'), d.id, MK.path(MK.simplify(pts, 0.75)), { tool: true });
      else { MI.pending = null; toast(U.t('slopedit.mask.draw_a_larger_shape')); PV.request(); }
      return;
    }
    if (d.kind === 'pen') return;
    if (d.begun) SE.emit('autosave', {});
    PV.request();
  }
  /** Keys while a draw tool is on: Esc cancels, Enter closes a pen path. */
  function key(e) {
    if (!MI.tool || document.querySelector('.sui-back, .sui-menu')) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelTool(); toast(U.t('slopedit.mask.mask_tool_off')); }
    else if (e.key === 'Enter' && MI.tool === 'pen' && MI.pending) { const c = A.primary(); if (c) { e.preventDefault(); finishPen(c); } }
  }

  MI.init = function () {
    stage = A.els.monStage;
    stage.addEventListener('pointerdown', down, true);
    stage.addEventListener('pointermove', move, true);
    stage.addEventListener('pointerup', up, true);
    stage.addEventListener('pointercancel', up, true);
    document.addEventListener('keydown', key, true);
    SE.on('select', () => {
      const c = A.primary();
      if (MI.edit && (!c || c.id !== MI.edit)) MI.edit = null;
      if (MI.pending && (!c || c.id !== MI.pending.id)) { MI.pending = null; MI.tool = null; }
    });
  };
})();
