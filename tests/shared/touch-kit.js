/* Touch input for the test pages of the touch runs (tests/run.mjs --touch; pages marked <meta name="slop-test-touch">).
 * Fingers go through the runner's bridge (window.__slopInput, tests/touch.mjs) as real touches where the engine can
 * (a tap in every engine; any gesture in Chromium, by CDP), else as touch pointer events sent in the page, the way the
 * browser would send them (implicitly captured to the element first touched while it is on the page, a click after a
 * tap).
 *   TouchKit.tap(t) · doubleTap(t) · busyTaps(t, n, busy) · longPress(t, ms) · drag(t, dx, dy, steps) · pinch(t, scale, steps) · pan2(t, dx, dy)
 * t is an element (its centre), { el, x, y } (x, y from the element's top left) or { x, y } in the test page. Elements in
 * a same-origin iframe are found through their frame. Each resolves once the gesture is over.
 * TouchKit.real: true when the gestures beyond a tap are real touches (Chromium). Real gestures other than the long press
 * are paced by the runner, not this page (tests/touch.mjs paced()): a finger does not wait for a busy page, so each step
 * is stamped with its own time and none waits for the page to take the one before; the kit then waits until the page
 * has had every lift. Covers: shared/input/touch.js */
(function () {
  'use strict';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const info = () => window.__SLOPTEST_TOUCH__ || { engine: 'none', multi: false };
  const bridge = (op) => (typeof window.__slopInput === 'function' ? window.__slopInput(op) : Promise.resolve(false));
  let nextId = 100;
  // The test page is the top document, where a real app page carries touch.css's html { touch-action: manipulation }:
  // without it a double tap on the app's frame zooms this page (Chromium) and every later finger lands elsewhere.
  document.documentElement.style.touchAction = 'manipulation';

  /** A target as { x, y } in the top page plus where it is in its own frame ({ win, lx, ly }). */
  function where(t) {
    let el = t && t.nodeType === 1 ? t : t && t.el, lx, ly;
    if (el) {
      const r = el.getBoundingClientRect();
      lx = r.left + (t.el ? t.x : r.width / 2); ly = r.top + (t.el ? t.y : r.height / 2);
    } else { lx = t.x; ly = t.y; }
    const win = el ? el.ownerDocument.defaultView : window;
    let x = lx, y = ly, w = win;
    while (w !== window && w.frameElement) {
      const fr = w.frameElement.getBoundingClientRect(), cs = w.frameElement.ownerDocument.defaultView.getComputedStyle(w.frameElement);
      x += fr.left + parseFloat(cs.borderLeftWidth || 0); y += fr.top + parseFloat(cs.borderTopWidth || 0);
      w = w.parent;
    }
    return { x, y, win, lx, ly };
  }
  /** The frame window and its coordinates for a top-page point (into same-origin iframes). */
  function local(x, y) {
    let win = window, lx = x, ly = y;
    for (;;) {
      const el = win.document.elementFromPoint(lx, ly);
      if (!el || el.tagName !== 'IFRAME' || !el.contentWindow) return { win, el, lx, ly };
      const r = el.getBoundingClientRect();
      win = el.contentWindow; lx -= r.left; ly -= r.top;
    }
  }

  /** The page's pointer capture accepts the kit's fingers (a browser refuses a pointer it did not make itself, and the
   *  app would throw where a real finger works): capturing one of them does nothing, as touch pointers are already
   *  captured to what they touched. */
  const kitIds = new Set();
  const down = { touch: 0, pen: 0 }; // the kit's fingers (and pens) down now: only the first is primary, as in a browser
  function allowCapture(W) {
    const P = W.Element.prototype;
    if (P.__touchKit) return;
    P.__touchKit = true;
    for (const name of ['setPointerCapture', 'releasePointerCapture']) {
      const real = P[name];
      P[name] = function (id) { if (kitIds.has(id)) return undefined; return real.call(this, id); };
    }
  }
  /** A synthetic finger: pointer events sent to what it first touched (as touch pointers are captured). */
  function finger(x, y, kind = 'touch', pressure = 0.5) {
    const id = nextId++, start = local(x, y), target = start.el || start.win.document.body;
    kitIds.add(id);
    allowCapture(start.win);
    const ox = x - start.lx, oy = y - start.ly; // the frame's offset in the top page
    const primary = !down[kind]; down[kind] = (down[kind] || 0) + 1;
    let lifted = false;
    const lift = () => { if (!lifted) { lifted = true; down[kind]--; } };
    const send = (type, px, py, extra) => {
      const W = start.win;
      // A target the app took off the page (it re-rendered) no longer gets the events: as the browser does, what is
      // under the finger gets them instead.
      const to = target.isConnected ? target : W.document.elementFromPoint(px - ox, py - oy) || W.document.body;
      to.dispatchEvent(new W.PointerEvent(type, { bubbles: true, cancelable: type !== 'pointercancel', composed: true, view: W,
        pointerId: id, pointerType: kind, isPrimary: primary, clientX: px - ox, clientY: py - oy, screenX: px, screenY: py,
        button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
        pressure: type === 'pointerup' ? 0 : pressure, width: 8, height: 8, ...extra }));
    };
    send('pointerdown', x, y);
    return {
      move(px, py) { send('pointermove', px, py); },
      up(px, py, click) {
        send('pointerup', px, py); lift();
        if (click) (target.isConnected ? target : start.win.document.elementFromPoint(px - ox, py - oy) || start.win.document.body).dispatchEvent(new start.win.MouseEvent('click', { bubbles: true, cancelable: true, view: start.win, clientX: px - ox, clientY: py - oy, detail: 1 }));
      },
      cancel() { send('pointercancel', x, y); lift(); },
    };
  }

  /** Real fingers by CDP: down/move/up of a set of { id, x, y } points. */
  const cdp = (type, points, rest) => bridge({ op: 'touch', type, points, rest });
  const frame = (W) => new Promise((r) => W.requestAnimationFrame(() => r()));
  /** The page under p has drawn what it last changed, twice over: the browser tells a drag from a scroll by the
   *  touch-action of what the finger lands on, as of the last frame it got (an element just shown or moved, on a busy
   *  machine, is not yet where the page has it, and the touch becomes a scroll that cancels the app's drag). */
  async function settled(W) { await frame(W); await frame(W); }
  /** A real gesture at top-page point p, its steps ({ type, points, rest, at } with at in ms) paced by the runner; resolves
   *  once the page under p has had `lifts` finger lifts (a pointerup or pointercancel; 3 s at most, for a finger whose
   *  element left the page) and drawn a frame. */
  async function gesture(p, steps, lifts) {
    const W = local(p.x, p.y).win;
    await settled(W);
    let n = 0;
    const lift = (e) => { if (e.pointerType === 'touch' && e.isTrusted) n++; };
    W.addEventListener('pointerup', lift, true); W.addEventListener('pointercancel', lift, true);
    try {
      await bridge({ op: 'touches', steps });
      for (const t0 = performance.now(); n < lifts && performance.now() - t0 < 3000;) await sleep(10);
      await frame(W);
    } finally { W.removeEventListener('pointerup', lift, true); W.removeEventListener('pointercancel', lift, true); }
  }
  const one = (p) => [{ id: 1, x: p.x, y: p.y }];

  async function tap(t) {
    const p = where(t);
    // Chromium: the same CDP touches as every other gesture (Playwright's own tap there can leave a finger down for the
    // next CDP touch, which then reads as a second finger)
    if (info().multi) { await gesture(p, [{ type: 'start', points: one(p) }, { type: 'end', at: 40 }], 1); return sleep(30); }
    if (await bridge({ op: 'tap', x: p.x, y: p.y })) return sleep(30);
    const f = finger(p.x, p.y);
    await sleep(40);
    f.up(p.x, p.y, true);
    return sleep(30);
  }
  /** Both taps at the same place, even when the first one makes the app draw the target anew. */
  async function doubleTap(t) {
    const p = where(t), at = { x: p.x, y: p.y };
    if (info().multi) { // two 40 ms taps, 90 ms apart (the layer's double tap: at most 300 ms from the lift to the touch)
      await gesture(p, [{ type: 'start', points: one(p) }, { type: 'end', at: 40 }, { type: 'start', points: one(p), at: 130 }, { type: 'end', at: 170 }], 2);
      return sleep(420);
    }
    await tap(at); await sleep(90); await tap(at); return sleep(420);
  }

  /** n quick taps at t (40 ms each, 90 ms apart) as a busy page gets them: each event made (stamped) when the finger did
   *  it, and the page busy for `busy` ms before it takes the last lift (a regression test that taps are timed by when
   *  they happened, not by when the page got to them). Sent in the page, to what is under t when each goes. */
  async function busyTaps(t, n = 1, busy = 700) {
    const p = where(t), W = p.win, send = (e) => (W.document.elementFromPoint(p.lx, p.ly) || W.document.body).dispatchEvent(e);
    const ev = (type, id) => new W.PointerEvent(type, { bubbles: true, cancelable: true, composed: true, view: W, pointerId: id, pointerType: 'touch', isPrimary: true,
      clientX: p.lx, clientY: p.ly, screenX: p.x, screenY: p.y, button: 0, buttons: type === 'pointerdown' ? 1 : 0, width: 8, height: 8 });
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      if (i) await sleep(90);
      send(ev('pointerdown', id));
      await sleep(40);
      const up = ev('pointerup', id);
      if (i === n - 1) for (const t0 = performance.now(); performance.now() - t0 < busy;) { /* the page is busy */ }
      send(up);
    }
  }

  /** A finger held still: ms (1100: the layer's 500 with room) from when the page took the touch, and when no menu has
   *  come by then (a busy page starts the layer's hold again: touch.js BUSY_MS), on until one comes, 3 s at most. A
   *  person holds until the menu shows; a hold timed from the page's own clock does not count the time it was busy. */
  async function longPress(t, ms = 1100) {
    const p = where(t), W = local(p.x, p.y).win;
    let menu = false, downAt = 0;
    const onMenu = () => { menu = true; }, onDown = (e) => { if (!downAt && e.pointerType === 'touch') downAt = performance.now(); };
    W.addEventListener('contextmenu', onMenu, true); W.addEventListener('pointerdown', onDown, true);
    try {
      let f = null;
      if (info().multi) { await settled(W); await cdp('start', one(p)); } else f = finger(p.x, p.y);
      const t0 = performance.now(), held = () => performance.now() - (downAt || t0);
      while (held() < ms || (!menu && held() < 3000)) await sleep(10);
      if (f) f.up(p.x, p.y, false); else await cdp('end', []);
    } finally { W.removeEventListener('contextmenu', onMenu, true); W.removeEventListener('pointerdown', onDown, true); }
    return sleep(60);
  }

  async function drag(t, dx, dy, steps = 8, opts = {}) {
    const p = where(t);
    if (info().multi && !opts.kind) {
      const g = [{ type: 'start', points: one(p) }];
      for (let i = 1; i <= steps; i++) g.push({ type: 'move', points: [{ id: 1, x: p.x + (dx * i) / steps, y: p.y + (dy * i) / steps }], at: 16 * i });
      g.push({ type: 'end', at: 16 * steps + 8 });
      await gesture(p, g, 1);
      return sleep(60);
    }
    const f = finger(p.x, p.y, opts.kind || 'touch', opts.pressure);
    for (let i = 1; i <= steps; i++) { await sleep(16); f.move(p.x + (dx * i) / steps, p.y + (dy * i) / steps); }
    f.up(p.x + dx, p.y + dy, false);
    return sleep(60);
  }

  /** Two fingers about the target's centre, spread from 80 px apart to 80·scale, and moved (dx, dy) together. */
  async function pinch(t, scale = 2, steps = 8, dx = 0, dy = 0) {
    const p = where(t), d0 = 40, d1 = 40 * scale;
    const at = (k) => { const d = d0 + (d1 - d0) * k; return [{ id: 1, x: p.x - d + dx * k, y: p.y + dy * k }, { id: 2, x: p.x + d + dx * k, y: p.y + dy * k }]; };
    if (info().multi) {
      const g = [{ type: 'start', points: [at(0)[0]] }, { type: 'start', points: at(0), at: 16 }];
      for (let i = 1; i <= steps; i++) g.push({ type: 'move', points: at(i / steps), at: 16 * (i + 1) });
      g.push({ type: 'end', rest: [at(1)[0]], at: 16 * (steps + 2) }, { type: 'end', at: 16 * (steps + 3) });
      await gesture(p, g, 2);
      return sleep(80);
    }
    const [a, b] = at(0), fa = finger(a.x, a.y);
    await sleep(16);
    const fb = finger(b.x, b.y);
    for (let i = 1; i <= steps; i++) { await sleep(16); const [pa, pb] = at(i / steps); fa.move(pa.x, pa.y); fb.move(pb.x, pb.y); }
    const [ea, eb] = at(1);
    fb.up(eb.x, eb.y); fa.up(ea.x, ea.y);
    return sleep(80);
  }
  const pan2 = (t, dx, dy, steps = 8) => pinch(t, 1, steps, dx, dy);

  window.TouchKit = { tap, doubleTap, busyTaps, longPress, drag, pinch, pan2, finger, where, get real() { return !!info().multi; }, get engine() { return info().engine; } };
})();
