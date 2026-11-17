/* SlopNav engine: the DOM side of a preset. Attaches wheel, pointer, touch and key handling for one
 * canvas host and calls the app's view functions through an adapter { zoomAt(f, x, y, live?), panBy, fit, actual,
 * zoomStep?, cancelStroke? }. live is true for pinch (touch and trackpad): apply at once, no easing. It never touches app data. Listeners sit on window in the capture phase,
 * so an active preset wins over the app's own wheel, Space and shortcut handling (it stops those events).
 * Classic script; sets window.SlopNav.engine. */
(function () {
  'use strict';
  const N = (window.SlopNav = window.SlopNav || {});
  const L = N.logic;

  // the shared guard (shared/input/typing.js; loaded here when no one did); a focused slider keeps its keys too. Until
  // it is in (a few ms after the page), keys count as not typing, as before
  const ME = typeof document !== 'undefined' ? document.currentScript : null;
  if (!window.SlopTyping && ME && ME.src) document.head.append(Object.assign(document.createElement('script'), { src: new URL('../input/typing.js', ME.src).href, async: false }));
  const isTyping = (e) => !!window.SlopTyping && window.SlopTyping.isTyping(e, { controls: true });
  const dialogsOpen = () => { try { return !!(window.SlopUI && SlopUI.openDialogs); } catch (e) { return false; } };

  /**
   * attach({ host, adapter, bindings(), keys: 'global'|'hover', onAction?, skip?, passthrough? }) → { detach(), bindings() }
   * passthrough: an unbound wheel event is not stopped, so the host's own scrolling runs (Slop PDF uses it).
   * bindings() returns the bindings object to use now. keys 'global' takes keys anywhere on the page
   * (except while a dialog is open); 'hover' takes them only while the pointer is over the host.
   */
  function attach(o) {
    const { host, adapter, bindings } = o;
    const keys = o.keys === 'hover' ? 'hover' : 'global';
    const held = { space: false, hand: false, handCode: '' };
    const touches = new Map();
    const owned = new Set(); // pointer ids the engine has taken from the app
    let pinch = null, pan = null, over = keys === 'global';
    const cfg = () => { try { return bindings() || N.presets.get(N.presets.DEFAULT).bindings; } catch (e) { return N.presets.get(N.presets.DEFAULT).bindings; } };
    const local = (e) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const inHost = (t) => !!t && host.contains(t);
    const pageTarget = (t) => !t || t === document.body || t === document.documentElement || inHost(t);
    const emit = (a) => { if (o.onAction) { try { o.onAction(a); } catch (e) { console.error(e); } } };
    const blocked = (e) => isTyping(e) || (keys === 'global' && dialogsOpen()) || (keys === 'hover' && !over) || !!(o.skip && o.skip());
    const pal = () => host.classList;
    const setHeld = () => { if (held.space || held.hand) pal().add('space'); else pal().remove('space'); };
    const stop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    // Fingers the engine takes stop here for the app, but the other window listeners still see them: the touch layer
    // (shared/input) must know a pinch is on, or the still finger of a pinch would count as a long press.
    const stopTouch = (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); };
    // The host is a touch surface (shared/input): a drag on it is never a page scroll, a pinch never a page zoom, and
    // the layer leaves two fingers to this engine ("nav"). A host that scrolls natively (passthrough) marks itself.
    const marked = !o.passthrough && !host.hasAttribute('data-touch-surface');
    if (marked) host.setAttribute('data-touch-surface', 'nav');

    function onWheel(e) {
      if (!inHost(e.target)) return;
      const a = L.wheelAction(cfg(), e);
      // passthrough (opt-in): a wheel the preset does not bind is left to the page, so it scrolls natively.
      if (!a) { if (!o.passthrough) stop(e); return; }
      stop(e);
      const p = local(e);
      if (a.kind === 'zoom') { adapter.zoomAt(a.factor, p.x, p.y, !!a.live); emit({ type: 'zoom', factor: a.factor, via: 'wheel' }); }
      else { adapter.panBy(a.dx, a.dy); emit({ type: 'pan', dx: a.dx, dy: a.dy, via: 'wheel' }); }
    }

    function startPan(e) {
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { host.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      pal().add('panning');
      owned.add(e.pointerId);
      stop(e);
    }
    function onDown(e) {
      if (!inHost(e.target)) return;
      if (e.pointerType === 'touch') return touchDown(e);
      const b = cfg();
      if (e.button === 1) { // middle button: pans when the preset says so, never reaches the app either way
        if (b.middlePan) startPan(e); else stop(e);
        return;
      }
      if (e.button !== 0) return;
      // Click-zoom: the key combo is held (Space plus Ctrl/Alt/Shift as the preset says) while the button goes down.
      const clickEv = { code: held.space ? 'Space' : '', key: held.space ? ' ' : '', ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey };
      if (b.clickZoomKey && L.comboMatches(b.clickZoomKey, clickEv)) {
        const p = local(e);
        if (adapter.zoomStep) adapter.zoomStep(1, p.x, p.y); else adapter.zoomAt(2, p.x, p.y);
        emit({ type: 'clickZoom', via: 'pointer' });
        owned.add(e.pointerId);
        stop(e);
        return;
      }
      if (held.hand || (held.space && b.spacePan)) startPan(e);
    }
    function onMove(e) {
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) return touchMove(e);
      if (pan && pan.id === e.pointerId) {
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        pan.x = e.clientX; pan.y = e.clientY;
        if (dx || dy) { adapter.panBy(dx, dy); emit({ type: 'pan', dx, dy, via: 'pointer' }); }
        e.stopImmediatePropagation();
      }
    }
    function onUp(e) {
      if (e.pointerType === 'touch') touchEnd(e);
      if (pan && pan.id === e.pointerId) { pan = null; pal().remove('panning'); }
      if (owned.has(e.pointerId)) { owned.delete(e.pointerId); if (e.pointerType === 'touch') e.stopPropagation(); else e.stopImmediatePropagation(); }
    }

    /* touch: the first finger goes to the app (it may draw); a second finger takes over as pinch/pan */
    function touchDown(e) {
      // The first finger of a touch: no other is down (a lift the browser never sent, to an element the app removed,
      // must not make this finger the second one of a pinch and take it from the app).
      if (e.isPrimary) { for (const id of touches.keys()) owned.delete(id); touches.clear(); pinch = null; }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const b = cfg();
      if (touches.size === 2 && (b.pinch === 'zoom' || b.touchPan)) {
        if (adapter.cancelStroke) adapter.cancelStroke();
        // The start point is host-relative, like every later midpoint (pinchMid); a client-relative start would jump on the first move.
        const m = pinchMid();
        pinch = { d: m.d, mx: m.x, my: m.y };
        owned.add(e.pointerId); // the first finger stays with the app, so its own pointerup still cleans up
        stopTouch(e);
      } else if (pinch) stopTouch(e);
    }
    function pinchMid() {
      const r = host.getBoundingClientRect(), [p1, p2] = [...touches.values()];
      return { x: (p1.x + p2.x) / 2 - r.left, y: (p1.y + p2.y) / 2 - r.top, d: Math.hypot(p1.x - p2.x, p1.y - p2.y) };
    }
    function touchMove(e) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || touches.size !== 2) return;
      stopTouch(e);
      const b = cfg(), m = pinchMid();
      // Zoom about the midpoint where the fingers were, then pan by how far it moved: the content under the
      // fingers stays under them, with no extra slide from the midpoint moving.
      if (b.pinch === 'zoom' && pinch.d > 0 && m.d > 0) adapter.zoomAt(m.d / pinch.d, pinch.mx, pinch.my, true);
      if (b.touchPan) adapter.panBy(m.x - pinch.mx, m.y - pinch.my);
      if (b.pinch === 'zoom' || b.touchPan) emit({ type: 'pinch', factor: m.d / (pinch.d || 1), via: 'touch' });
      pinch.d = m.d; pinch.mx = m.x; pinch.my = m.y;
    }
    function touchEnd(e) {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
    }

    function onKeyDown(e) {
      if (e.code === 'Space' && pageTarget(e.target) && !blocked(e)) {
        held.space = true; setHeld();
        stop(e); // a preset owns Space: the app's own Space-to-pan must not also run
        return;
      }
      if (blocked(e)) return;
      const b = cfg();
      const hit = L.keyAction(b, e);
      const handMatch = !!b.handKey && L.comboMatches(b.handKey, e);
      if (handMatch && pageTarget(e.target)) {
        held.hand = true; held.handCode = e.code; setHeld();
        stop(e);
        return;
      }
      if (!hit) return;
      stop(e);
      if (e.repeat && (hit.action === 'fit' || hit.action === 'actual')) return;
      const r = host.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
      if (hit.action === 'fit') adapter.fit();
      else if (hit.action === 'actual') adapter.actual();
      else {
        const dir = hit.action === 'zoomIn' ? 1 : -1;
        if (adapter.zoomStep) adapter.zoomStep(dir, cx, cy); else adapter.zoomAt(dir > 0 ? 1.25 : 0.8, cx, cy);
      }
      emit({ type: hit.action, via: 'key' });
    }
    function onKeyUp(e) {
      if (e.code === 'Space' && held.space) { held.space = false; setHeld(); }
      if (held.hand && e.code === held.handCode) { held.hand = false; held.handCode = ''; setHeld(); }
    }
    function reset() {
      held.space = false; held.hand = false; held.handCode = ''; setHeld();
      if (pan) { pan = null; pal().remove('panning'); }
      touches.clear(); pinch = null; owned.clear();
    }
    const enter = () => { over = true; };
    const leave = () => { over = false; };

    const win = { wheel: onWheel, pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp, keydown: onKeyDown, keyup: onKeyUp };
    const cap = { capture: true, passive: false };
    for (const [type, fn] of Object.entries(win)) window.addEventListener(type, fn, cap);
    window.addEventListener('blur', reset);
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);
    return {
      bindings: cfg,
      detach() {
        for (const [type, fn] of Object.entries(win)) window.removeEventListener(type, fn, cap);
        window.removeEventListener('blur', reset);
        host.removeEventListener('pointerenter', enter);
        host.removeEventListener('pointerleave', leave);
        if (marked) host.removeAttribute('data-touch-surface');
        reset();
      },
    };
  }

  N.engine = { attach };
})();
