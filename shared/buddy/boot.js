// The one line any page needs:  <script type="module" src="…/shared/buddy/boot.js"></script>
// Shows a small draggable Sloppo toggle (bottom corner) and the shortcut Alt+Shift+S. The buddy
// itself (engine.js and friends) is only loaded when he is switched on. Off by default inside apps;
// the homepage boots him on with boot({ app: 'home', defaultOn: true }). Choices are remembered per
// app and globally in localStorage "slop.buddy" (see prefs.js).
import { HOME, APP } from './config.js';
import { getPrefs, setPrefs, isOn, remember } from './prefs.js';

let booted = false, engine = null, on = false, cfg = null, btn = null;
// The brand profile turns the mascot off (brand/profiles/<id>.json "mascot", set at build time): then boot() does nothing.
const MASCOT = /*profile:mascot*/true;
// A profile with its own mascot ("mascot": { "overlay": ... }): the same toggle loads the mascot slot (shared/mascot/slot.js)
// with the overlay copied to brand/mascot/, in place of this buddy's engine.
const OVERLAY = /*profile:mascotOverlay*/false;
let NAME = 'Sloppo', named = false;
/** A word of the toggle in the chosen language (ui.buddy.*, shared/i18n/ui/<code>/buddy.js). */
const tr = (k, v) => { const I = window.SlopI18n; return I ? I.t(k, v) : k; };
const SHORTCUT = (e) => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyS' || e.key === 'S' || e.key === 's');

/** Which app is this? SlopHub's id, the html data-app attribute, or the registry path. */
export function detectApp() {
  const H = window.SlopHub;
  if (H && H.self && H.self.app) return H.self.app;
  if (document.documentElement.dataset.app) return document.documentElement.dataset.app;
  const path = location.pathname.replace(/index\.html$/, '');
  const apps = (window.SLOP_APPS || []).filter((a) => !a.path.startsWith('#')).sort((a, b) => b.path.length - a.path.length);
  const hit = apps.find((a) => path.endsWith('/' + a.path) || path.includes('/' + a.path));
  if (hit) return hit.id;
  const seg = path.split('/').filter(Boolean);
  return seg.length ? seg[seg.length - 1] : 'home';
}
const kindOf = (id) => { const a = (window.SLOP_APPS || []).find((x) => x.id === id); return a ? a.kind : /\/games\//.test(location.pathname) ? 'game' : 'app'; };

export function boot(opts = {}) {
  if (booted || !(MASCOT || OVERLAY)) return api;
  booted = true;
  const app = opts.app || detectApp();
  const home = app === 'home';
  cfg = Object.assign({}, home ? HOME : APP, { app, kind: home ? 'site' : kindOf(app) }, opts);
  makeToggle();
  addEventListener('keydown', (e) => { if (SHORTCUT(e)) { e.preventDefault(); toggle(); } });
  if (isOn(app, opts.defaultOn ?? home)) setOn(true, false);
  return api;
}

/** Turn him on or off (and remember it when the person chose). */
export async function setOn(v, save = true) {
  on = !!v;
  if (save) remember(cfg.app, on);
  render();
  if (on) {
    if (!engine) engine = await (OVERLAY ? import('../mascot/slot.js') : import('./engine.js'));
    if (!on) return;                         // switched off again while loading
    await engine.start(Object.assign(cfg, { hide: () => setOn(false) }));   // the slot's menu has Hide; it loads its overlay first, so the greeting has an animation
    if (!on) return;
    engine.show(true);
  } else if (engine) engine.show(false);
  document.dispatchEvent(new CustomEvent('buddy:toggle', { detail: on }));
}
export const toggle = () => setOn(!on);

/* ---------- the floating toggle ---------- */
const FACE = '<svg viewBox="-30 -30 60 60" aria-hidden="true"><defs><radialGradient id="slp-g-toggle" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#f6ffcf"/><stop offset=".35" stop-color="#d4ff3a"/><stop offset="1" stop-color="#5d8f00"/></radialGradient></defs><circle r="24" cy="3" fill="url(#slp-g-toggle)"/><ellipse cx="-7" cy="0" rx="3" ry="4.2" fill="#0b1300"/><ellipse cx="7" cy="0" rx="3" ry="4.2" fill="#0b1300"/><path d="M-4 8 Q0 11 4 8" stroke="#0b1300" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="-9" cy="-10" rx="5" ry="3" transform="rotate(-30 -9 -10)" fill="rgba(255,255,255,.8)"/></svg>';
const CSS = `.buddy-toggle{display:flex;flex-direction:column;align-items:center;gap:2px}
.buddy-toggle .bt-main{width:44px;height:44px;padding:4px;border-radius:50%;border:1px solid rgba(241,237,228,.18);background:rgba(17,17,17,.85);cursor:pointer;touch-action:none;box-shadow:0 6px 18px rgba(0,0,0,.35);filter:grayscale(.85) brightness(.8);transition:filter .2s,transform .2s}
.buddy-toggle .bt-main svg{display:block;width:100%;height:100%}
.buddy-toggle.is-on .bt-main{filter:none;border-color:#d4ff3a}
.buddy-toggle .bt-main:hover{transform:scale(1.06)}
.buddy-toggle .bt-main:focus-visible,.buddy-toggle .bt-more:focus-visible{outline:2px solid #d4ff3a;outline-offset:2px}
.buddy-toggle .bt-more{position:absolute;top:-8px;left:-8px;width:20px;height:20px;padding:0;border-radius:50%;border:1px solid rgba(241,237,228,.25);background:#111;color:#f1ede4;font:700 11px/1 system-ui;cursor:pointer}
.buddy-toggle .bt-more[hidden]{display:none}
.buddy-toggle[hidden]{display:none}
@media print{.buddy-toggle{display:none}}`;
function makeToggle() {
  if (!document.getElementById('buddy-toggle-css')) {
    const st = document.createElement('style');
    st.id = 'buddy-toggle-css';
    st.textContent = CSS;
    document.head.append(st);
  }
  btn = document.createElement('div');
  btn.className = 'buddy-toggle';
  btn.innerHTML = `<button type="button" class="bt-main" aria-pressed="false">${FACE}</button><button type="button" class="bt-more" hidden>⋯</button>`;
  if (OVERLAY) overlayFace(btn.querySelector('.bt-main'));
  Object.assign(btn.style, { position: 'fixed', zIndex: String((cfg.z || 900) + 2), width: '44px', height: '44px' });
  const main = btn.querySelector('.bt-main');
  const pos = getPrefs().btn;
  // Not moved yet: the bottom corner, above a panel's footer with an app's main button (shared/frame/panel.js, --slop-foot-h)
  const home = () => { if (!getPrefs().btn) place(14, 14 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slop-foot-h')) || 0)); };
  if (pos) place(pos.right, pos.bottom); else home();
  addEventListener('slop-foot', home);
  // Drag to move (position remembered); a click toggles.
  let drag = null;
  main.addEventListener('pointerdown', (e) => {
    const r = btn.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, right: innerWidth - r.right, bottom: innerHeight - r.bottom, moved: false, id: e.pointerId };
  });
  main.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; try { main.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    place(drag.right - dx, drag.bottom - dy);
  });
  main.addEventListener('pointerup', () => {
    if (drag && drag.moved) { setPrefs({ btn: { right: parseFloat(btn.style.right), bottom: parseFloat(btn.style.bottom) } }); main.dataset.moved = '1'; }
    drag = null;
  });
  main.addEventListener('click', () => { if (main.dataset.moved) { delete main.dataset.moved; return; } toggle(); });
  btn.querySelector('.bt-more').addEventListener('click', () => engine && engine.toggleHud());
  document.body.append(btn);
  render();
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(render);
  addEventListener('resize', () => place(parseFloat(btn.style.right), parseFloat(btn.style.bottom)));
}
/** The overlay's flat icon and name on the toggle (its icon module is small; the mascot itself loads when switched on). */
async function overlayFace(main) {
  const m = await import('../mascot/slot.js').then((s) => s.loadIcon()).catch(() => null);
  if (!m) return;
  main.innerHTML = m.svg(36, false);
  NAME = m.name || NAME;
  named = true;
  render();
}
function place(right, bottom) {
  btn.style.right = Math.max(4, Math.min(innerWidth - 48, right)) + 'px';
  btn.style.bottom = Math.max(4, Math.min(innerHeight - 48, bottom)) + 'px';
}
function render() {
  if (!btn) return;
  const main = btn.querySelector('.bt-main');
  main.setAttribute('aria-pressed', String(on));
  main.title = named ? `${NAME} (Alt+Shift+S)` : tr('ui.buddy.toggle_tip');
  main.setAttribute('aria-label', tr(on ? 'ui.buddy.hide_name' : 'ui.buddy.show_name', { name: NAME }));
  const more = btn.querySelector('.bt-more');
  more.title = tr('ui.buddy.menu');
  more.setAttribute('aria-label', more.title);
  btn.classList.toggle('is-on', on);
  btn.querySelector('.bt-more').hidden = !on || cfg.home || OVERLAY;
  btn.hidden = on && OVERLAY;   // one presence: a profile's mascot is its own button (shared/mascot/ui.js) while it shows
}

export const api = { boot, setOn, toggle, detectApp, get on() { return on; }, get engine() { return engine; } };
window.SlopBuddyBoot = api;
// Plain <script type="module" src="boot.js"> pages: boot with the defaults once the page is parsed.
setTimeout(() => { if (!booted) boot(); }, 0);
