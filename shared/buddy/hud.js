// The Sloppo HUD. Collapsed, it is one small round toggle beside him showing his level. Opened
// (click, or the H key), it is a compact card beside him (a bottom sheet on phones) with the XP and
// rage bars, the everyday actions, the hat and RAGE buttons, and a "Give…" section that opens only
// when pressed. Escape, a click outside or the grip closes it. Idle for a while, the toggle fades.
import { M, listeners, changed, clamp } from './state.js';
import { CFG } from './config.js';
import { xpFor, hatLabel } from './store.js';
import { count } from './journal.js';
import { cycleHat } from './levels.js';
import { rageLevel } from './rage.js';
import { size } from './look.js';
import { tr } from './lines.js';
import '../input/typing.js';   // window.SlopTyping: the H key is never taken from a field

const IDLE_MS = 6000, TOG = 40, GAP = 8;
const PHONE = matchMedia('(max-width: 600px)');
let hud = null, tog = null, panel = null, lv = null;
let idleT = 0, hovered = false, focused = false, wasOpen = false, lastX = NaN, lastY = NaN, lastSheet = false;

export function mountHud({ onUnleash, onRestore, on3d, onAsk }) {
  hud = document.createElement('div');
  hud.className = 'sloppo-hud';
  hud.style.zIndex = CFG.z + 1;
  hud.hidden = true;
  hud.setAttribute('role', 'group');
  hud.innerHTML =
    '<button type="button" class="sh-toggle" aria-expanded="false" aria-controls="sloppo-hud-panel"><span class="sh-lv"><span class="sh-lv-w"></span> <b>1</b></span></button>' +
    '<div class="sh-panel" id="sloppo-hud-panel" hidden>' +
    '<button type="button" class="sh-grip"></button>' +
    '<div class="sh-meters">' +
    '<span class="sh-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></span>' +
    '<span class="sh-rage" hidden><i></i></span></div>' +
    '<div class="sh-row">' +
    '<button type="button" class="sh-btn sh-ask"></button>' +
    '<button type="button" class="sh-btn sh-3d" aria-pressed="false">3D</button>' +
    '<button type="button" class="sh-btn sh-restore" hidden></button></div>' +
    '<div class="sh-row">' +
    '<button type="button" class="sh-btn sh-hat" hidden><span class="sh-hat-n"></span><span class="sh-hat-s"></span></button>' +
    '<button type="button" class="sh-btn sh-unleash" aria-pressed="false"></button></div>' +
    '</div>';
  tog = hud.querySelector('.sh-toggle');
  panel = hud.querySelector('.sh-panel');
  lv = hud.querySelector('.sh-lv b');
  const $ = (s) => hud.querySelector(s);
  const bar = $('.sh-bar'), fill = $('.sh-bar i'), hat = $('.sh-hat'), unleash = $('.sh-unleash'), restore = $('.sh-restore');
  const rage = $('.sh-rage'), three = $('.sh-3d');
  tog.addEventListener('click', () => setOpen(!M.hudOpen));
  $('.sh-grip').addEventListener('click', () => setOpen(false));
  hat.addEventListener('click', cycleHat);
  unleash.addEventListener('click', onUnleash);
  restore.addEventListener('click', onRestore);
  three.addEventListener('click', on3d);
  $('.sh-ask').addEventListener('click', onAsk);

  // Idle fade: the collapsed toggle dims after a few quiet seconds; hover, focus or touch bring it back.
  hud.addEventListener('pointerenter', () => { hovered = true; wake(); });
  hud.addEventListener('pointerleave', () => { hovered = false; restartIdle(); });
  hud.addEventListener('pointerdown', wake);
  hud.addEventListener('focusin', () => { focused = true; wake(); });
  hud.addEventListener('focusout', (e) => { if (!hud.contains(e.relatedTarget)) { focused = false; restartIdle(); } });
  document.addEventListener('pointermove', activity, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    activity();
    if (M.hudOpen && !hud.contains(e.target)) setOpen(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    activity();
    if (e.key === 'Escape' && M.hudOpen) {
      const inside = panel.contains(document.activeElement);
      setOpen(false);
      if (inside) tog.focus();
    } else if ((e.key === 'h' || e.key === 'H') && !e.altKey && !e.ctrlKey && !e.metaKey && !typing(e.target) && M.visible) {
      setOpen(true);
    }
  });

  /** The words that do not change with his state: drawn on mount and again on a language switch. */
  function words() {
    hud.setAttribute('aria-label', tr('ui.buddy.hud_aria'));
    hud.title = tr('ui.buddy.hud_tip');
    $('.sh-lv-w').textContent = tr('ui.buddy.lv');
    const grip = $('.sh-grip');
    grip.setAttribute('aria-label', tr('ui.buddy.close_panel'));
    grip.title = tr('menu.close');
    bar.setAttribute('aria-label', tr('ui.buddy.xp_aria'));
    rage.title = tr('ui.buddy.rage');
    const ask = $('.sh-ask');
    ask.title = tr('ui.buddy.ask_sloppo');
    ask.textContent = tr('ui.buddy.ask');
    three.setAttribute('aria-label', tr('ui.buddy.three_d'));
    restore.textContent = tr('ui.buddy.restore');
    $('.sh-hat-s').textContent = tr('ui.buddy.hat_btn');
  }
  function render() {
    const angry = M.rage >= 1 || !!M.raging;
    hud.hidden = !M.visible;
    hud.classList.toggle('is-angry', angry);
    hud.classList.toggle('is-open', !!M.hudOpen);
    panel.hidden = !M.hudOpen;
    tog.setAttribute('aria-expanded', String(!!M.hudOpen));
    tog.title = tr(M.hudOpen ? 'ui.buddy.tog_close' : 'ui.buddy.tog_open', { n: M.level });
    const lo = xpFor(M.level), hi = xpFor(M.level + 1);
    const pct = Math.round(((M.xp - lo) / (hi - lo)) * 100);
    lv.textContent = M.level;
    fill.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', pct);
    bar.title = tr('ui.buddy.xp_tip', { xp: M.xp - lo, need: hi - lo, n: M.level + 1 });
    hat.hidden = M.level < 2;
    $('.sh-hat-n').textContent = hatLabel(M.hat);
    hat.setAttribute('aria-label', tr('ui.buddy.change_hat', { hat: hatLabel(M.hat) }));
    const rl = rageLevel();
    rage.hidden = rl <= 0.01;
    rage.firstChild.style.width = Math.round(rl * 100) + '%';
    rage.classList.toggle('full', !!M.raging);
    rage.setAttribute('aria-label', M.raging ? tr('ui.buddy.rage_full') : tr('ui.buddy.rage_pct', { pct: Math.round(rl * 100) }));
    three.setAttribute('aria-pressed', String(M.is3d));
    unleash.textContent = tr(M.raging ? 'ui.buddy.rage_full' : M.chaos ? 'ui.buddy.calm_down' : 'ui.buddy.unleash');
    unleash.setAttribute('aria-pressed', String(M.chaos));
    const n = count();
    restore.hidden = n === 0;
    restore.setAttribute('aria-label', tr('ui.buddy.restore_n', { n }));
    if (M.hudOpen) { clearTimeout(idleT); hud.classList.remove('is-faded'); }
    else if (wasOpen) restartIdle();
    wasOpen = !!M.hudOpen;
  }
  listeners.add(render);
  words();
  render();
  if (globalThis.SlopI18n && globalThis.SlopI18n.on) globalThis.SlopI18n.on(() => { words(); render(); });
  document.body.append(hud);
  restartIdle();
  return hud;
}

/** Open or close the card (M.hudOpen; every listener follows). */
export function setOpen(v) { M.hudOpen = !!v; changed(); }

function typing(t) { return !!globalThis.SlopTyping && globalThis.SlopTyping.isTyping(t, { controls: true }); }   // shared/input/typing.js
function restartIdle() { clearTimeout(idleT); idleT = setTimeout(fade, IDLE_MS); }
function fade() { if (!hovered && !focused && !M.hudOpen) hud.classList.add('is-faded'); }
function wake() { hud.classList.remove('is-faded'); restartIdle(); }
function activity() { if (hud && !hud.classList.contains('is-faded')) restartIdle(); }

/** Each frame: keep the toggle beside Sloppo's head, and the card beside the toggle (or a sheet on phones). */
export function placeHud() {
  if (!hud || hud.hidden) return;
  const s = size();
  const away = M.y < scrollY || M.y - s * 1.2 > scrollY + innerHeight;
  const cx = clamp(M.x - scrollX + s * 0.62 + 6, 4, innerWidth - TOG - 4);
  const cy = clamp(M.y - scrollY - s * 0.9, 4, innerHeight - TOG - 4);
  // Moved with a transform, which the page's layout-shift score (CLS) does not count: left and top made every frame of
  // his fall a shift. Only the phone's open sheet needs left and top (a transform would pin its fixed card to the HUD).
  const sheet = !!M.hudOpen && PHONE.matches;
  if (cx !== lastX || cy !== lastY || sheet !== lastSheet) {
    lastX = cx; lastY = cy; lastSheet = sheet;
    hud.style.transform = sheet ? '' : `translate(${cx}px, ${cy}px)`;
    hud.style.left = sheet ? cx + 'px' : '';
    hud.style.top = sheet ? cy + 'px' : '';
  }
  hud.classList.toggle('is-away', away);
  if (M.hudOpen && !PHONE.matches) {
    const flip = cx + TOG + GAP + panel.offsetWidth > innerWidth - 8;
    panel.classList.toggle('flip', flip);
    const top = clamp(cy - 6, 8, innerHeight - panel.offsetHeight - 8);
    panel.style.top = top - cy + 'px';
  }
}
