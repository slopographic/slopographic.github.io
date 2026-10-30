/* SlopTour spotlight: dims the page, cuts a hole around the step's target and draws a floating tip beside it.
 * Every layer has pointer-events off, so the app underneath keeps working while a tour is open.
 * Classic script. Sets window.SlopTour.spot. */
(function () {
  'use strict';
  const T = (window.SlopTour = window.SlopTour || {});
  const PAD = 6, GAP = 12, TIP_MAX = 300, EDGE = 8;
  let dim = null, hole = null, tip = null, raf = 0, bound = false;

  function ensure() {
    if (dim) return;
    dim = document.createElement('div'); dim.className = 'stour-dim'; dim.hidden = true;
    hole = document.createElement('div'); hole.className = 'stour-hole'; hole.hidden = true;
    tip = document.createElement('div'); tip.className = 'stour-tip'; tip.hidden = true;
    tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');
    document.body.append(dim, hole, tip);
    if (!bound) {
      bound = true;
      addEventListener('resize', schedule);
      addEventListener('scroll', schedule, { capture: true, passive: true });
    }
  }
  function visible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  /** The element a step points at, or null when it has no target, the selector is bad, or the check fails. */
  function find(step) {
    if (!step || !step.target) return null;
    let el = null;
    try { el = document.querySelector(step.target); } catch (e) { return null; }
    if (!el) return null;
    const check = T.logic.checkFor(step);
    if (check === 'visible' && !visible(el)) return null;
    return el;
  }
  function place() {
    raf = 0;
    if (!tip || !tip.isConnected || !current) return;
    const el = current;
    if (!el.isConnected) { hide(); return; }
    const r = el.getBoundingClientRect();
    hole.style.left = (r.left - PAD) + 'px'; hole.style.top = (r.top - PAD) + 'px';
    hole.style.width = (r.width + PAD * 2) + 'px'; hole.style.height = (r.height + PAD * 2) + 'px';
    const vw = innerWidth, vh = innerHeight;
    const tw = Math.min(TIP_MAX, vw - EDGE * 2);
    tip.style.width = tw + 'px';
    const th = tip.offsetHeight || 96;
    const below = r.bottom + GAP;
    const above = r.top - GAP - th;
    let top = below + th <= vh - EDGE || above < EDGE ? below : above;
    const pr = T.panel && T.panel.rect ? T.panel.rect() : null;
    if (pr && top < pr.bottom && top + th > pr.top) {
      const alt = top === below ? above : below;
      if (alt >= EDGE && alt + th <= vh - EDGE) top = alt;
    }
    const left = Math.max(EDGE, Math.min(vw - tw - EDGE, r.left + r.width / 2 - tw / 2));
    tip.style.left = left + 'px'; tip.style.top = Math.max(EDGE, Math.min(vh - th - EDGE, top)) + 'px';
  }
  function schedule() { if (current && !raf) raf = requestAnimationFrame(place); }

  let current = null;
  /** Show a step: returns true when its target was found and spotlit, false when the step has no spotlight. */
  function show(step, title, text) {
    ensure();
    current = find(step);
    dim.hidden = !!current;
    if (!current) { hole.hidden = true; tip.hidden = true; return false; }
    if (step.action === 'focus' && current.focus) { try { current.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }
    if (step.action !== 'none') current.scrollIntoView({ block: 'center', inline: 'nearest' });
    words(title, text);
    hole.hidden = false; tip.hidden = false;
    place();
    return true;
  }
  function words(title, text) {
    const h = document.createElement('b'); h.textContent = title;
    const p = document.createElement('span'); p.textContent = text;
    tip.replaceChildren(h, p);
  }
  /** New words for the shown tip (a language change): nothing scrolls or moves focus. */
  function retext(title, text) {
    if (!current || !tip) return;
    words(title, text);
    place();
  }
  /** Hide every layer. The page is not touched. */
  function hide() {
    current = null;
    if (dim) { dim.hidden = true; hole.hidden = true; tip.hidden = true; }
  }
  T.spot = { show, retext, hide, refresh: schedule, find, visible, get target() { return current; } };
})();
