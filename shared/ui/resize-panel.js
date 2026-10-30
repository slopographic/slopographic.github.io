/* SlopResizePanel: every side panel of the suite is resized the same way, and keeps its size. One drag handle on the
 * panel's inner edge (pointer and touch, col-resize cursor), min and max widths, a double-click on the handle puts the
 * default back, and the handle is a focusable separator (role=separator, aria-valuenow): Left/Right move it (Shift: bigger
 * steps), Home and End go to the limits. Phones (the `phone` media query) do not resize: the panel is a sheet there and
 * the width the app's CSS gives it applies.
 * Sizes are kept in the site's one settings store (shared/profile/profile.js, SlopProfile.panelSize), keyed by app and
 * panel, and are applied when attach() runs: an app that attaches before its first paint shows the kept size at once.
 * "Reset panel sizes" (SlopCmd 'view.resetPanels', for the View menu) puts every panel of the page back.
 *
 *   const r = SlopResizePanel.attach(panelEl, {
 *     app: 'photoslop', id: 'panels',          // the key in the store (app defaults to the page's SlopHub/SlopShell app)
 *     edge: 'start',                           // the side of the panel the handle sits on: 'start' (a right-hand panel,
 *                                              //   the default) or 'end' (a left-hand panel or list)
 *     width: 300, min: 220, max: 560,          // px
 *     phone: '(max-width: 900px)',             // no resizing when this matches
 *     handle: el,                              // optional: the app's own handle element (SlopFrame's grip); else one is made,
 *                                              //   placed over the panel's edge in the panel's parent (so a panel that
 *                                              //   scrolls does not scroll it away), or inside the panel with inside: true
 *                                              //   (a fixed panel such as Slop AI's)
 *     apply: (px) => {},                       // optional: how the width is applied; default: a CSS variable `cssVar` on
 *     cssVar: '--x-w', target: el,             //   `target` (default the panel) and, without cssVar, the panel's width
 *     label: 'Panels',                         // names the handle ("Resize the panels panel"); an i18n key or a
 *                                              //   function is read again on a language change (SlopI18n.label)
 *     onChange: (px) => {},
 *   });
 *   r.width() r.setWidth(px) r.reset() r.destroy() r.handle
 *   SlopResizePanel.resetAll()                  every panel attached on this page, back to its default
 * Classic script, no dependencies (SlopProfile and SlopCmd are used when they are on the page). Styles injected once.
 * Tests: tests/shared/resize-panel.test.html. */
(function (g) {
  'use strict';
  if (g.SlopResizePanel) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  /** label: an i18n key (translated, and again on a language change), a function, or plain text (SlopI18n.label). */
  const lab = (v) => { const I = g.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };
  const doc = g.document, all = new Set();
  const CSS = `
.srp-grip { position: absolute; inset-block: 0; inline-size: 8px; z-index: 5; cursor: col-resize; touch-action: none; }
.srp-grip.srp-start { inset-inline-start: -4px; } .srp-grip.srp-end { inset-inline-end: -4px; }
.srp-grip::after { content: ""; position: absolute; inset-block: 0; inset-inline-start: 3px; width: 1px; background: transparent; transition: background .15s; }
.srp-grip:hover::after, .srp-grip:focus-visible::after, .srp-dragging .srp-grip::after { width: 2px; background: var(--sl-accent, Highlight); }
.srp-grip:focus-visible { outline: none; }
.srp-grip[hidden] { display: none; }
.srp-dragging, .srp-dragging * { cursor: col-resize !important; user-select: none; }
.srp-dragging iframe { pointer-events: none; }`;
  function style() {
    if (doc.getElementById('srp-style')) return;
    const s = doc.createElement('style'); s.id = 'srp-style'; s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }
  const appId = () => (g.SlopShell && g.SlopShell.currentApp && g.SlopShell.currentApp.id) || (doc.documentElement.dataset.app) || location.pathname.split('/').filter(Boolean)[0] || 'site';
  const store = {
    get: (app, id) => (g.SlopProfile && g.SlopProfile.panelSize ? g.SlopProfile.panelSize(app, id) : null),
    set: (app, id, px) => { if (g.SlopProfile && g.SlopProfile.setPanelSize) g.SlopProfile.setPanelSize(app, id, px); },
    clear: (app, id) => { if (g.SlopProfile && g.SlopProfile.setPanelSize) g.SlopProfile.setPanelSize(app, id, null); },
  };

  function attach(panel, o) {
    o = o || {};
    style();
    const app = o.app || appId(), id = o.id || panel.id || 'panel', edge = o.edge === 'end' ? 'end' : 'start';
    const min = o.min || 200, max = o.max || 640, def = o.width || 300, win = panel.ownerDocument.defaultView;
    const mq = win.matchMedia(o.phone || '(max-width: 900px)');
    const rtl = () => win.getComputedStyle(panel).direction === 'rtl';
    const clamp = (w) => Math.round(Math.max(min, Math.min(max, Number(w) || def)));
    const saved = store.get(app, id);
    let width = clamp(saved || def);

    let grip = o.handle || null, ro = null;
    const own = !grip, outside = own && !o.inside, host = outside ? panel.parentElement : panel;
    if (own) {
      grip = doc.createElement('div');
      grip.className = 'srp-grip srp-' + edge + (outside ? ' srp-out' : '');
      if (win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      if (outside) host.append(grip); else panel.prepend(grip);
    }
    /** An outside handle follows the panel's edge (its place in the parent changes as widths change). */
    function place() {
      if (!outside) return;
      const pr = host.getBoundingClientRect(), r = panel.getBoundingClientRect(), x = (edge === 'start') !== rtl() ? r.left : r.right;
      grip.hidden = mq.matches || !r.width;
      grip.style.inset = 'auto';
      Object.assign(grip.style, { left: (x - pr.left + host.scrollLeft - 4) + 'px', top: (r.top - pr.top + host.scrollTop) + 'px', height: r.height + 'px' });
    }
    if (outside && g.ResizeObserver) { ro = new g.ResizeObserver(place); ro.observe(panel); ro.observe(host); }
    grip.tabIndex = 0;
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    const words = () => {   // again after a language change (shared/i18n)
      grip.setAttribute('aria-label', tr('ui.frame.resize_aria', 'Resize the {label} panel (arrow keys; double-click resets)', { label: lab(o.label || id).toLowerCase() }));
      grip.title = tr('ui.frame.resize_tip', 'Drag to resize. Double-click: the default width.');
    };
    words();
    grip.setAttribute('aria-valuemin', String(min));
    grip.setAttribute('aria-valuemax', String(max));

    function apply() {
      grip.setAttribute('aria-valuenow', String(width));
      const phone = mq.matches;
      if (own) grip.hidden = phone;
      place();
      if (o.apply) o.apply(phone ? null : width);
      else if (o.cssVar) { const t = o.target || panel; if (phone) t.style.removeProperty(o.cssVar); else t.style.setProperty(o.cssVar, width + 'px'); }
      else { panel.style.width = phone ? '' : width + 'px'; panel.style.flexBasis = phone ? '' : width + 'px'; }
      if (o.onChange) o.onChange(width);
    }
    function setWidth(w, keep = true) { width = clamp(w); apply(); if (keep) store.set(app, id, width); }
    function reset() { width = clamp(def); store.clear(app, id); apply(); }

    // The panel is as wide as from the pointer to its far edge: a right-hand panel (handle at its start) grows to the left.
    const growsLeft = () => (edge === 'start') !== rtl();
    let drag = null;
    const down = (e) => {
      if (mq.matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      drag = { id: e.pointerId, x: e.clientX, w: width };
      try { grip.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic event */ }
      doc.documentElement.classList.add('srp-dragging');
    };
    const move = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      setWidth(drag.w + (growsLeft() ? -dx : dx), false);
    };
    const up = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null; doc.documentElement.classList.remove('srp-dragging');
      store.set(app, id, width);
    };
    const key = (e) => {
      if (mq.matches) return;
      const step = e.shiftKey ? 64 : 16, grow = growsLeft() ? 'ArrowLeft' : 'ArrowRight', shrink = growsLeft() ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === grow) setWidth(width + step);
      else if (e.key === shrink) setWidth(width - step);
      else if (e.key === 'Home') setWidth(min);
      else if (e.key === 'End') setWidth(max);
      else return;
      e.preventDefault();
    };
    const dbl = () => reset();
    grip.addEventListener('pointerdown', down);
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    grip.addEventListener('keydown', key);
    grip.addEventListener('dblclick', dbl);
    mq.addEventListener('change', apply);
    apply();

    const api = {
      handle: grip, width: () => width, setWidth, reset, isPhone: () => mq.matches, app, id, words,
      destroy() {
        all.delete(api); mq.removeEventListener('change', apply); if (ro) ro.disconnect();
        grip.removeEventListener('pointerdown', down); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up); grip.removeEventListener('keydown', key); grip.removeEventListener('dblclick', dbl);
        if (own) grip.remove();
      },
    };
    all.add(api);
    command();
    return api;
  }

  function resetAll() { for (const r of all) r.reset(); }
  let registered = false;
  function command(again) {
    if ((registered && !again) || !g.SlopCmd || !g.SlopCmd.register) return;
    registered = true;
    g.SlopCmd.register([{ id: 'view.resetPanels', title: tr('ui.frame.reset_sizes', 'Reset panel sizes'), group: 'View', keywords: ['panel', 'sidebar', 'width', 'size', 'default'], run: resetAll }]);
  }

  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { for (const r of all) r.words(); if (registered) command(true); });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => { if (all.size) command(); });
  g.SlopResizePanel = { attach, resetAll, panels: () => [...all] };
})(typeof window !== 'undefined' ? window : globalThis);
