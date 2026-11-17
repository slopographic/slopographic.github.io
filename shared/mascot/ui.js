// The mascot slot's interaction layer: the mascot is a real button. A click, a tap or Enter / Space opens a small helper
// menu (shared/ui/menubutton.js); a long press (touch) opens it too; a drag moves it (remembered on this device, kept clear
// of the header and the safe areas; a short drag never opens the menu); a double click plays the celebration. The
// overlay may react through optional hooks on the instance its create() returns (a missing hook does nothing):
//   look(dx, dy)            the pointer's direction, each -1..1 ((0, 0): look ahead), while it moves nearby
//   react(kind, detail)     'hover' { on }, 'poke' (a tap or long press), 'drag' { dx, dy, shake 0..1 }, 'drop'
// Now and then an idle mascot glances aside (not with reduced motion). The logic is in interact.js.
// Tests: tests/node/mascot-interact.test.mjs (the logic), tests/buddy/slot.test.html (the slot on a page).
import { clampPos, defaultPos, otherSide, createPress, lookAt, menuItems, TIPS, nextGlance } from './interact.js';

const KEY = 'slop.mascot.pos';
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Number.isFinite(v.right) && Number.isFinite(v.bottom) ? v : null; } catch (e) { return null; } };
const write = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } };
/** Text in the chosen language (shared/i18n, keys mascot.*), English without it. */
const t = (key, en, vars) => { const I = window.SlopI18n, s = I && typeof I.t === 'function' ? I.t(key, vars) : key; return s === key ? en.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)) : s; };
const num = (v) => parseFloat(v) || 0;

/** The view the mascot lives in: the window, the sticky header's bottom edge and the safe areas (env() through CSS). */
export function view(dock) {
  const cs = getComputedStyle(dock), head = document.querySelector('body > header, .nav, .sh-hdr');
  const top = head ? Math.max(0, head.getBoundingClientRect().bottom) : 0;
  return { w: innerWidth, h: innerHeight, top, safe: { top: num(cs.getPropertyValue('--ms-safe-t')), right: num(cs.getPropertyValue('--ms-safe-r')), bottom: num(cs.getPropertyValue('--ms-safe-b')), left: num(cs.getPropertyValue('--ms-safe-l')) } };
}

/** Wires the dock (a <button>) for the mascot. o: { name, size: { w, h }, inst() (the overlay's instance or null),
 * moment(name), hide(), reduce(), settle()? (before a press or a move: a roaming mascot folds where it floats into its
 * place, roam.js) }. Returns { place(), pos(), moveTo(pos), dispose() }. */
export function attach(dock, o) {
  const hook = (fn, ...args) => { const i = o.inst(); if (i && typeof i[fn] === 'function') { try { i[fn](...args); } catch (e) { /* an overlay error never reaches the page */ } } };
  let pos = null;
  const size = () => ({ w: dock.offsetWidth || o.size.w, h: dock.offsetHeight || o.size.h });   // CSS may draw it smaller on a phone
  const set = (p) => { pos = clampPos(p, size(), view(dock)); dock.style.right = pos.right + 'px'; dock.style.bottom = pos.bottom + 'px'; };
  const foot = () => num(getComputedStyle(document.documentElement).getPropertyValue('--slop-foot-h'));
  const place = () => set(read() || defaultPos(size(), view(dock), 1, foot()));
  const settle = () => { if (typeof o.settle === 'function') o.settle(); };
  dock.type = 'button';
  dock.setAttribute('data-touch-surface', '');   // a finger drags it (touch-action: none in slot.js's styles)
  dock.setAttribute('aria-label', o.name);
  dock.title = o.name;
  place();

  /* ---------- the helper menu ---------- */
  let tip = 0, mb = null;
  const has = () => ({ ai: !!(window.SlopHeader && window.SlopHeader.openAI), finder: !!(document.querySelector('#app-finder .fd-input') || window.SlopSwitcher), tour: !!document.querySelector('.stour-btn') });
  const run = (v) => {
    if (v === 'ai') window.SlopHeader.openAI();
    else if (v === 'search') {
      const input = document.querySelector('#app-finder .fd-input');
      if (input) { input.scrollIntoView({ block: 'center', behavior: o.reduce() ? 'auto' : 'smooth' }); input.focus({ preventScroll: true }); } else if (window.SlopSwitcher) window.SlopSwitcher.open();
    } else if (v === 'tour') { const b = document.querySelector('.stour-btn'); if (b) b.click(); }
    else if (v === 'tips') { const [k, en] = TIPS[tip++ % TIPS.length]; say(t(k, en)); }
    else if (v === 'move') { settle(); const p = otherSide(pos, size(), view(dock)); write(p); set(p); }
    else if (v === 'hide') o.hide();
  };
  const menu = import('../ui/menubutton.js').then(() => {
    if (!window.SlopMenuButton) return;
    mb = window.SlopMenuButton.attach(dock, { label: t('mascot.menu', '{name} menu', { name: o.name }), search: false, items: () => menuItems(has(), t), onPick: run });
  }).catch(() => {});
  /** A short note beside the mascot (Tips), read out politely. */
  let bubble = null, bubbleT = 0;
  function say(text) {
    if (!bubble) { bubble = document.createElement('p'); bubble.className = 'ms-say'; bubble.setAttribute('role', 'status'); document.body.append(bubble); }
    bubble.textContent = text;
    const r = dock.getBoundingClientRect();
    Object.assign(bubble.style, { right: Math.max(8, innerWidth - r.right) + 'px', bottom: (innerHeight - r.top + 8) + 'px' });
    bubble.hidden = false;
    clearTimeout(bubbleT); bubbleT = setTimeout(() => { bubble.hidden = true; }, 6000);
  }

  /* ---------- press, drag, long press, double click ---------- */
  let press = null, start = null, longT = 0, skipClick = false;
  dock.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    settle();
    press = createPress(e.clientX, e.clientY, e.timeStamp);
    start = { pos, id: e.pointerId };
    clearTimeout(longT);
    longT = setTimeout(() => { if (press && press.isLong(performance.now())) { skipClick = true; hook('react', 'poke'); if (mb) mb.open(); press = null; } }, 600);
  });
  dock.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== start.id) return;
    const m = press.move(e.clientX, e.clientY, e.timeStamp);
    if (!m) return;
    if (!dock.hasPointerCapture(e.pointerId)) { try { dock.setPointerCapture(e.pointerId); } catch (err) { /* gone */ } dock.classList.add('is-dragging'); }
    clearTimeout(longT);
    set({ right: start.pos.right - m.ox, bottom: start.pos.bottom - m.oy });
    hook('react', 'drag', { dx: m.dx, dy: m.dy, shake: m.shake });
  });
  const end = (e) => {
    clearTimeout(longT);
    if (!press) return;
    const kind = press.up(e.timeStamp);
    press = null;
    dock.classList.remove('is-dragging');
    if (kind === 'drag') { write(pos); skipClick = true; hook('react', 'drop'); setTimeout(() => { skipClick = false; }, 0); }
    else hook('react', 'poke');
  };
  dock.addEventListener('pointerup', end);
  dock.addEventListener('pointercancel', end);
  // a drag or a long press is not a click: stop it before the menu button sees it
  dock.addEventListener('click', (e) => { if (skipClick) { skipClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  dock.addEventListener('dblclick', () => { if (mb) mb.close(); o.moment('done'); });

  /* ---------- hover, focus, eyes, the idle glance ---------- */
  dock.addEventListener('pointerenter', () => hook('react', 'hover', { on: true }));
  dock.addEventListener('pointerleave', () => hook('react', 'hover', { on: false }));
  dock.addEventListener('focus', () => hook('react', 'hover', { on: true }));
  dock.addEventListener('blur', () => hook('react', 'hover', { on: false }));
  let raf = 0, last = null;
  const onMove = (e) => {
    last = e;
    if (raf || dock.hidden) return;
    raf = requestAnimationFrame(() => { raf = 0; const r = dock.getBoundingClientRect(); hook('look', ...lookAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, { x: last.clientX, y: last.clientY })); });
  };
  addEventListener('pointermove', onMove, { passive: true });
  let glanceT = 0;
  const glance = () => {
    glanceT = setTimeout(() => {
      if (!dock.hidden && !o.reduce() && !press) { hook('look', Math.random() < 0.5 ? -0.8 : 0.8, -0.2); setTimeout(() => hook('look', 0, 0), 1200); }
      glance();
    }, nextGlance(Math.random()));
  };
  glance();
  const onResize = () => { if (pos) set(pos); };
  addEventListener('resize', onResize);

  return {
    place, menu,
    /** Where it sits ({ right, bottom }), and a new place (kept inside the view, not remembered). */
    pos: () => pos, moveTo: (p) => set(p),
    dispose() { clearTimeout(glanceT); clearTimeout(longT); clearTimeout(bubbleT); removeEventListener('pointermove', onMove); removeEventListener('resize', onResize); if (mb) mb.destroy(); if (bubble) bubble.remove(); },
  };
}
