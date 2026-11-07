/* Slop Code: the Explorer sidebar's layout. The width (drag the handle, or the arrow keys; a column on a desktop,
 * the drawer on a phone), the collapsible sections (Explorer, Open editors, Extensions) and the Open editors list.
 * The width and the collapsed sections are kept per viewer in slop-code.layout (a versioned envelope). */
import { el, t } from './dom.js';
import { readPref, writePref } from './prefs.js';

const MIN = 160, MAX = 480, DEFAULT = 232, KEY_STEP = 16;
const SECTIONS = ['explorer', 'open', 'ext'];
const state = { width: DEFAULT, collapsed: {} };
const $ = (id) => document.getElementById(id);
const clampWidth = (w) => Math.round(Math.min(MAX, Math.max(MIN, Number(w) || DEFAULT)));

/** Read the saved layout, draw it, and wire the section toggles and the resize handle. */
export function initLayout() {
  const saved = readPref('layout', {});
  state.width = clampWidth(saved.width);
  state.collapsed = saved.collapsed && typeof saved.collapsed === 'object' ? { ...saved.collapsed } : {};
  applyWidth();
  applySections();
  for (const btn of document.querySelectorAll('[data-sec-toggle]')) {
    btn.addEventListener('click', () => setSection(btn.dataset.secToggle, !isOpen(btn.dataset.secToggle)));
  }
  wireResize();
}

const isOpen = (name) => !state.collapsed[name];
/** Open or close a section. The choice is kept. */
export function setSection(name, open) {
  if (!SECTIONS.includes(name)) return;
  state.collapsed[name] = !open;
  applySections();
  writePref('layout', { width: state.width, collapsed: { ...state.collapsed } });
}
/** Open a section (the Extensions command uses this). */
export const expandSection = (name) => setSection(name, true);

function applySections() {
  for (const name of SECTIONS) {
    const sec = document.querySelector(`[data-sec="${name}"]`);
    if (!sec) continue;
    const open = isOpen(name);
    sec.classList.toggle('collapsed', !open);
    const btn = sec.querySelector('[data-sec-toggle]');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}

function applyWidth() {
  const app = $('cd-app'), handle = $('cd-resize');
  if (app) app.style.setProperty('--cd-tree-w', state.width + 'px');
  if (handle) handle.setAttribute('aria-valuenow', String(state.width));
}
/** Set the width. `keep` saves it; a drag saves once at the end. */
function setWidth(w, keep) {
  state.width = clampWidth(w);
  applyWidth();
  if (keep) writePref('layout', { width: state.width, collapsed: { ...state.collapsed } });
}

// The handle has touch-action: none and data-touch-hit (a 44 px hit area for a finger: code/css/explorer.css, shared/input).
function wireResize() {
  const handle = $('cd-resize');
  if (!handle) return;
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, w: state.width };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic event has no pointer to capture */ }
  });
  handle.addEventListener('pointermove', (e) => { if (drag) setWidth(drag.w + e.clientX - drag.x, false); });
  const end = () => { if (drag) { drag = null; setWidth(state.width, true); } };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setWidth(state.width + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP), true);
  });
  handle.addEventListener('dblclick', () => setWidth(DEFAULT, true));
}

/** Redraw the Open editors list: one row per open file, the active one marked, unsaved files with a dot. */
export function renderOpenEditors(host, docs, active, { onSelect, onClose }) {
  if (!host) return;
  if (!docs.length) { host.replaceChildren(el('li', { class: 'cd-hint' }, t('code.app.no_open'))); return; }
  host.replaceChildren(...docs.map((d) => {
    const on = d === active;
    return el('li', { class: 'cd-open-item' + (on ? ' on' : '') },
      el('button', { type: 'button', class: 'cd-open-name', title: d.dirty ? t('code.app.name_unsaved', { name: d.name }) : d.name,
        'aria-current': on ? 'true' : null, onclick: () => onSelect(d) }, d.name,
        d.dirty ? el('span', { class: 'cd-dirty', 'aria-label': t('code.app.unsaved') }, '•') : null),
      el('button', { type: 'button', class: 'cd-open-x', 'aria-label': t('ui.close_name', { name: d.name }), title: t('menu.close'), onclick: () => onClose(d) }, '×'));
  }));
}
