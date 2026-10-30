/* Helpers for the Slop Slides app tests: open the real editor in an iframe, drive it with pointer and key events,
   and make small files for Slop Drive. Each test page is its own browser context, so its IndexedDB is private. */
window.ST = (function () {
  'use strict';
  const { waitFor } = SlopTest;
  /** Opens the editor (or any ?drive= url) in a fresh iframe; resolves with its window once it is ready. */
  async function open(src, { width = 1000, height = 700 } = {}) {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${width}px;height:${height}px;border:0;background:#0e0e10`;
    f.src = src || '../../slides/';
    document.body.append(f);
    await waitFor(() => f.contentWindow && f.contentWindow.document.body && f.contentWindow.document.body.classList.contains('ready'), { timeout: 20000 });
    const w = f.contentWindow;
    w.__frame = f;
    return w;
  }
  function close(w) { if (w && w.__frame) w.__frame.remove(); }
  /** Pointer event on the editing canvas at slide point (x, y). */
  function ptr(w, type, x, y) {
    const c = w.SS.stage.toClient(x, y);
    const ev = new w.PointerEvent(type, { clientX: c.x, clientY: c.y, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
    w.SS.stage.cv.dispatchEvent(ev);
  }
  /** A click (down then up) at slide point (x, y). */
  function click(w, x, y) { ptr(w, 'pointerdown', x, y); ptr(w, 'pointerup', x, y); }
  /** A keydown on the page, as the keyboard would send it (SlopCmd listens on window). */
  function key(w, k, mods = {}) {
    const target = w.document.activeElement && w.document.activeElement !== w.document.body ? w.document.activeElement : w.document.body;
    target.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods)));
  }
  const ctrl = (w, k, extra = {}) => key(w, k, Object.assign({ ctrlKey: true }, extra));
  /** Centre of an object in slide points. */
  const centre = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
  /** A small PNG blob (solid colour) for picture tests. */
  async function png(w, color = '#d4ff3a', size = 32) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, size, size);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  /** Parses an XML string and reports whether it is well formed. */
  function wellFormed(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return !doc.getElementsByTagName('parsererror').length;
  }
  return { open, close, ptr, click, key, ctrl, centre, png, wellFormed };
})();
