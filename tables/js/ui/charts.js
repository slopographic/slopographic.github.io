/* Slop Tables: the charts on the grid. Each chart of the active sheet is a box over the cells (#objects inside the plane),
 * drawn as SVG from its range on every repaint whose data changed, so it follows edits at once. Click selects a chart
 * (S.chart holds its id), drag moves it, the corner handles resize it, double-click or Edit opens the chart dialog, and
 * Delete or the × removes it. Every change is one undo step. The picture comes from objects/chart-svg.js. */
import { S, $, sheet, redraw } from './state.js';
import { metrics } from './grid.js';
import { transact, beginStep, commitStep } from './history.js';
import { commitEdit } from './editor.js';
import { chartData } from '../objects/chart-data.js';
import { chartSvg, LIGHT, DARK } from '../objects/chart-svg.js';
import { t, onLang } from '../i18n.js';

/** The box's buttons in the chosen language. */
function words(el) {
  const [edit, del] = el.querySelectorAll('.chart-b');
  edit.textContent = t('tables.chart.edit_short'); edit.title = t('tables.chart.edit'); edit.setAttribute('aria-label', edit.title);
  del.title = t('tables.chart.delete'); del.setAttribute('aria-label', del.title);
}
// A language switch: new words on the buttons, and every picture is drawn again (its messages, the box's label).
onLang(() => { for (const box of boxes.values()) { words(box.el); box.key = ''; } redraw(); });

const MIN_W = 160, MIN_H = 110;
const boxes = new Map(); // chart id → { el, svg, key }
let layer = null, drag = null, onEdit = () => {};

export const current = () => (S.chart ? (sheet().charts || []).find((c) => c.id === S.chart) || null : null);
export function select(id) { S.chart = id; redraw(); }

/** The chart colours for the grid's theme: the dark or light palette, on the grid's own surface and text colours. */
export function chartTheme() {
  const g = $('grid'), cs = g ? getComputedStyle(g) : null;
  const rgb = cs ? (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number) : [255, 255, 255];
  const lum = rgb.length >= 3 ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : 1;
  const base = lum < 0.5 ? DARK : LIGHT;
  return { ...base, surface: cs && rgb.length >= 3 && (rgb[3] === undefined || rgb[3] > 0) ? cs.backgroundColor : base.surface, text: (cs && cs.color) || base.text };
}

function makeBox(id) {
  const el = document.createElement('div');
  el.className = 'chart-box'; el.dataset.id = id;
  el.setAttribute('data-touch-surface', ''); // a finger drags the chart, never scrolls under it (shared/input); handles grow to 44 px
  el.innerHTML = '<div class="chart-svg"></div>' + ['nw', 'ne', 'sw', 'se'].map((h) => `<span class="chart-h" data-h="${h}" data-touch-hit></span>`).join('') +
    '<div class="chart-bar"><button type="button" class="chart-b" data-act="edit"></button><button type="button" class="chart-b" data-act="delete">×</button></div>';
  words(el);
  layer.append(el);
  return { el, svg: el.firstChild, key: '' };
}

/** Repaint hook: places the boxes of the active sheet and redraws the pictures whose data or size changed. */
export function render() {
  if (!layer || !S.wb) return;
  const sh = sheet(), list = sh.charts || [], m = metrics(), th = chartTheme(), seen = new Set();
  if (S.chart && !list.some((c) => c.id === S.chart)) S.chart = null;
  for (const ch of list) {
    seen.add(ch.id);
    const box = boxes.get(ch.id) || makeBox(ch.id);
    boxes.set(ch.id, box);
    const d = chartData(S.wb, sh, ch);
    const key = JSON.stringify([d.error, d.cats, d.series && d.series.map((s) => [s.name, s.values]), ch.type, ch.title, ch.legend, ch.w, ch.h, th.surface, th.text, th.palette[0]]);
    if (key !== box.key) {
      box.svg.innerHTML = chartSvg(d, { type: ch.type, title: ch.title, legend: ch.legend, w: ch.w, h: ch.h, theme: th });
      box.key = key;
      box.el.setAttribute('aria-label', t('tables.chart.box_aria', { title: ch.title || t('tables.chart.chart'), type: t(`tables.chart.type_${ch.type}`), range: ch.range }));
    }
    const left = ch.x < m.fzW ? ch.x : m.fzW + ch.x - m.sxE, top = ch.y < m.fzH ? ch.y : m.fzH + ch.y - m.syE;
    box.el.style.cssText = `left:${left}px;top:${top}px;width:${ch.w}px;height:${ch.h}px`;
    box.el.classList.toggle('on', S.chart === ch.id);
  }
  for (const [id, box] of boxes) if (!seen.has(id)) { box.el.remove(); boxes.delete(id); }
}

export function remove(id = S.chart) {
  const sh = sheet();
  if (!id || !(sh.charts || []).some((c) => c.id === id)) return;
  transact(() => { sh.charts = sh.charts.filter((c) => c.id !== id); });
  if (S.chart === id) S.chart = null;
  redraw();
}

function down(e) {
  const el = e.target.closest('.chart-box');
  if (!el) return;
  e.stopPropagation();
  if (e.button !== 0) { if (S.chart !== el.dataset.id) select(el.dataset.id); return; }
  if (S.edit && !commitEdit()) return;
  const act = e.target.closest('[data-act]');
  if (act) { e.preventDefault(); select(el.dataset.id); if (act.dataset.act === 'edit') onEdit(current()); else remove(el.dataset.id); return; }
  e.preventDefault();
  select(el.dataset.id);
  $('grid').focus({ preventScroll: true });
  const ch = current(), h = e.target.closest('.chart-h');
  drag = { id: ch.id, h: h ? h.dataset.h : null, x0: e.clientX, y0: e.clientY, o: { x: ch.x, y: ch.y, w: ch.w, h: ch.h }, before: beginStep(), moved: false };
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capture */ }
}

function move(e) {
  if (!drag) return;
  const ch = (sheet().charts || []).find((c) => c.id === drag.id);
  if (!ch) { drag = null; return; }
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, o = drag.o;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
  drag.moved = true;
  if (!drag.h) { ch.x = Math.max(0, o.x + dx); ch.y = Math.max(0, o.y + dy); }
  else {
    const west = drag.h.includes('w'), north = drag.h.includes('n');
    const w = Math.max(MIN_W, o.w + (west ? -dx : dx)), hgt = Math.max(MIN_H, o.h + (north ? -dy : dy));
    ch.x = west ? Math.max(0, o.x + o.w - w) : o.x; ch.y = north ? Math.max(0, o.y + o.h - hgt) : o.y;
    ch.w = w; ch.h = hgt;
  }
  redraw();
}

function up() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.moved) commitStep(d.before);
}

/** Keys while a chart is selected: Delete removes it, Escape returns to the cells, arrows nudge it (Shift: 10 px). */
export function onKey(e) {
  const ch = current();
  if (!ch) return false;
  const step = e.shiftKey ? 10 : 1, nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(ch.id); return true; }
  if (e.key === 'Escape') { e.preventDefault(); select(null); return true; }
  if (e.key === 'Enter') { e.preventDefault(); onEdit(ch); return true; }
  if (nudge) {
    e.preventDefault();
    transact(() => { ch.x = Math.max(0, ch.x + nudge[0]); ch.y = Math.max(0, ch.y + nudge[1]); });
    redraw();
    return true;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { select(null); return false; } // typing goes back to the cell
  return false;
}

/** Wires the layer. edit(chart) opens the chart dialog for a chart. */
export function init({ edit } = {}) {
  layer = $('objects');
  onEdit = edit || onEdit;
  layer.addEventListener('pointerdown', down);
  layer.addEventListener('dblclick', (e) => { const el = e.target.closest('.chart-box'); if (el && !e.target.closest('[data-act]')) { select(el.dataset.id); onEdit(current()); } });
  layer.addEventListener('wheel', (e) => { if (e.target.closest('.chart-box')) { $('vp').scrollBy(e.deltaX, e.deltaY); e.preventDefault(); } }, { passive: false });
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  // A click anywhere else on the grid returns to the cells.
  $('grid').addEventListener('pointerdown', (e) => { if (S.chart && !e.target.closest('.chart-box')) S.chart = null; }, true);
}
