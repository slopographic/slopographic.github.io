/* SlopTouch: touch and pen for every app, on iOS and Android. Loaded on every app page by the shell (shell/shell.js),
 * after shared/input/gesture.js and shared/input/events.js, with shared/input/touch.css. It listens to touch and pen
 * pointer events on the window (mouse is left alone) and gives the apps what a mouse would have:
 *   a double tap          → a dblclick at that point (iOS sends none; Chrome on Android sometimes does: never two)
 *   a long press          → a contextmenu at that point (Android sends its own: never two), and when the app opened a
 *                           menu, no click when the finger lifts
 *   two fingers on a surface that zooms (SlopTouch.surface, data-touch-surface) → its zoom/pan hooks or wheel events,
 *                           and the app's one-finger drag is cancelled (pointercancel) so it does not draw or move too
 *   a pen down            → touches are ignored (palm rejection) until shortly after it lifts; pressure passes through
 *   iOS page pinch on a surface (gesturestart) is prevented; the page still zooms everywhere else.
 * API: SlopTouch.surface / hit / coarse (shared/input/events.js), SlopTouch.penDown(), SlopTouch.palm (true; false
 * turns palm rejection off), SlopTouch.last (the last pointer type: 'mouse', 'touch' or 'pen').
 * Notes for whoever works on it: shared/input/HANDOFF.md. */
(function () {
  'use strict';
  const T = (window.SlopTouch = window.SlopTouch || {});
  if (T.ready || !T.gesture || !T.events) return;
  const E = T.events;
  const g = T.gesture.create();
  const PALM_MS = 400;      // touches stay ignored this long after the pen lifts
  const CLICK_MS = 700;     // a click this soon after a handled long press, or a palm, is swallowed
  const BUSY_MS = 50;       // a timer this late: the page was busy
  const QUIET_MS = 150;     // a long press waits until the page has been free this long (up to a second past its time)
  const NATIVE_MS = 800;    // a native dblclick/contextmenu this soon after ours is the same gesture: swallowed

  const info = new Map();   // pointer id → { target, kind, x, y, surface }
  const taken = new Set();  // pointer ids the app no longer sees (palm, or part of a pinch the layer handles)
  let pens = 0, penUpAt = -Infinity, timer = 0, beat = 0, busyAt = -Infinity;
  let blockClickUntil = 0;  // Infinity while a finger whose long press opened a menu is still down
  let sentDbl = -Infinity, sentMenu = -Infinity, pendingDbl = null;
  T.palm = true;
  T.last = 'mouse';
  T.penDown = () => pens > 0;
  const now = () => performance.now();
  /** A finger or a pen, with a place (a mouse, or an event some code made without coordinates, is not ours). */
  const finger = (e) => (e.pointerType === 'touch' || e.pointerType === 'pen') && Number.isFinite(e.clientX) && Number.isFinite(e.clientY);
  const swallow = (e) => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };
  // t: when the finger did it (a busy page handles a quick tap's lift late: it must not read as a hold); at: when the page
  // got it, where the long-press clock starts (gesture.js)
  const sample = (e) => ({ id: e.pointerId, x: e.clientX, y: e.clientY, t: T.gesture.stamp(e, now()), at: now(), kind: e.pointerType });

  /** While a long press is pending, a beat every 30 ms: busyAt is when one came BUSY_MS late (the page was busy). */
  function heartbeat() {
    if (beat) return;
    let last = now();
    const tick = () => { const t = now(); if (t - last > 30 + BUSY_MS) busyAt = t; last = t; beat = g.deadline() === Infinity ? 0 : setTimeout(tick, 30); };
    beat = setTimeout(tick, 30);
  }
  function schedule() {
    clearTimeout(timer);
    const d = g.deadline();
    if (d === Infinity) return;
    heartbeat();
    const due = () => {
      // The page was busy just now: what the finger did meanwhile (a lift, a drag's moves: Chromium hands them over late
      // and in bursts then) may still be on its way. Decided once the page has been free QUIET_MS, at the next frame.
      const t = now(), wait = busyAt + QUIET_MS - t;
      if (wait > 0 && t - d < 1000) { timer = setTimeout(due, wait + 1); return; }
      const mine = timer;
      requestAnimationFrame(() => { if (timer === mine) run(g.tick(now())); });
    };
    timer = setTimeout(due, Math.max(0, d - now()) + 1);
  }
  function takeFromApp(id) {
    const p = info.get(id);
    if (!p || taken.has(id)) return;
    taken.add(id);
    E.cancel(p.target, id, p.kind, p.x, p.y);
  }

  function run(actions, ev) {
    for (const a of actions) {
      if (a.type === 'doubletap') doubleTap(a);
      else if (a.type === 'longpress') longPress(a);
      else if (a.type === 'pinchstart') {
        const first = info.get(a.ids[0]), s = first && first.surface;
        if (E.takesPinch(s)) { for (const id of a.ids) { if (ev && id === ev.pointerId) taken.add(id); else takeFromApp(id); } }
        if (ev && taken.has(ev.pointerId)) swallow(ev);
      } else if (a.type === 'pinch') {
        const id = ev && ev.pointerId, p = info.get(id);
        if (p && E.takesPinch(p.surface)) E.pinch(p.surface, a);
      }
    }
    schedule();
  }

  function doubleTap(a) {
    const p = info.get(a.id) || {};
    if (E.editable(p.target)) return; // a text field selects the word itself
    // After the second tap's click, as with a mouse (click, click, dblclick); if no click comes, a moment later.
    const fire = () => {
      if (pendingDbl !== d) return;
      pendingDbl = null;
      sentDbl = now();
      E.dblclick(d.target && d.target.isConnected ? d.target : E.at(a.x, a.y, p.target), a.x, a.y);
    };
    const d = { x: a.x, y: a.y, target: E.at(a.x, a.y, p.target), fire, timer: setTimeout(fire, 350) };
    pendingDbl = d;
  }

  function longPress(a) {
    const p = info.get(a.id);
    if (!p || taken.has(a.id)) return;
    const at = E.at(a.x, a.y, p.target);
    // a text field, or one the press itself opened under the finger (an in-place editor): its own long press is the system's
    if (E.editable(p.target) || E.editable(at)) return;
    sentMenu = now();
    const ev = E.contextmenu(at, a.x, a.y);
    if (ev.defaultPrevented) blockClickUntil = Infinity; // until the finger lifts, then CLICK_MS more
  }

  /** A finger whose pointerup never came: the element it touched left the page (the app drew it anew, or opened an
   *  editor in its place), and browsers send the rest of that touch to the removed element, where nothing hears it.
   *  The layer forgets it and tells the page (a pointercancel on the document), so no app keeps a finger that is gone
   *  (SlopNav would read the next touch as a second finger, a pinch). */
  function lost(id, p) {
    g.cancel({ id }); info.delete(id);
    E.cancel(p.target, id, p.kind, p.x, p.y);
  }

  function onDown(e) {
    T.last = e.pointerType || 'mouse';
    if (!finger(e) || e.slopTouch) return;
    for (const [id, p] of info) if (id !== e.pointerId && p.target && !p.target.isConnected && !taken.has(id)) lost(id, p);
    // The first finger of a touch (isPrimary): every finger still remembered lifted without telling (iOS loses lifts)
    if (e.pointerType === 'touch' && e.isPrimary) for (const [id, p] of info) if (id !== e.pointerId && p.kind === 'touch') { taken.delete(id); lost(id, p); }
    if (e.pointerType === 'pen') {
      pens++;
      if (T.palm) for (const [id, p] of info) if (p.kind === 'touch') { takeFromApp(id); g.cancel({ id }); }
    } else if (T.palm && (pens || now() - penUpAt < PALM_MS)) {
      taken.add(e.pointerId); info.set(e.pointerId, { target: e.target, kind: 'touch', x: e.clientX, y: e.clientY });
      swallow(e);
      return;
    }
    info.set(e.pointerId, { target: e.target, kind: e.pointerType, x: e.clientX, y: e.clientY, surface: E.surfaceOf(e.target), t: T.gesture.stamp(e, now()) });
    run(g.down(sample(e)), e);
  }
  function onMove(e) {
    if (!finger(e) || e.slopTouch || !info.has(e.pointerId)) return;
    const p = info.get(e.pointerId);
    p.x = e.clientX; p.y = e.clientY;
    run(g.move(sample(e)), e);
    if (taken.has(e.pointerId)) swallow(e);
  }
  function onEnd(e) {
    if (!finger(e) || e.slopTouch || !info.has(e.pointerId)) return;
    const p = info.get(e.pointerId);
    if (p.kind === 'pen') { pens = Math.max(0, pens - 1); penUpAt = now(); }
    run(e.type === 'pointerup' ? g.up(sample(e)) : g.cancel(sample(e)), e);
    if (taken.has(e.pointerId)) { taken.delete(e.pointerId); swallow(e); blockClickUntil = Math.max(blockClickUntil, now() + CLICK_MS); }
    else if (blockClickUntil === Infinity) blockClickUntil = now() + CLICK_MS;
    info.delete(e.pointerId);
    if (!info.size) schedule();
  }

  function onClick(e) {
    // A real click means the fingers that touched before it have lifted, even when the browser sent no pointerup:
    // forget them (lost()). Not a finger that touched after it: a busy page hands over a tap's click late, after the
    // next touch (the second tap of a double tap) has landed, and that finger is still down.
    if (e.isTrusted) for (const [id, p] of info) if (p.kind === 'touch' && !taken.has(id) && T.gesture.clickAfter(e, p.t, now())) lost(id, p);
    if (now() < blockClickUntil && e.isTrusted) { blockClickUntil = 0; swallow(e); return; }
    if (pendingDbl && Math.hypot(e.clientX - pendingDbl.x, e.clientY - pendingDbl.y) <= 30) {
      const d = pendingDbl;
      clearTimeout(d.timer);
      d.target = e.target;
      // After the app's own click handlers, still inside the click: a user gesture, so an editor the dblclick opens can
      // focus and iOS shows the keyboard (it does not for a focus from a timer). If an app stops the click, a moment later.
      const after = (ev) => { removeEventListener('click', after); if (ev === e) d.fire(); else setTimeout(d.fire, 0); };
      addEventListener('click', after);
      d.timer = setTimeout(() => { removeEventListener('click', after); d.fire(); }, 60);
    }
  }
  function onNativeDbl(e) {
    if (e.slopTouch || !e.isTrusted) return;
    if (pendingDbl) { clearTimeout(pendingDbl.timer); pendingDbl = null; sentDbl = now(); return; } // the browser sent it: ours is not needed
    if (now() - sentDbl < NATIVE_MS) swallow(e);
  }
  function onNativeMenu(e) {
    if (e.slopTouch || !e.isTrusted) return;
    if (now() - sentMenu < NATIVE_MS) { swallow(e); return; }
    // Chrome on Android opens its own on a long press: then the layer sends none for the fingers that are down.
    let touching = false;
    for (const [id, p] of info) if (p.kind !== 'mouse') { g.skipLong(id); touching = true; }
    if (touching) { sentMenu = now(); schedule(); addEventListener('contextmenu', after, { once: true }); }
    function after(ev) { if (ev === e && e.defaultPrevented && info.size) blockClickUntil = Infinity; }
  }
  function onGesture(e) { if (E.surfaceOf(e.target)) e.preventDefault(); }

  const cap = { capture: true };
  addEventListener('pointerdown', onDown, cap);
  addEventListener('pointermove', onMove, cap);
  addEventListener('pointerup', onEnd, cap);
  addEventListener('pointercancel', onEnd, cap);
  addEventListener('click', onClick, cap);
  addEventListener('dblclick', onNativeDbl, cap);
  addEventListener('contextmenu', onNativeMenu, cap);
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, onGesture, { passive: false });
  addEventListener('blur', () => { g.reset(); info.clear(); taken.clear(); pens = 0; schedule(); });
  T.ready = true;
})();
