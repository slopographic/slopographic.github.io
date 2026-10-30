/* SlopTouch gesture recognizer: pure, no DOM. Fed touch and pen pointer samples with their times, it tells what the
 * fingers did: a tap, a double tap, a long press, or a two-finger pinch and pan. shared/input/touch.js turns those into
 * the events the apps already handle (dblclick, contextmenu, wheel, or a surface's own zoom/pan hooks).
 * Classic script: sets window.SlopTouch.gesture, and module.exports under Node (tests/node/touch-gesture.test.mjs).
 *
 *   const g = create(options?)
 *   g.down({ id, x, y, t, kind })  g.move(...)  g.up(...)  g.cancel({ id })  → an array of actions
 *   g.tick(t)                      → actions due by time t (the long press); call it at g.deadline()
 *   g.deadline()                   → when tick next has something to do, or Infinity
 *   g.reset()                      → forget everything (a pen came down, the page lost focus)
 * kind is 'touch' or 'pen' (mouse is not fed in). x, y in CSS pixels, t in milliseconds: when the finger did it (taps
 * and double taps are timed by it). down's optional at: when the page got the touch, where the long-press clock starts
 * (a touch handled late must not long-press before the page has had its queued moves and lift); default t.
 * Actions: { type: 'tap', x, y, id } · { type: 'doubletap', x, y, id } · { type: 'longpress', x, y, id }
 *          { type: 'pinchstart', ids, cx, cy } · { type: 'pinch', scale, cx, cy, dx, dy } · { type: 'pinchend' }
 * pinch: scale is since the previous pinch action (multiply them up), cx/cy the midpoint now, dx/dy its move.
 * stamp(e, now) → when a pointer event happened (its timeStamp), on the clock of performance.now(): an app that times a
 * tap by when its handler runs reads a quick tap as a hold while the page is busy (the lift waits in the queue).
 * clickAfter(click, t, now) → a click came after a touch made at t (a busy page can hand over a tap's click after the
 * next touch has landed: that click tells nothing of the newer finger). */
(function () {
  'use strict';
  const DEFAULTS = {
    slop: 10,          // px a finger may wander and still be a tap or a long press
    tapMs: 500,        // longest press that still counts as a tap (a longer one is a long press, or nothing)
    doubleMs: 300,     // most time from the first tap's lift to the second tap's touch
    doubleSlop: 24,    // most distance between the two taps of a double tap
    longMs: 500,       // hold this long, still, for a long press
  };

  function create(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const pts = new Map();      // id → { x0, y0, x, y, t0, kind, moved, long }
    let lastTap = null;         // { x, y, t } of the last single tap's lift
    let pinch = null;           // { ids:[a,b], d, cx, cy }
    let multi = false;          // two fingers have been down since the last time all were up: no taps until all lift

    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    function mid() {
      const [a, b] = pinch.ids.map((id) => pts.get(id));
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: dist(a.x, a.y, b.x, b.y) };
    }

    function down(p) {
      const out = [];
      pts.set(p.id, { x0: p.x, y0: p.y, x: p.x, y: p.y, t0: p.t, tl: p.at != null ? p.at : p.t, kind: p.kind || 'touch', moved: false, long: false });
      const touches = [...pts.entries()].filter(([, s]) => s.kind === 'touch');
      if (pts.size >= 2) {
        multi = true;
        lastTap = null;
        for (const s of pts.values()) s.long = true; // no long press, no tap, from any finger now down
        if (!pinch && touches.length === 2) {
          pinch = { ids: touches.map(([id]) => id) };
          const m = mid();
          Object.assign(pinch, m);
          out.push({ type: 'pinchstart', ids: pinch.ids.slice(), cx: m.cx, cy: m.cy });
        }
      }
      return out;
    }

    function move(p) {
      const s = pts.get(p.id);
      if (!s) return [];
      s.x = p.x; s.y = p.y;
      if (!s.moved && dist(s.x0, s.y0, p.x, p.y) > o.slop) s.moved = true;
      if (pinch && pinch.ids.includes(p.id)) {
        const m = mid();
        const scale = pinch.d > 0 && m.d > 0 ? m.d / pinch.d : 1;
        const a = { type: 'pinch', scale, cx: m.cx, cy: m.cy, dx: m.cx - pinch.cx, dy: m.cy - pinch.cy };
        Object.assign(pinch, m);
        return [a];
      }
      return [];
    }

    function end(p, cancelled) {
      const s = pts.get(p.id);
      if (!s) return [];
      pts.delete(p.id);
      const out = [];
      if (pinch && pinch.ids.includes(p.id)) { pinch = null; out.push({ type: 'pinchend' }); }
      const wasMulti = multi;
      if (!pts.size) multi = false;
      if (cancelled || wasMulti || s.long || s.moved) return out;
      const x = p.x != null ? p.x : s.x, y = p.y != null ? p.y : s.y;
      if (dist(s.x0, s.y0, x, y) > o.slop || p.t - s.t0 > o.tapMs) { lastTap = null; return out; }
      if (lastTap && s.t0 - lastTap.t <= o.doubleMs && dist(lastTap.x, lastTap.y, s.x0, s.y0) <= o.doubleSlop) {
        lastTap = null;
        out.push({ type: 'doubletap', x, y, id: p.id });
      } else {
        lastTap = { x, y, t: p.t };
        out.push({ type: 'tap', x, y, id: p.id });
      }
      return out;
    }

    function tick(t) {
      const out = [];
      for (const [id, s] of pts) {
        if (s.long || s.moved || multi) continue;
        if (t - s.tl >= o.longMs) { s.long = true; lastTap = null; out.push({ type: 'longpress', x: s.x, y: s.y, id }); }
      }
      return out;
    }

    function deadline() {
      let next = Infinity;
      if (multi) return next;
      for (const s of pts.values()) if (!s.long && !s.moved) next = Math.min(next, s.tl + o.longMs);
      return next;
    }

    /** No long press for this pointer: the browser opened its own menu, or the app took the gesture. */
    function skipLong(id) { const s = pts.get(id); if (s) s.long = true; }


    function reset() { pts.clear(); lastTap = null; pinch = null; multi = false; }

    return {
      down, move, tick, deadline, reset, skipLong,
      up: (p) => end(p, false),
      cancel: (p) => end(p, true),
      get size() { return pts.size; },
      get pinching() { return !!pinch; },
      options: o,
    };
  }

  /** The pressure a stroke uses (0–1) for a pointer event: a pen's own (one that reports 0, as some do on the first
   *  contact, counts as 0.5); a finger or a mouse always 1. iOS reports 0 for a finger, Chrome 0.5 while pressed: a
   *  stroke that read those would paint faint or not at all. */
  function pressure(e) {
    if (!e || e.pointerType !== 'pen') return 1;
    const p = Number(e.pressure);
    return p > 0 ? Math.min(1, p) : 0.5;
  }

  /** e.timeStamp when it is a time on now's clock (not later than now, nor a minute before it), else now. */
  function stamp(e, now) {
    const t = e && Number(e.timeStamp);
    return Number.isFinite(t) && t > 0 && t <= now + 1 && now - t < 60000 ? t : now;
  }

  const clickAfter = (click, t, now) => stamp(click, now) >= t;

  const api = { create, DEFAULTS, pressure, stamp, clickAfter };
  if (typeof window !== 'undefined') { window.SlopTouch = window.SlopTouch || {}; window.SlopTouch.gesture = api; }
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
