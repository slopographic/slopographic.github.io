/* SlopIsolate — pointer input on #stage: pan (pan tool, middle button, or Space), refine brush strokes
 * (keep / remove, in image px), before/after knob drag, wheel zoom, and the brush cursor.
 * Touch: #stage is a touch surface (shared/input): one finger paints or pans, two fingers pinch-zoom and pan. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, P = CO.process;
  const PT = CO.pointer = {};
  let stage = null, cur = null, drag = null, space = false;

  const isBrush = () => S.tool === 'keep' || S.tool === 'remove';
  const typing = (t) => (!!window.SlopTyping && window.SlopTyping.isTyping(t, { controls: true }));   // shared/input/typing.js
  const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  /** Brush radius in image px and hardness for the current settings. */
  const brushArgs = () => ({ r: S.brush.size / 2 / CO.view.geom().scale, h: S.brush.hardness });

  /** Move and size the brush cursor (screen px: the diameter is the brush size). */
  function hover(sx, sy) {
    if (!cur) return;
    const act = P.active, show = isBrush() && !!act && !(drag && drag.kind !== 'brush');
    cur.hidden = !show;
    if (!show) return;
    const d = S.brush.size;
    cur.className = 'brush-cursor ' + S.tool;
    cur.style.width = cur.style.height = d + 'px';
    cur.style.transform = `translate(${sx - d / 2}px, ${sy - d / 2}px)`;
  }

  /** Right-button drag: across = size, down = hardness (shared/brush/resize.js). A plain click still opens the menu. */
  let suppressMenu = false, readout = null;
  function showReadout(on, text, sx, sy) {
    if (!readout) { readout = U.h('div', { class: 'brush-readout', hidden: '' }); stage.append(readout); }
    readout.hidden = !on;
    if (on) { readout.textContent = text; readout.style.transform = `translate(${sx + 16}px, ${sy + 16}px)`; }
  }
  function startResize(e, sx, sy) {
    drag = { kind: 'resize', id: e.pointerId, sx, sy, start: { size: S.brush.size, hardness: S.brush.hardness }, moved: false };
  }
  function moveResize(e, sx, sy) {
    const SBR = window.SlopBrushResize, dx = sx - drag.sx, dy = sy - drag.sy;
    if (!drag.moved && !SBR.isDrag(dx, dy)) return;
    drag.moved = true;
    const v = SBR.apply(drag.start, dx, dy);
    S.setBrush(v);
    showReadout(true, SBR.readout(v.size, v.hardness), sx, sy);
    hover(sx, sy);
  }
  // macOS sends the menu on the press (held here, see onUp); Windows/Linux send it after the release (suppressed after a drag).
  window.addEventListener('contextmenu', (e) => {
    if (suppressMenu) { suppressMenu = false; e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (drag && drag.kind === 'resize') { drag.menu = { x: e.clientX, y: e.clientY }; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  function onDown(e) {
    // Buttons and fields on the stage (the empty-state actions, the message bar) keep their own clicks:
    // capturing the pointer here would send the click to the stage instead.
    if (e.target.closest && e.target.closest('button, a, input, select, textarea, label, .empty, .busy')) return;
    const act = P.active, [sx, sy] = local(e);
    if (e.button === 2 && isBrush() && act) { startResize(e, sx, sy); stage.setPointerCapture(e.pointerId); return; }
    if (S.view === 'split' && act && e.target.closest && e.target.closest('#split')) drag = { kind: 'split' };
    else if (e.button === 1 || (e.button === 0 && (S.tool === 'pan' || space))) drag = { kind: 'pan', x: sx, y: sy };
    else if (e.button === 0 && act && isBrush()) {
      const it = act.item, p = CO.view.toImage(sx, sy), { r, h } = brushArgs();
      const st = CO.brush.begin(it, S.tool);
      CO.process.live(it, CO.brush.line(st, p.x, p.y, p.x, p.y, r, h));
      drag = { kind: 'brush', it, st, x: p.x, y: p.y };
    } else return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    stage.classList.toggle('grabbing', drag.kind === 'pan');
    hover(sx, sy);
  }

  function onMove(e) {
    const [sx, sy] = local(e);
    if (!drag) { hover(sx, sy); return; }
    if (drag.kind === 'resize') { moveResize(e, sx, sy); return; }
    if (drag.kind === 'pan') {
      CO.view.panBy(sx - drag.x, sy - drag.y);
      drag.x = sx; drag.y = sy;
    } else if (drag.kind === 'split') {
      S.split = U.clamp(sx / Math.max(1, stage.clientWidth), 0, 1);
      CO.view.draw();
    } else {
      const p = CO.view.toImage(sx, sy), { r, h } = brushArgs();
      CO.process.live(drag.it, CO.brush.line(drag.st, drag.x, drag.y, p.x, p.y, r, h));
      drag.x = p.x; drag.y = p.y;
      hover(sx, sy);
    }
  }

  function onUp() {
    if (!drag) return;
    if (drag.kind === 'resize') {
      const r = drag; drag = null; showReadout(false); if (cur) cur.hidden = true;
      if (r.moved) suppressMenu = !r.menu; // a drag never opens the menu
      else if (r.menu) stage.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.menu.x, clientY: r.menu.y })); // a plain click (macOS)
      return;
    }
    if (drag.kind === 'brush') {
      const en = CO.brush.end(drag.st);
      if (en) CO.history.push(drag.it, en); // the history event schedules the full refresh (process.js)
    }
    drag = null;
    stage.classList.remove('grabbing');
    if (cur) cur.hidden = true;
  }

  /** Pinch-free wheel zoom around the pointer. */
  function onWheel(e) {
    if (!P.active) return;
    e.preventDefault();
    const [sx, sy] = local(e), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    CO.view.zoomAt(Math.exp(-dy * 0.0015), sx, sy);
  }

  /** Space held = pan, unless the user is typing. */
  function onKey(down) {
    return (e) => {
      if (e.code !== 'Space' || typing(e.target)) return;
      space = down;
      if (down) e.preventDefault();
    };
  }

  PT.init = function () {
    stage = U.$('#stage');
    cur = U.$('#brushCursor');
    if (!stage) return;
    stage.dataset.tool = S.tool;
    stage.setAttribute('data-touch-surface', '');
    stage.touchSurface = { // two fingers (shared/input); the layer cancels the first finger's stroke first
      zoom: (f, cx, cy) => { if (!P.active) return; const r = stage.getBoundingClientRect(); CO.view.zoomAt(f, cx - r.left, cy - r.top); },
      pan: (dx, dy) => { if (P.active) CO.view.panBy(dx, dy); },
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('pointerleave', () => { if (!drag && cur) cur.hidden = true; });
    stage.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey(true));
    window.addEventListener('keyup', onKey(false));
    window.addEventListener('blur', () => { space = false; });
    CO.on('tool', () => {
      stage.dataset.tool = S.tool;
      if (!isBrush() && cur) cur.hidden = true;
    });
  };
  PT.isBrush = isBrush;
})();
