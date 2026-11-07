/* Slop Font test helpers (tests/fontcreator/*.test.html): open the app fresh in the frame, and drive the glyph editor
 * with pointer events at font coordinates (y up), as a mouse would. Exposes window.FT. */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const dropDb = () => new Promise((res) => { try { const r = indexedDB.deleteDatabase('slop-fontcreator'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); } });
  /** Loads fontcreator/ in the frame (a new font unless keep), waits until it is ready: { W, D, FC }. */
  async function open(fr, { keep = false, src = '../../fontcreator/index.html' } = {}) {
    if (!keep) { fr.src = 'about:blank'; await new Promise((r) => setTimeout(r, 50)); localStorage.removeItem('slop-fontcreator'); localStorage.removeItem('slop.tour.fontcreator'); await dropDb(); }
    if (keep) { fr.contentWindow.__ftOld = true; fr.contentWindow.location.reload(); } else fr.src = src;
    await waitFor(() => { try { const W = fr.contentWindow; return !W.__ftOld && W.FC && W.FC.main && W.FC.state && W.document.getElementById('fc-download') && W.document.body.classList.contains('ready'); } catch (e) { return false; } }, { timeout: 30000 });
    const W = fr.contentWindow;
    await W.FC.main.ready;
    // the cookie card would sit over the editor on a phone: choose, and take it away
    try { if (W.SlopConsentState) W.SlopConsentState.write({ analytics: false, ads: false, rates: false }); if (W.SlopBanner) W.SlopBanner.remove(); } catch (e) { /* no consent layer */ }
    return { W, D: W.document, FC: W.FC };
  }
  const canvas = (W) => W.document.getElementById('fc-canvas');
  function at(W, pt) {
    const c = canvas(W), r = c.getBoundingClientRect(), s = W.FC.editor.toScreen(pt.x, pt.y);
    return { clientX: r.left + s.x, clientY: r.top + s.y };
  }
  function fire(W, type, pt, mods = {}) {
    const ev = Object.assign({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }, at(W, pt), mods);
    canvas(W).dispatchEvent(new W.PointerEvent(type, ev));
  }
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function drag(W, a, b, mods) {
    fire(W, 'pointerdown', a, mods);
    for (let i = 1; i <= 4; i++) fire(W, 'pointermove', { x: a.x + ((b.x - a.x) * i) / 4, y: a.y + ((b.y - a.y) * i) / 4 }, mods);
    fire(W, 'pointerup', b, mods);
    await frame();
  }
  async function tap(W, p, mods) { fire(W, 'pointerdown', p, mods); fire(W, 'pointerup', p, mods); await frame(); }
  async function dbl(W, p) { canvas(W).dispatchEvent(new W.MouseEvent('dblclick', Object.assign({ bubbles: true, cancelable: true }, at(W, p)))); await frame(); }
  function key(W, k, mods = {}) { canvas(W).dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods))); }
  function click(D, id) { const b = D.getElementById(id); if (!b) throw new Error('no #' + id); b.click(); }
  function change(D, id, v) { const i = D.getElementById(id); i.value = String(v); i.dispatchEvent(new D.defaultView.Event('change', { bubbles: true })); }
  window.FT = { open, drag, tap, dbl, key, click, change, fire, at };
})();
