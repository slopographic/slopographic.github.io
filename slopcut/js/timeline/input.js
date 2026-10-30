/* SlopCut: timeline pointer input. Scrub, select (click, Shift adds, Ctrl/Cmd toggles, a box from empty space; the rules
   are core/pick.js), move across tracks (a selection moves together), trim (normal / ripple with the B tool or Ctrl; a
   plain trim of a selected clip trims every selected clip's same edge), razor, fades, transition length, volume and
   keyframes, wheel zoom/scroll and two-finger pinch. Every drag is one undo step.
   A finger: a tap selects the clip; a drag pans the timeline, or moves the clip when it was selected; a long press on a
   clip turns on Select mode (TL.multi, the toolbar's Select several), where taps add and remove clips and a drag from
   empty space draws a selection box; a long press in Select mode opens the menu. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, E = SE.edit, TL = SE.timeline, A = SE.app, P = SE.pick;
  let drag = null, fingerDown = false;
  const pointers = new Map();

  /** Live drag edit: snapshot once, re-apply from the original on every move. */
  function live(label) {
    const orig = { clips: JSON.parse(JSON.stringify(SE.doc.clips)), markers: JSON.parse(JSON.stringify(SE.doc.markers)) };
    let begun = false;
    return {
      apply(fn) {
        if (!begun) { SE.history.begin(label); begun = true; }
        SE.doc.clips = JSON.parse(JSON.stringify(orig.clips)); SE.doc.markers = JSON.parse(JSON.stringify(orig.markers));
        fn(SE.doc);
        SE.emit('change', { label, live: true });
      },
      get moved() { return begun; }
    };
  }
  function local(e) { const r = SE.app.els.tlCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  const ripple = (e) => TL.tool === 'ripple' || e.ctrlKey || e.metaKey;

  function startScrub(e, pt) {
    if (SE.player.playing) SE.player.pause();
    const go = (x) => SE.player.seek(TL.snapT(Math.max(0, TL.t(x)), null, false));
    go(pt.x);
    drag = { kind: 'scrub', move: (p) => go(p.x), end: () => { TL.snapLine = null; } };
  }
  function startMarker(e, pt, k) {
    const ed = live(U.t('slopedit.tl.move_marker')); const t0 = k.t, x0 = pt.x;
    SE.player.seek(k.t);
    drag = { kind: 'marker', move: (p) => ed.apply((d) => { const m = d.markers.find((x) => x.id === k.id); m.t = Math.max(0, TL.snapT(t0 + (p.x - x0) / TL.pps, null)); }), end: () => { TL.snapLine = null; } };
  }
  /** onTap: what a press that never moved does when it lifts (select the clip alone, or toggle it in Select mode). */
  function startMove(e, pt, h, onTap) {
    const c = h.clip;
    if (!A.sel.has(c.id)) A.select([...E.group(SE.doc, [c.id])]);
    const ids = A.selectedIds(), g = E.group(SE.doc, ids);
    const clips = SE.doc.clips.filter((x) => g.has(x.id));
    const s0 = Math.min(...clips.map((x) => x.start)), e0 = Math.max(...clips.map(M.end));
    const ed = live(clips.length > 1 ? U.t('slopedit.tl.move_clips') : U.t('slopedit.insp.move_clip'));
    const kind = h.row.track.kind, rows = TL.rows().filter((r) => r.track.kind === kind), r0 = rows.findIndex((r) => r.track.id === h.row.track.id);
    let started = false;
    drag = {
      kind: 'move',
      move(p) {
        if (!started && Math.abs(p.x - pt.x) < 4 && Math.abs(p.y - pt.y) < 4) return;
        started = true;
        let dt = (p.x - pt.x) / TL.pps;
        if (TL.snap && !p.alt) {
          const a = TL.snapT(s0 + dt, g), la = TL.snapLine; const b = TL.snapT(e0 + dt, g), lb = TL.snapLine;
          if (la != null && (lb == null || Math.abs(a - s0 - dt) <= Math.abs(b - e0 - dt))) { dt = a - s0; TL.snapLine = la; } else if (lb != null) { dt = b - e0; TL.snapLine = lb; }
        } else TL.snapLine = null;
        const row = TL.rowAt(p.y), ri = row ? rows.findIndex((r) => r.track.id === row.track.id) : -1;
        // rows are displayed top-down: for video V2 is above V1, so moving up is +1 in track index
        const dTrack = ri < 0 ? 0 : kind === 'video' ? r0 - ri : ri - r0;
        ed.apply((d) => { if (!E.move(d, ids, dt, dTrack, kind)) E.move(d, ids, dt, 0, kind); });
      },
      end() { TL.snapLine = null; if (!started && onTap) onTap(); }
    };
  }
  function startTrim(e, pt, h) {
    const c = h.clip, edge = h.part, rip = ripple(e);
    if (!A.sel.has(c.id)) A.select([...E.group(SE.doc, [c.id])]);
    const ed = live(rip ? U.t('slopedit.tl.ripple_trim') : U.t('slopedit.tl.trim'));
    const t0 = edge === 'in' ? c.start : M.end(c), g = E.group(SE.doc, [c.id]);
    // A plain trim of a selected clip trims the same edge of every other selected clip by as much (one per linked group)
    const done = new Set(g), others = [];
    if (!rip) for (const id of A.selectedIds()) if (!done.has(id)) { E.group(SE.doc, [id]).forEach((x) => done.add(x)); const o = M.clip(SE.doc, id); others.push([id, edge === 'in' ? o.start : M.end(o)]); }
    drag = {
      kind: 'trim',
      move(p) {
        const t = TL.snapT(t0 + (p.x - pt.x) / TL.pps, g);
        ed.apply((d) => { E.trim(d, c.id, edge, t, { ripple: rip }); for (const [id, e0] of others) E.trim(d, id, edge, e0 + t - t0); });
        const cc = M.clip(SE.doc, c.id);
        if (cc && !SE.player.playing) SE.player.seek(edge === 'in' ? cc.start : M.end(cc) - 1 / SE.doc.fps, { preview: true });
      },
      end() { TL.snapLine = null; }
    };
  }
  function startFade(e, pt, h) {
    const c = h.clip, which = h.part, key = c.kind === 'audio' ? (which === 'fadein' ? 'afIn' : 'afOut') : which === 'fadein' ? 'fadeIn' : 'fadeOut';
    const ed = live(U.t('slopedit.tl.fade')), r = TL.clipRect(c);
    drag = { kind: 'fade', move(p) {
      const v = which === 'fadein' ? (p.x - r.x) / TL.pps : (r.x + r.w - p.x) / TL.pps;
      ed.apply((d) => { const cc = M.clip(d, c.id); cc[key] = U.round(U.clamp(v, 0, cc.dur), 3); });
    } };
  }
  function startTransition(e, pt, h) {
    const c = h.clip, cut = TL.x(c.start), ed = live(U.t('slopedit.insp.transition_length'));
    A.select([c.id]);
    drag = { kind: 'tr', move(p) { ed.apply((d) => E.setTransition(d, c.id, c.trIn.type, Math.abs(p.x - cut) * 2 / TL.pps)); } };
  }
  function startVolume(e, pt, h) {
    const c = h.clip, r = TL.clipRect(c);
    if (h.part === 'volume' && (e.ctrlKey || e.metaKey || e.altKey)) {
      SE.change(U.t('slopedit.tl.add_keyframe'), (d) => { const cc = M.clip(d, c.id); const u = U.round((pt.x - r.x) / TL.pps, 3); const v = TL.volFromY(r, pt.y) / (cc.vol || 1); cc.keys = (cc.keys || []).concat({ t: u, v: U.round(v, 3) }).sort((a, b) => a.t - b.t); });
      drag = { kind: 'none' }; return;
    }
    A.select([c.id], { add: e.shiftKey });
    const ed = live(h.part === 'key' ? U.t('slopedit.tl.move_keyframe') : U.t('slopedit.insp.volume'));
    drag = { kind: 'vol', move(p) {
      ed.apply((d) => {
        const cc = M.clip(d, c.id);
        if (h.part === 'key') {
          const k = cc.keys[h.key];
          k.t = U.round(U.clamp((p.x - r.x) / TL.pps, 0, cc.dur), 3); k.v = U.round(TL.volFromY(r, p.y) / (cc.vol || 1), 3);
          cc.keys.sort((a, b) => a.t - b.t);
        } else if (cc.keys && cc.keys.length) { const f = TL.volFromY(r, p.y) / Math.max(0.001, TL.volFromY(r, pt.y)); cc.keys.forEach((k, i) => { k.v = U.round(U.clamp(c.keys[i].v * f, 0, 4), 3); }); }
        else cc.vol = TL.volFromY(r, p.y);
      });
      SE.app.status(U.t('slopedit.insp.volume') + ' ' + (20 * Math.log10(Math.max(1e-4, M.clip(SE.doc, c.id).vol))).toFixed(1) + ' dB');
    } };
  }
  /** A selection box from an empty spot: every clip it touches, across tracks (added to the selection with Shift or in Select mode). */
  function startMarquee(e, pt) {
    const base = e.shiftKey || TL.multi ? A.selectedIds() : [];
    drag = { kind: 'marquee', move(p) {
      TL.marquee = P.box(pt, p);
      A.select(P.marquee(base, SE.doc.clips.map((c) => Object.assign({ id: c.id }, TL.clipRect(c))), TL.marquee));
    }, end() { TL.marquee = null; TL.dirty(); } };
  }
  function startPan(e, pt, onTap) {
    const sx = TL.scrollX, sy = TL.scrollY;
    let moved = false;
    drag = { kind: 'pan', move(p) {
      if (!moved && Math.hypot(p.x - pt.x, p.y - pt.y) < 6) return;
      moved = true;
      TL.scrollX = sx - (p.x - pt.x) / TL.pps; TL.scrollY = sy - (p.y - pt.y); TL.clampScroll(); TL.syncHeads(); TL.dirty();
    }, end() { if (!moved && onTap) onTap(); } };
  }
  /** A press on a clip's body: select it, move the selection, or pan (a finger on a clip not yet selected). */
  function pressClip(e, pt, h, touch) {
    const group = [...E.group(SE.doc, [h.clip.id])], sel = A.selectedIds(), mods = { multi: TL.multi };
    const tap = () => A.select(P.click(A.selectedIds(), group, mods));
    if (TL.multi) {
      if (group.every((id) => A.sel.has(id))) return startMove(e, pt, h, tap); // a drag moves the selection, a tap takes it out
      if (touch) return startPan(e, pt, tap);                                   // a tap adds it, a drag scrolls
      A.select(P.click(sel, group, mods)); return startMove(e, pt, h);
    }
    if (P.keepsForDrag(sel, group, mods)) return startMove(e, pt, h, tap);      // the whole selection drags; a tap keeps this one
    A.select(group);
    return touch ? startPan(e, pt) : startMove(e, pt, h);
  }

  function down(e) {
    const el = SE.app.els.tlCanvas;
    if (e.button === 1) { // middle button: pan only (no selection, no clip move, no middle-click autoscroll)
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not an active pointer (synthetic): the drag still works */ }
      pointers.set(e.pointerId, local(e));
      startPan(e, local(e));
      return;
    }
    // The first finger of a touch: no other is down (a lift the browser never sent must not make this one a pinch)
    if (e.pointerType === 'touch' && e.isPrimary) { pointers.clear(); if (drag && drag.kind === 'pinch') drag = null; }
    fingerDown = e.pointerType === 'touch';
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) { // pinch zoom
      const [a, b] = [...pointers.values()]; drag = { kind: 'pinch', d0: Math.abs(a.x - b.x) || 1, pps0: TL.pps, cx: (a.x + b.x) / 2 };
      return;
    }
    if (e.button === 2) return;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* not an active pointer (synthetic): the drag still works */ }
    SE.app.els.tlLanes.focus({ preventScroll: true });
    const touch = e.pointerType === 'touch';
    TL.EDGE = touch ? 22 : e.pointerType === 'pen' ? 12 : 7; // finger-sized trim handles (44 px across an edge; never over a third of a clip: view.js)
    const pt = local(e), h = TL.hit(pt.x, pt.y);
    if (h.area === 'ruler') return startScrub(e, pt);
    if (h.area === 'markers') return h.marker ? startMarker(e, pt, h.marker) : startScrub(e, pt);
    if (h.area === 'clip') {
      if (M.track(SE.doc, h.clip.track).lock) { A.select([h.clip.id]); drag = { kind: 'none' }; return; }
      if (TL.tool === 'razor') { SE.act.splitAt(TL.snapT(h.t), e.shiftKey ? null : [h.clip.id]); drag = { kind: 'none' }; return; }
      const mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
      if ((mods.shift || mods.ctrl) && h.part === 'body') { A.select(P.click(A.selectedIds(), [...E.group(SE.doc, [h.clip.id])], mods)); drag = { kind: 'none' }; return; }
      if (h.part === 'in' || h.part === 'out') return startTrim(e, pt, h);
      if (h.part === 'fadein' || h.part === 'fadeout') return startFade(e, pt, h);
      if (h.part === 'transition') return startTransition(e, pt, h);
      if (h.part === 'volume' || h.part === 'key') return startVolume(e, pt, h);
      return pressClip(e, pt, h, touch);
    }
    if (touch && !TL.multi) return startPan(e, pt, () => A.select([])); // a tap on empty space clears the selection
    if (!e.shiftKey && !TL.multi) A.select([]);
    startMarquee(e, pt);
  }
  function move(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, local(e));
    if (e.pointerType === 'mouse' && !drag) TL.EDGE = 7;
    const pt = local(e);
    if (drag && drag.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      TL.setZoom(drag.pps0 * (Math.abs(a.x - b.x) || 1) / drag.d0, drag.cx); return;
    }
    if (drag && drag.move) { drag.move(Object.assign(pt, { alt: e.altKey })); return; }
    hover(pt);
  }
  function up(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) fingerDown = false;
    if (drag) { if (drag.end) drag.end(); drag = null; TL.dirty(); }
  }
  function hover(pt) {
    const h = TL.hit(pt.x, pt.y), el = SE.app.els.tlCanvas;
    let cur = 'default';
    if (TL.tool === 'razor' && h.area === 'clip') cur = 'crosshair';
    else if (h.area === 'ruler' || (h.area === 'markers' && !h.marker)) cur = 'text';
    else if (h.area === 'markers') cur = 'ew-resize';
    else if (h.area === 'clip') cur = { in: 'w-resize', out: 'e-resize', fadein: 'ew-resize', fadeout: 'ew-resize', transition: 'ew-resize', volume: 'ns-resize', key: 'move', body: 'grab' }[h.part];
    if ((h.part === 'in' || h.part === 'out') && TL.tool === 'ripple') cur = h.part === 'in' ? 'w-resize' : 'e-resize';
    el.style.cursor = cur;
    const hov = h.clip ? h.clip.id : null;
    TL.razorX = TL.tool === 'razor' && h.area === 'clip' ? TL.x(TL.snapT(h.t)) : null;
    if (hov !== TL.hover || TL.tool === 'razor') { TL.hover = hov; TL.dirty(); }
  }
  function wheel(e) {
    e.preventDefault();
    const pt = local(e);
    if (e.ctrlKey || e.metaKey || e.altKey) { TL.zoomBy(Math.exp(-e.deltaY * 0.0025), pt.x); return; }
    const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
    const canV = TL.contentH() > TL.h;
    if (Math.abs(dx) > 0 || !canV) TL.scrollX += (dx || dy) / TL.pps;
    else TL.scrollY += dy;
    TL.clampScroll(); TL.syncHeads(); TL.dirty();
  }
  TL.initInput = function () {
    const el = SE.app.els.tlCanvas;
    // A touch surface (shared/input): no page scroll or zoom on it; two fingers pinch-zoom (about the fingers) and pan
    // the timeline through these hooks, and the layer cancels the first finger's drag. A double tap is the dblclick
    // below, a long press the contextmenu.
    el.style.touchAction = 'none';
    el.setAttribute('data-touch-surface', '');
    el.touchSurface = {
      zoom(s, cx) { TL.setZoom(TL.pps * s, cx - el.getBoundingClientRect().left); },
      pan(dx, dy) { TL.scrollX -= dx / TL.pps; TL.scrollY -= dy; TL.clampScroll(); TL.syncHeads(); TL.dirty(); }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { if (!drag) { TL.hover = null; TL.razorX = null; TL.dirty(); } });
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener('dblclick', (e) => { const pt = local(e), h = TL.hit(pt.x, pt.y); if (TL.onDouble) TL.onDouble(h, e); });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pt = local(e), h = TL.hit(pt.x, pt.y), finger = fingerDown || e.slopTouch;
      if (finger && drag) drag = { kind: 'none' }; // a long press is not also a tap or a drag
      // A long press on a clip turns on Select mode with that clip; in Select mode it opens the menu.
      if (finger && h.area === 'clip' && !TL.multi) { TL.setMulti(true); A.select([...E.group(SE.doc, [h.clip.id])], { add: true }); return; }
      if (TL.contextMenu) TL.contextMenu(h, e.clientX, e.clientY);
    });
  };
})();
