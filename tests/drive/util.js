/* Helpers shared by the Slop Drive tests: frames, raw IndexedDB, small blobs. */
window.DT = (function () {
  const { waitFor } = SlopTest;
  /** Load a same-origin page in a fresh iframe; resolves with its window once ready(win) is true. */
  async function frame(src, ready = (w) => w.SlopHub, { width = 1280, height = 760 } = {}) {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${width}px;height:${height}px;border:0`;
    f.src = src; document.body.append(f);
    await waitFor(() => f.contentWindow && f.contentWindow.document.readyState === 'complete' && ready(f.contentWindow), { timeout: 20000 });
    f.contentWindow.__frame = f;
    return f.contentWindow;
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function openRaw(name, version, upgrade) {
    return new Promise((res, rej) => { const r = indexedDB.open(name, version); r.onupgradeneeded = () => upgrade && upgrade(r.result, r.transaction); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function delDb(name) { await new Promise((res) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); }); }
  const text = (s, type = 'text/plain') => new Blob([s], { type });
  async function png(color = '#d4ff3a', w = 40, h = 30) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w / 4, h / 4, w / 2, h / 2);
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }
  const key = (e, opts = {}) => new KeyboardEvent('keydown', Object.assign({ key: e, bubbles: true, cancelable: true }, opts));
  return { frame, req, openRaw, delDb, text, png, key };
})();
