// Pointer drag for the calendar views. track() follows a press on a chip or block: move while the pointer is down, drop on
// release, and a press that never moved is a click. The helpers work out what a drop changes, and return the change to
// save on the event record. Times are worked out on the viewer's wall clock and saved as instants in the event's zone.
// A repeating event moves or resizes as a whole series, by the same amount as the occurrence. Moves land on the half
// hour, resizes move in 15-minute steps. Exposes window.SlopCal.drag.
(function (g) {
  'use strict';
  const T = g.SlopTime;
  const NS = (g.SlopCal = g.SlopCal || {});
  const MIN = 60000, DAY = 1440, THRESH = 4;
  const MOVE_SNAP = 30, RESIZE_SNAP = 15;

  /**
   * Follows a drag that starts with a press on node. h: { start(p), move(p), drop(p), end(), click() }, where p is
   * { x, y, dx, dy } in viewport pixels from the press. drop runs only after a real move; end runs after every drag.
   */
  function track(e, node, h) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();   // no text selection while the pointer is held down on a chip
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const at = (ev) => ({ x: ev.clientX, y: ev.clientY, dx: ev.clientX - x0, dy: ev.clientY - y0 });
    const off = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
    const finish = () => { off(); node.classList.remove('dragging'); if (h.end) h.end(); };
    const onMove = (ev) => {
      const p = at(ev);
      if (!moved) {
        if (Math.hypot(p.dx, p.dy) < THRESH) return;
        moved = true;
        node.classList.add('dragging');
        if (h.start) h.start(p);
      }
      if (h.move) h.move(p);
    };
    const onUp = (ev) => {
      const p = at(ev), was = moved;
      finish();
      if (!was) { if (h.click) h.click(); return; }
      stopClick();
      if (h.drop) h.drop(p);
    };
    const onCancel = () => finish();
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }

  /** The click the browser sends after a drop (in the same task as the release) is swallowed, so letting go of a chip does not open it. */
  function stopClick() {
    const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 0);
  }

  /** The minute of the day (0 to 1439) a timed item starts, in the viewer's zone. */
  function minuteOf(it, zone) { const p = T.parts(it.start, zone); return p.h * 60 + p.mi; }

  /** The instant of a wall-clock reading (given as a UTC Date value) in zone. */
  function instantOf(wall, zone) {
    const w = new Date(wall);
    return T.wallToUtc(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), zone);
  }

  /**
   * A timed event moved dayShift days, and started at toMin (minute of that day) when given, else at its own time.
   * Returns { start, end, change } for the occurrence and the record, or null when nothing changes.
   */
  function timedMove(it, dayShift, toMin, zone) {
    const p = T.parts(it.start, zone);
    const origMin = p.h * 60 + p.mi, minute = toMin === undefined ? origMin : toMin;
    if (!dayShift && minute === origMin) return null;
    const start = instantOf(Date.UTC(p.y, p.mo - 1, p.d + dayShift, 0, minute), zone);
    const delta = start - it.start;
    if (!delta) return null;
    return { start, end: it.end + delta, change: { start: it.rec.start + delta, end: it.rec.end + delta } };
  }

  /** An all-day event moved n days. Returns { change } or null. */
  function dayMove(it, n) {
    if (!n) return null;
    const r = it.rec;
    return { change: { startDay: T.addDays(r.startDay, n), endDay: T.addDays(r.endDay || r.startDay, n) } };
  }

  /** A timed event's end moved by dyMin minutes (in 15-minute steps, never shorter than one step). Returns { end, change } or null. */
  function resizeEnd(it, dyMin) {
    const step = Math.round(dyMin / RESIZE_SNAP) * RESIZE_SNAP;
    if (!step) return null;
    const end = Math.max(it.start + RESIZE_SNAP * MIN, it.end + step * MIN);
    const delta = end - it.end;
    if (!delta) return null;
    return { end, change: { end: it.rec.end + delta } };
  }

  /** A small label that follows the pointer while dragging, with the new day and time. */
  let tipEl = null;
  function tip(text, x, y) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'dr-tip'; tipEl.setAttribute('aria-hidden', 'true'); document.body.append(tipEl); }
    tipEl.textContent = text;
    tipEl.style.left = `${x + 14}px`;
    tipEl.style.top = `${y - 34}px`;
  }
  function tipHide() { if (tipEl) tipEl.remove(); tipEl = null; }

  NS.drag = { track, timedMove, dayMove, resizeEnd, minuteOf, tip, tipHide, MOVE_SNAP, RESIZE_SNAP };
})(typeof window !== 'undefined' ? window : globalThis);
