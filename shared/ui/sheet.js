/* SlopSheet: on a phone, an app's side panel becomes a sheet that behaves the same in every app. Tapping the tool that is
 * already open closes it, it has a close × in its top corner, and Escape, a tap outside it or a swipe in the closing
 * direction closes it too. On a wider screen nothing changes: the panel stays where the app puts it.
 *
 *   const s = SlopSheet.attach({
 *     root: appEl,                     // gets openClass while the sheet is open, and 'ssh-phone' on a phone
 *     panel: panelEl,                  // the panel that is the sheet on a phone
 *     side: 'bottom',                  // where it comes from on a phone: 'bottom' (a bottom sheet, swipe down closes),
 *                                      //   'start' (a drawer from the left, swipe left) or 'end' (from the right, swipe right)
 *     phone: '(max-width: 900px)',     // when the panel is a sheet (a media query)
 *     openClass: 'sheet-open',         // the app's own class for an open sheet (its CSS slides the panel in); default
 *                                      //   'ssh-open', with the shared look below (class 'ssh-panel' on the panel)
 *     triggers: railEl,                // optional: the tool buttons; a tap opens the sheet, a tap on the active one closes it
 *     isActive: (btn) => btn.classList.contains('on'),   // which trigger is the open tool (default: aria-selected/pressed)
 *     toggles: [btnPanel],             // optional: buttons that open and close it (aria-expanded is kept)
 *     label: 'Tool panel',             // what the × closes ("Close tool panel"); an i18n key ('pdf.panel.tools') or a
 *                                      //   function is read again on a language change (SlopI18n.label)
 *     closeWide: () => {},             // optional: the × shows on a wide screen too, and calls this there (the app hides
 *                                      //   its panel its own way); without it the × is a phone-only thing
 *     onChange: (open, why) => {},     // why: 'trigger', 'toggle', 'close', 'outside', 'wide', 'api', 'destroy'
 *   });
 *   s.open(); s.close(); s.toggle(); s.isOpen(); s.isPhone(); s.destroy(); s.panel; s.side;   SlopSheet.list(): all of the page's
 *
 * The sheet is not modal: focus stays where it was when it opens, and goes back to the button that opened it when the ×
 * or Escape closes it. A tap outside closes the sheet and still reaches what was tapped. Several sheets can share a root
 * (a drawer and a details sheet): the open one is marked on its panel ('ssh-on').
 * The × stays the panel's first child when the app redraws the panel. Classic script, no dependencies; injects its
 * styles once (colours from --sl-* theme tokens). Tests: tests/shared/sheet.test.html.
 *
 * Every sheet on a phone, the app's own look or the shared one, is opaque: its background is --slop-sheet-bg (the theme's
 * surface), never translucent, faded or blurred, and the page behind it is dimmed (a shadow that takes no taps). Only one
 * sheet is open at a time on a page: opening one closes any other (why 'other'). While the on-screen keyboard is up
 * (shared/input/keyboard.js, the 'slopkeyboard' event) a bottom sheet rises above it and a drawer ends at its top.
 * Tests: tests/shared/keyboard.test.html, tests/shared/sheet-opaque.test.html, tests/pdf/keyboard.test.html. */
(function (g) {
  'use strict';
  if (g.SlopSheet) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  /** label: an i18n key (translated, and again on a language change), a function, or plain text (SlopI18n.label). */
  const lab = (v) => { const I = g.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };
  const CSS = `
:root { --slop-sheet-bg: var(--sl-surface, Canvas); --slop-sheet-dim: rgba(0, 0, 0, .4); }
.ssh-phone .ssh-sheet { background-color: var(--slop-sheet-bg) !important; opacity: 1 !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
.ssh-phone .ssh-sheet.ssh-on { box-shadow: 0 -12px 32px rgba(0, 0, 0, .3), 0 0 0 100vmax var(--slop-sheet-dim) !important; }
.ssh-x { display: none; }
.ssh-phone .ssh-x, .ssh-x.ssh-x-wide { display: inline-flex; position: sticky; inset-block-start: 0; float: inline-end; z-index: 3; align-items: center; justify-content: center;
  inline-size: 44px; block-size: 44px; margin-block-end: -44px; margin-inline: auto 2px; align-self: flex-end; flex: none; border: 0; border-radius: 12px; background: transparent;
  color: inherit; font: 400 26px/1 system-ui, sans-serif; cursor: pointer; }
.ssh-x.ssh-x-wide:not(.ssh-phone *) { inline-size: 32px; block-size: 32px; margin-block-end: -32px; font-size: 22px; }
.ssh-x:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.ssh-x:focus-visible { outline: 2px solid var(--sl-accent, Highlight); outline-offset: -4px; }
.ssh-phone .ssh-panel { position: fixed; inset-inline: 0; inset-block-end: var(--ssh-bottom, 0px); max-block-size: 70vh; overflow: auto; z-index: var(--ssh-z, 70);
  background: var(--sl-surface, Canvas); color: var(--sl-text, CanvasText); border-block-start: 1px solid var(--sl-border, GrayText);
  border-radius: 18px 18px 0 0; box-shadow: 0 -16px 40px rgba(0, 0, 0, .35); transform: translateY(calc(100% + 80px)); visibility: hidden;
  transition: transform .22s ease, visibility 0s .22s; }
.ssh-phone .ssh-panel.ssh-start, .ssh-phone .ssh-panel.ssh-end { inset-block: var(--ssh-top, 0px) 0; inline-size: min(320px, 86vw); max-block-size: none;
  border: 0; touch-action: pan-y; }
.ssh-phone .ssh-panel.ssh-start { inset-inline: 0 auto; border-radius: 0 18px 18px 0; transform: translateX(calc(-100% - 20px)); }
.ssh-phone .ssh-panel.ssh-end { inset-inline: auto 0; border-radius: 18px 0 0 18px; transform: translateX(calc(100% + 20px)); }
.ssh-phone .ssh-panel.ssh-start:dir(rtl) { transform: translateX(calc(100% + 20px)); }
.ssh-phone .ssh-panel.ssh-end:dir(rtl) { transform: translateX(calc(-100% - 20px)); }
/* a drawer's × has a row of its own at the top (drawers start with a list that would run under it) */
.ssh-phone .ssh-panel.ssh-start > .ssh-x, .ssh-phone .ssh-panel.ssh-end > .ssh-x { display: flex; float: none; margin-block-end: 0; background: inherit; }
.ssh-phone .ssh-panel:not(.ssh-on) { box-shadow: none; }
.ssh-phone .ssh-panel.ssh-on { transform: none; visibility: visible; transition: transform .22s ease; }
@media (prefers-reduced-motion: reduce) { .ssh-phone .ssh-panel, .ssh-phone .ssh-panel.ssh-on { transition: none; } }`;

  function style(doc) {
    if (doc.getElementById('ssh-style')) return;
    const s = doc.createElement('style'); s.id = 'ssh-style'; s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }
  const activeDefault = (b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-pressed') === 'true' || b.classList.contains('on');
  // While one of these is open, Escape and taps belong to it, not to the sheet under it. ('.smb-menu' alone is also the
  // menubar's always-present wrapper (shared/menubar): only an open menu button's list, or an open menubar popup, counts.)
  const OVER_KEY = '.sui-back, .sui-menu, .smb-menu[role="menu"], .smb-pop:not([hidden]), dialog[open]';
  const OVER_TAP = '.sui-back, .sui-menu, .smb-menu[role="menu"], [role="dialog"], [role="menu"]';
  const RTL = (el) => { try { return el.matches(':dir(rtl)'); } catch (e) { return false; } };
  const live = new Set();   // the attached sheets of this page: one open at a time

  /** Keeps an open sheet clear of the on-screen keyboard (kb: its height in CSS px, 0 when it is down). */
  function clearKeyboard(panel, side, kb, win) {
    const st = panel.style;
    st.removeProperty('translate'); st.removeProperty('max-block-size'); st.removeProperty('inset-block-end');
    if (!kb || !panel.classList.contains('ssh-on')) return;
    if (side !== 'bottom') { st.setProperty('inset-block-end', kb + 'px'); return; }
    // the sheet's resting place (not its box: it may still be sliding in), then up by what the keyboard covers of it
    const cs = win.getComputedStyle(panel), gap = parseFloat(cs.bottom) || 0, max = parseFloat(cs.maxHeight);
    const lift = Math.max(0, kb - gap), room = win.document.documentElement.clientHeight - Math.max(kb, gap) - 48;
    if (lift) st.setProperty('translate', '0 ' + -lift + 'px');
    st.setProperty('max-block-size', Math.max(120, isNaN(max) ? room : Math.min(max, room)) + 'px');
  }

  function attach(o) {
    const root = o.root, panel = o.panel, doc = panel.ownerDocument, win = doc.defaultView;
    style(doc);
    const side = o.side === 'start' || o.side === 'end' ? o.side : 'bottom';
    const cls = o.openClass || 'ssh-open', isActive = o.isActive || activeDefault;
    if (!o.openClass) panel.classList.add('ssh-panel');
    panel.classList.add('ssh-sheet');
    if (side !== 'bottom') panel.classList.add('ssh-' + side);
    const mq = win.matchMedia(o.phone || '(max-width: 900px)');
    const toggles = o.toggles || [];
    let opener = null, wasActive = false;

    const x = doc.createElement('button');
    x.type = 'button'; x.className = 'ssh-x' + (o.closeWide ? ' ssh-x-wide' : ''); x.textContent = '×';
    const xWords = () => { x.title = o.label ? tr('ui.close_name', 'Close {name}', { name: lab(o.label).toLowerCase() }) : tr('menu.close', 'Close'); x.setAttribute('aria-label', x.title); };
    xWords();
    const offLang = g.SlopI18n && g.SlopI18n.on ? g.SlopI18n.on(xWords) : null;   // a language change (shared/i18n)
    // The × is the panel's first child; an app that redraws the panel's content gets it back at once.
    const ensureX = () => { if (x.parentNode !== panel || panel.firstChild !== x) panel.prepend(x); };
    ensureX();
    const mo = win.MutationObserver ? new win.MutationObserver(() => { if (x.parentNode !== panel) ensureX(); }) : null;
    if (mo) mo.observe(panel, { childList: true });

    const isOpen = () => panel.classList.contains('ssh-on');
    const me = { closeFor: () => { if (isOpen()) set(false, 'other'); } };
    live.add(me);
    const kbNow = () => (win.SlopKeyboard && win.SlopKeyboard.height ? win.SlopKeyboard.height() : 0);
    const onKb = () => clearKeyboard(panel, side, isOpen() && mq.matches ? kbNow() : 0, win);
    win.addEventListener('slopkeyboard', onKb);
    function set(open, why) {
      if (open && !mq.matches) return;   // a wide screen has no sheet
      if (open) ensureX();
      const was = isOpen();
      if (open && !was) for (const other of live) if (other !== me) other.closeFor();
      panel.classList.toggle('ssh-on', !!open);
      root.classList.toggle(cls, !!open);
      if (open) root.setAttribute('data-slop-escape', 'sheet'); else root.removeAttribute('data-slop-escape');   // app commands leave Escape to it (shared/commands)
      if (!o.openClass) root.classList.toggle('ssh-open', !!open);
      for (const t of toggles) t.setAttribute('aria-expanded', String(!!open));
      if (was !== !!open && o.onChange) { o.onChange(!!open, why); if (open) ensureX(); }   // the app may have redrawn the panel
      onKb();
    }
    const refocus = () => { if (opener && opener.isConnected) { try { opener.focus({ preventScroll: true }); } catch (e) { opener.focus(); } } };
    function close(back) {
      if (!isOpen()) return;
      set(false, 'close');
      if (back) refocus();
    }
    const phoneClass = () => { root.classList.toggle('ssh-phone', mq.matches); if (!mq.matches && isOpen()) set(false, 'wide'); };
    phoneClass();
    mq.addEventListener('change', phoneClass);

    // A tool button: note (before the app's own handler runs) whether it was the open one, then open or close after it.
    const onTriggerDown = (e) => { const b = e.target.closest && e.target.closest('button'); wasActive = !!(b && o.triggers.contains(b) && isActive(b) && isOpen()); };
    const onTrigger = (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b || !o.triggers.contains(b) || !mq.matches) return;
      opener = b;
      const close_ = wasActive; wasActive = false;
      win.setTimeout(() => { if (close_) set(false, 'trigger'); else set(true, 'trigger'); }, 0);
    };
    if (o.triggers) { o.triggers.addEventListener('pointerdown', onTriggerDown, true); o.triggers.addEventListener('keydown', onTriggerDown, true); o.triggers.addEventListener('click', onTrigger); }
    const onToggle = (e) => { if (!mq.matches) return; opener = e.currentTarget; set(!isOpen(), 'toggle'); };
    for (const t of toggles) t.addEventListener('click', onToggle);

    x.addEventListener('click', () => { if (mq.matches) close(true); else if (o.closeWide) { o.closeWide(); refocus(); } });
    // Escape closes the topmost thing only: the sheet listens on the window in the capture phase, before the command
    // palette's keymap (shared/commands, also capture) can take Escape for an app command such as Deselect, and keeps it.
    const onKey = (e) => {
      if (e.key !== 'Escape' || !isOpen() || !mq.matches || e.defaultPrevented || doc.querySelector(OVER_KEY)) return;
      e.preventDefault(); e.stopImmediatePropagation(); close(true);
    };
    win.addEventListener('keydown', onKey, true);
    // a tap outside the sheet, its tool buttons and its toggles closes it; the tap itself still happens
    const inside = (n) => panel.contains(n) || (o.triggers && o.triggers.contains(n)) || toggles.some((t) => t.contains(n));
    const onOutside = (e) => { if (isOpen() && mq.matches && !inside(e.target) && !(e.target.closest && e.target.closest(OVER_TAP))) set(false, 'outside'); };
    doc.addEventListener('pointerdown', onOutside, true);

    // a swipe in the closing direction closes it: down from the top 56 px of a bottom sheet, sideways anywhere on a drawer
    let drag = null;
    const dirX = side === 'bottom' ? 0 : (side === 'start') !== RTL(panel) ? -1 : 1;
    const onDown = (e) => {
      if (!isOpen() || !mq.matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable="true"], button:not(.ssh-x)')) return;
      if (!dirX && (e.clientY - panel.getBoundingClientRect().top > 56 || panel.scrollTop > 0)) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!dirX) { const dy = Math.max(0, e.clientY - drag.y); panel.style.transform = dy ? 'translateY(' + dy + 'px)' : ''; return; }
      const d = Math.max(0, (e.clientX - drag.x) * dirX);
      if (!d && Math.abs(e.clientY - drag.y) > 12) { drag = null; panel.style.transform = ''; return; }   // a scroll, not a swipe
      panel.style.transform = d ? 'translateX(' + d * dirX + 'px)' : '';
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = dirX ? (e.clientX - drag.x) * dirX : e.clientY - drag.y;
      drag = null; panel.style.transform = '';
      if (e.type === 'pointerup' && d > 80) close(false);
    };
    panel.addEventListener('pointerdown', onDown);
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onUp);

    return (me.api = {
      panel, side, open: () => set(true, 'api'), close: () => close(false), toggle: () => set(!isOpen(), 'api'), isOpen, isPhone: () => mq.matches,
      destroy() {
        set(false, 'destroy'); live.delete(me); win.removeEventListener('slopkeyboard', onKb); if (mo) mo.disconnect(); if (offLang) offLang(); x.remove(); mq.removeEventListener('change', phoneClass); root.classList.remove('ssh-phone');
        panel.classList.remove('ssh-panel', 'ssh-sheet', 'ssh-start', 'ssh-end');
        if (o.triggers) { o.triggers.removeEventListener('pointerdown', onTriggerDown, true); o.triggers.removeEventListener('keydown', onTriggerDown, true); o.triggers.removeEventListener('click', onTrigger); }
        for (const t of toggles) t.removeEventListener('click', onToggle);
        win.removeEventListener('keydown', onKey, true); doc.removeEventListener('pointerdown', onOutside, true);
        panel.removeEventListener('pointerdown', onDown); win.removeEventListener('pointermove', onMove);
        win.removeEventListener('pointerup', onUp); win.removeEventListener('pointercancel', onUp);
      },
    });
  }

  /** The sheets attached on this page (their attach() results). */
  g.SlopSheet = { attach, list: () => Array.from(live, (m) => m.api) };
})(typeof window !== 'undefined' ? window : globalThis);
