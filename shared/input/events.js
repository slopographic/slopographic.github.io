/* SlopTouch events and surfaces: the DOM helpers of the touch layer (shared/input/touch.js wires them to the gestures).
 *   SlopTouch.surface(el, opts?)  marks an editing surface (canvas, page view, timeline, editor) and returns { destroy() }.
 *                                 The same as the attribute data-touch-surface; touch.css then sets touch-action: none,
 *                                 no iOS callout, no text selection and no overscroll there, so a drag is never taken for
 *                                 a scroll. opts: { zoom(scale, cx, cy), pan(dx, dy) } get the two-finger pinch and pan
 *                                 (client px, scale since the last call), or { wheel: true } sends them as the wheel
 *                                 events a trackpad would (Ctrl+wheel for pinch, plain wheel for pan), { wheel: 'zoom' }
 *                                 only the pinch, { nav: true } leaves both to the surface's own SlopNav engine.
 *                                 The attribute's value says the same: "wheel", "wheel-zoom", "nav" (or "" for none).
 *                                 App code that may run before this layer has loaded (the shell loads it) sets the
 *                                 attribute and, for hooks, the element's touchSurface property ({ zoom, pan }) itself.
 *   SlopTouch.hit(e, r)           a hit radius (CSS px) for a pointer event: at least 22 px for a finger, 12 for a pen.
 *   SlopTouch.coarse()            the main pointer is a finger (the CSS (pointer: coarse)).
 * Classic script; also sets SlopTouch.events (used by touch.js and the tests). */
(function () {
  'use strict';
  const T = (window.SlopTouch = window.SlopTouch || {});
  if (T.events) return;
  const opts = new WeakMap();
  const MODES = { wheel: { wheel: true }, 'wheel-zoom': { wheel: 'zoom' }, nav: { nav: true } };

  function surface(el, o) {
    if (!el || !el.setAttribute) return { destroy() {} };
    if (!el.hasAttribute('data-touch-surface')) el.setAttribute('data-touch-surface', o && o.nav ? 'nav' : '');
    if (o) opts.set(el, o);
    return { destroy() { el.removeAttribute('data-touch-surface'); opts.delete(el); } };
  }
  /** The surface an element is on, and its options: { el, o } or null. */
  function surfaceOf(t) {
    const el = t && t.closest ? t.closest('[data-touch-surface]') : null;
    if (!el) return null;
    return { el, o: opts.get(el) || el.touchSurface || MODES[el.getAttribute('data-touch-surface')] || {} };
  }
  const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
  function hit(e, r) {
    const base = Number(r) || 0, k = e && e.pointerType;
    return k === 'touch' ? Math.max(base, 22) : k === 'pen' ? Math.max(base, 12) : base;
  }
  const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;
  /** A text field, where the system's own double tap and long press (select a word, the edit menu) must stay. */
  function editable(t) {
    if (!t || t.nodeType !== 1) return false;
    if (EDITABLE.test(t.tagName) && !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/.test(t.type || '')) return true;
    return !!t.isContentEditable;
  }
  /** What is under a point, or the fallback when the point is off the page. */
  function at(x, y, fallback) {
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { /* off page */ }
    return el || fallback || document.body;
  }
  function mark(ev) { try { Object.defineProperty(ev, 'slopTouch', { value: true }); } catch (e) { /* frozen */ } return ev; }
  function mouseInit(x, y, extra) {
    x = Number.isFinite(x) ? x : 0; y = Number.isFinite(y) ? y : 0;
    return Object.assign({ bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y,
      screenX: x + (window.screenX || 0), screenY: y + (window.screenY || 0) }, extra);
  }
  /** A dblclick at (x, y) on target, as a mouse double-click would send it. Returns the event. */
  function dblclick(target, x, y) {
    const ev = mark(new MouseEvent('dblclick', mouseInit(x, y, { detail: 2, button: 0, buttons: 0 })));
    target.dispatchEvent(ev);
    return ev;
  }
  /** A contextmenu at (x, y) on target, as a right-click would send it. Returns the event (defaultPrevented: handled). */
  function contextmenu(target, x, y) {
    const ev = mark(new MouseEvent('contextmenu', mouseInit(x, y, { detail: 1, button: 2, buttons: 0 })));
    target.dispatchEvent(ev);
    return ev;
  }
  /** A wheel event, as a trackpad sends it: pinch is Ctrl+wheel with deltaY = -100·ln(scale) (Chrome and Safari). */
  function wheel(target, x, y, dx, dy, ctrl) {
    const ev = mark(new WheelEvent('wheel', mouseInit(x, y, { deltaX: dx, deltaY: dy, deltaZ: 0, deltaMode: 0, ctrlKey: !!ctrl })));
    target.dispatchEvent(ev);
    return ev;
  }
  /** Tells the app a pointer is gone (it is now part of a pinch, or a palm under the pen): a pointercancel. */
  function cancel(target, id, kind, x, y) {
    let ev;
    try { ev = new PointerEvent('pointercancel', mouseInit(x, y, { cancelable: false, pointerId: id, pointerType: kind || 'touch', isPrimary: false })); }
    catch (e) { return null; }
    mark(ev);
    (target && target.isConnected ? target : document).dispatchEvent(ev);
    return ev;
  }
  /** Sends one step of a pinch to a surface: its hooks, or wheel events. */
  function pinch(s, a) {
    const o = s.o, x = a.cx, y = a.cy;
    if (o.zoom || o.pan) {
      if (o.zoom && a.scale !== 1) o.zoom(a.scale, x, y);
      if (o.pan && (a.dx || a.dy)) o.pan(a.dx, a.dy);
      return;
    }
    if (!o.wheel) return;
    const t = at(x, y, s.el), inside = s.el.contains(t) ? t : s.el;
    if (a.scale !== 1 && a.scale > 0) wheel(inside, x, y, 0, -100 * Math.log(a.scale), true);
    if (o.wheel !== 'zoom' && (a.dx || a.dy)) wheel(inside, x, y, -a.dx, -a.dy, false);
  }
  /** Does the surface take two fingers itself (so the touch layer must take them from the app's one-finger handling)? */
  const takesPinch = (s) => !!(s && !s.o.nav && (s.o.zoom || s.o.pan || s.o.wheel));

  T.surface = surface;
  T.hit = hit;
  T.coarse = coarse;
  T.events = { surfaceOf, editable, at, dblclick, contextmenu, wheel, cancel, pinch, takesPinch };
})();
