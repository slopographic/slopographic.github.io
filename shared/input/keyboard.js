/* SlopKeyboard: what is being typed stays above the on-screen keyboard, in every app (iOS Safari, Chrome on Android).
 * Loaded on every app page by the shell with the touch layer (shared/input/HANDOFF.md).
 *
 *   SlopKeyboard.height()              the keyboard's height in CSS px, 0 when it is down. Also --slop-kb on <html>, the
 *                                      class slop-kb-open while it is up, and a 'slopkeyboard' event on window ({ height })
 *   SlopKeyboard.visible()             { top, bottom }: the band of the window the keyboard leaves visible (client px)
 *   SlopKeyboard.track(el, opts)       an app's own editor: el is the editable or a box that holds it. opts:
 *     rect()                           what must show (client px; default: the caret in a contenteditable, else the box)
 *     reveal(need)                     the app pans its view so that rect moves up by need.dy (need: { dy, rect, top,
 *                                      bottom, height }); return false to leave it to the default
 *     scroller, pad                    the element to scroll (default: the nearest scrolling ancestor); pad: true lets it
 *                                      grow a spacer at its end while the keyboard is up, so the last line can scroll up
 *                                      → { untrack() }. Before this script is there (the shell loads it after the app's
 *                                      own), an app sets the options as el.slopKeyboard, and data-slop-kb-pad on a scroller
 *   SlopKeyboard.reveal()              brings the focused editor into view now (an app whose caret moves on its own)
 *
 * The default, for any input, textarea or contenteditable: the nearest scrolling ancestor scrolls, and what is still
 * under the keyboard lifts (a CSS translate on the editor, undone when the keyboard goes down). The keyboard's height comes
 * from the VirtualKeyboard API where there is one (it then overlays the page: env(keyboard-inset-height)), else from the
 * visual viewport (iOS: the layout viewport stays, the visual one shrinks; its accessory bar counts as keyboard).
 * [data-slop-kb="hide"] hides while the keyboard is up (bottom bars it would cover); shared sheets rise above it
 * (shared/ui/sheet.js). On iOS the page's viewport gets maximum-scale=1: Safari then no longer zooms into a field whose
 * text is under 16 px (the in-canvas editors take the document's size), and a pinch still zooms (iOS ignores it there).
 * Tests: tests/shared/keyboard.test.html, tests/pdf/keyboard.test.html. */
(function (g) {
  'use strict';
  if (g.SlopKeyboard || !g.document) return;
  const doc = g.document, root = doc.documentElement, nav = g.navigator || {};
  const MARGIN = 16, MIN = 80;   // a smaller drop of the visual viewport is the browser's own bars, not a keyboard
  const tracks = new Map();
  let vv = g.visualViewport || null, vk = null, kb = 0, lift = null, spacer = null, raf = 0;
  const IOS = /iP(hone|ad|od)/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);

  const style = doc.createElement('style');
  style.id = 'slop-kb-style';
  style.textContent = ':root{--slop-kb:0px}html.slop-kb-open [data-slop-kb="hide"]{visibility:hidden!important}' +
    '.slop-kb-spacer{display:block;flex:none;inline-size:1px;pointer-events:none;visibility:hidden}';
  (doc.head || root).appendChild(style);

  const TEXT = /^(INPUT|TEXTAREA)$/, NOT_TEXT = /^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/;
  const editable = (t) => !!t && t.nodeType === 1 && ((TEXT.test(t.tagName) && !NOT_TEXT.test(t.type || '') && !t.readOnly) || t.isContentEditable);
  const layoutH = () => root.clientHeight || g.innerHeight || 0;

  /** The focused editor: { el, o } (o: its track options), or null. */
  function target() {
    const a = doc.activeElement;
    if (!editable(a)) return null;
    for (let n = a; n && n.nodeType === 1; n = n.parentElement) {
      const o = tracks.get(n) || n.slopKeyboard;   // track(), or the property an app sets before this script is there
      if (o) return { el: a, o };
    }
    return { el: a, o: {} };
  }
  function measure() {
    if (!target()) return 0;
    let h = 0;
    if (vk) h = vk.boundingRect ? vk.boundingRect.height : 0;
    else if (vv && !(vv.scale > 1.01)) h = layoutH() - vv.height - vv.offsetTop;   // not while the person has zoomed in
    return h >= MIN ? Math.round(h) : 0;
  }
  function visible() {
    if (vk || !vv) return { top: 0, bottom: layoutH() - kb };
    return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
  }
  function update() {
    const h = measure();
    if (h === kb) return;
    kb = h;
    root.style.setProperty('--slop-kb', kb + 'px');
    root.classList.toggle('slop-kb-open', kb > 0);
    // iOS scrolls the whole page to a field inside a fixed box, and may leave it there when the keyboard goes down (the
    // header then sat under the status bar, a grey band under the bottom bar): a one-screen app page stays where it is
    if (IOS && doc.scrollingElement && doc.scrollingElement.scrollHeight <= layoutH() + 1 && g.scrollY) g.scrollTo(0, 0);
    try { g.dispatchEvent(new g.CustomEvent('slopkeyboard', { detail: { height: kb } })); } catch (e) { /* old engines */ }
    if (kb) reveal(); else restore();
  }

  /** The caret's box in a contenteditable, when it is inside el. */
  function caret(el) {
    const s = g.getSelection && g.getSelection();
    if (!s || !s.rangeCount || !el.contains(s.focusNode)) return null;
    const rg = s.getRangeAt(0).cloneRange();
    rg.collapse(false);
    const rs = rg.getClientRects(), r = rs.length ? rs[rs.length - 1] : rg.getBoundingClientRect();
    if (r && (r.width || r.height)) return r;
    // a caret at an element's edge has no box of its own: the line (the element) it is next to
    let n = s.focusNode;
    if (n.nodeType === 1 && n.childNodes.length) n = n.childNodes[Math.max(0, Math.min(s.focusOffset, n.childNodes.length) - 1)];
    if (n.nodeType !== 1) n = n.parentElement;
    return n && n !== el && el.contains(n) ? n.getBoundingClientRect() : null;
  }
  function rectOf(t, band) {
    if (t.o.rect) return t.o.rect();
    const box = t.el.getBoundingClientRect();
    if (box.height <= band.bottom - band.top - 2 * MARGIN) return box;
    return (t.el.isContentEditable && caret(t.el)) || { top: box.top, bottom: box.top + 2 * MARGIN };   // too tall: its caret, or its top
  }
  const scrolls = (n) => { const y = g.getComputedStyle(n).overflowY; return (y === 'auto' || y === 'scroll' || y === 'overlay'); };
  function scrollerOf(t) {
    if (t.o.scroller) return t.o.scroller;
    for (let n = t.el.parentElement; n && n !== doc.body && n !== root; n = n.parentElement) if (scrolls(n) && (n.scrollHeight > n.clientHeight || n.hasAttribute('data-slop-kb-pad'))) return n;
    return null;
  }
  /** Moves the editor up by dy: its scroller first, then a lift of what is left. */
  function moveUp(t, dy) {
    const sc = scrollerOf(t);
    if (sc && dy > 0 && (t.o.pad || sc.hasAttribute('data-slop-kb-pad')) && !spacer) {
      spacer = doc.createElement('div'); spacer.className = 'slop-kb-spacer'; spacer.setAttribute('aria-hidden', 'true');
      spacer.style.blockSize = kb + 'px';
      sc.appendChild(spacer);
    }
    if (sc) { const before = sc.scrollTop; sc.scrollTop = before + dy; dy -= sc.scrollTop - before; }
    if (Math.abs(dy) < 1) return;
    if (lift && lift.el !== t.el) restore(true);
    if (!lift) { if (dy < 0) return; lift = { el: t.el, by: 0, was: t.el.style.translate || '' }; }
    lift.by = Math.max(0, lift.by + dy);
    t.el.style.translate = lift.by ? '0 ' + -lift.by + 'px' : lift.was;
  }
  function reveal() {
    raf = 0;
    const t = kb && target();
    if (!t) return;
    const band = visible(), r = rectOf(t, band);
    let dy = 0;
    if (r.bottom > band.bottom - MARGIN) dy = r.bottom - (band.bottom - MARGIN);
    if (r.top - dy < band.top + MARGIN) dy = r.top - (band.top + MARGIN);
    if (Math.abs(dy) < 1) return;
    if (t.o.reveal && t.o.reveal({ dy, rect: r, top: band.top, bottom: band.bottom, height: kb }) !== false) return;
    moveUp(t, dy);
  }
  const later = () => { if (!raf) raf = (g.requestAnimationFrame || g.setTimeout)(reveal); };
  /** Undoes the lift and the spacer (the keyboard went down, or the focus left the editor). */
  function restore(liftOnly) {
    if (lift) { lift.el.style.translate = lift.was; lift = null; }
    if (!liftOnly && spacer) { spacer.remove(); spacer = null; }
  }

  function listen(v) {
    if (vv) { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); }
    vv = v;
    if (vv) { vv.addEventListener('resize', update); vv.addEventListener('scroll', update); }
  }
  listen(vv);
  if (nav.virtualKeyboard && 'overlaysContent' in nav.virtualKeyboard) {
    try { nav.virtualKeyboard.overlaysContent = true; vk = nav.virtualKeyboard; vk.addEventListener('geometrychange', update); } catch (e) { vk = null; }
  }
  doc.addEventListener('focusin', (e) => {
    if (!editable(e.target)) return;
    if (lift && lift.el !== e.target) restore(true);
    update(); later();
    g.setTimeout(() => { update(); later(); }, 350);   // after the keyboard's slide (some engines send no resize)
  }, true);
  doc.addEventListener('focusout', () => g.setTimeout(() => { if (!target()) { restore(); update(); } }, 0), true);
  doc.addEventListener('input', () => { if (kb) later(); }, true);
  doc.addEventListener('selectionchange', () => { if (kb) later(); });
  g.addEventListener('orientationchange', () => g.setTimeout(() => { update(); later(); }, 300));
  g.addEventListener('resize', () => { update(); if (kb) later(); });

  if (IOS) {
    const m = doc.querySelector('meta[name="viewport"]');
    if (m && !/maximum-scale/.test(m.content)) m.content += ', maximum-scale=1';
  }

  g.SlopKeyboard = {
    height: () => kb,
    visible,
    reveal: () => { update(); reveal(); },
    track(el, o) { tracks.set(el, o || {}); return { untrack: () => tracks.delete(el) }; },
    /** Tests: a stand-in visual viewport (an EventTarget with width, height, offsetTop, scale), with no VirtualKeyboard. */
    _viewport(v) { if (vk) vk.removeEventListener('geometrychange', update); vk = null; listen(v); update(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
