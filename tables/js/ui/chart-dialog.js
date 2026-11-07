/* Slop Tables: Insert ▸ Chart… and Edit chart…, one dialog (SlopUI.dialog) with a live preview. The range starts as the
 * selection, or the block of filled cells around the active cell. Insert puts the chart beside its data, in view. */
import { S, sheet, range, redraw, toast } from './state.js';
import { transact } from './history.js';
import { metrics } from './grid.js';
import { select, chartTheme } from './charts.js';
import { chartData, TYPES } from '../objects/chart-data.js';
import { chartSvg } from '../objects/chart-svg.js';
import { currentRegion, regionText, resolveRange } from '../objects/region.js';
import { newId } from '../objects/store.js';
import { t } from '../i18n.js';

const UI = () => window.SlopUI;

/** The range a new chart or pivot table starts with: the selection, or the region around the active cell. */
export function startRange() {
  const g = range(), sh = sheet();
  if (g.r1 !== g.r2 || g.c1 !== g.c2) return regionText(sh, sh, g);
  const v = sh.value(g.r1, g.c1);
  if (v === null || v === undefined) return '';
  return regionText(sh, sh, currentRegion(sh, g.r1, g.c1));
}

/** Where a new chart goes: right of its data when that is on screen, else at the top-left of the view. */
function placeFor(rangeText, w, h) {
  const m = metrics(), sh = sheet(), rg = resolveRange(S.wb, sh, rangeText);
  const viewL = m.sxE, viewT = m.syE, viewR = m.sxE + m.W - m.fzW, viewB = m.syE + m.H - m.fzH;
  let x = viewL + 16, y = viewT + 16;
  if (!rg.error && rg.sheet === sh) {
    const rx = m.C.top(rg.c2 + 1) + 16, ry = m.R.top(rg.r1);
    if (rx + w <= viewR && ry >= viewT && ry + 40 < viewB) { x = rx; y = ry + 8; }
    else if (m.R.top(rg.r2 + 1) + 16 + h <= viewB && m.C.top(rg.c1) >= viewL) { x = m.C.top(rg.c1); y = m.R.top(rg.r2 + 1) + 16; }
  }
  return { x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)) };
}

/** Opens the dialog. chart: an existing chart to edit, or null to insert one. Resolves with the chart id or null. */
export function openChartDialog(chart = null) {
  const sh = sheet(), ui = UI(), el = ui.el;
  const type = ui.select(TYPES.map(([id]) => [id, t(`tables.chart.type_${id}`)]), chart ? chart.type : 'column');
  const rangeIn = el('input', { class: 'sui-input', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'A1:C10', 'aria-label': t('tables.chart.data_range') });
  rangeIn.value = chart ? chart.range : startRange();
  const by = ui.select([['cols', t('tables.chart.by_cols')], ['rows', t('tables.chart.by_rows')]], chart ? chart.by : 'cols');
  type.setAttribute('aria-label', t('tables.chart.type')); by.setAttribute('aria-label', t('tables.chart.series_in'));
  const title = el('input', { class: 'sui-input', type: 'text', placeholder: t('tables.chart.no_title'), 'aria-label': t('tables.chart.title_aria') });
  title.value = chart ? chart.title : '';
  const legend = ui.check(t('tables.chart.show_legend'), chart ? chart.legend !== false : true);
  const preview = el('div', { class: 'chart-preview', 'aria-live': 'polite' }), msg = el('p', { class: 'chart-msg', role: 'status' });
  const draft = () => ({ ...(chart || {}), type: type.value, range: rangeIn.value.trim(), by: by.value, title: title.value.trim(), legend: legend.input.checked,
    ...(chart && chart.range !== rangeIn.value.trim() ? { header: undefined, catCol: undefined } : {}) });
  const paint = () => {
    const d = draft(), data = chartData(S.wb, sh, d), w = Math.max(240, Math.min(420, preview.clientWidth || 360));
    preview.innerHTML = chartSvg(data, { type: d.type, title: d.title, legend: d.legend, w, h: Math.round(w * 0.6), theme: chartTheme() });
    msg.textContent = data.error || '';
    return data;
  };
  for (const c of [type, rangeIn, by, title, legend.input]) c.addEventListener(c.tagName === 'SELECT' || c.type === 'checkbox' ? 'change' : 'input', paint);
  const body = el('div', { class: 'chart-dlg' },
    el('div', { class: 'chart-form' }, ui.field(t('tables.chart.f_type'), type), ui.field(t('tables.chart.f_data'), rangeIn), ui.field(t('tables.chart.series_in'), by), ui.field(t('tables.chart.f_title'), title), legend.el, msg),
    preview);
  let out = null;
  return new Promise((res) => {
    ui.dialog({
      title: t(chart ? 'tables.chart.edit' : 'tables.chart.insert'), body, cls: 'chart-dialog',
      buttons: [{ label: t('menu.cancel') }, {
        label: t(chart ? 'menu.save' : 'tables.chart.insert_btn'), primary: true,
        act: () => {
          const d = draft(), data = paint();
          if (data.error) { toast(data.error); return false; }
          if (chart) transact(() => Object.assign(sh.charts.find((c) => c.id === chart.id) || {}, d));
          else {
            const m = metrics(), w = Math.min(480, Math.max(MIN_PREVIEW, m.W - m.fzW - 32)), h = Math.round(Math.min(300, w * 0.66));
            const id = newId(S.wb, 'c');
            if (!d.title && data.series.length === 1) d.title = data.series[0].name;
            transact(() => sh.charts.push({ ...d, id, w, h, ...placeFor(d.range, w, h) }));
            out = id;
          }
          out = out || chart.id;
        },
      }],
      onClose: (ok) => { if (ok && out) select(out); redraw(); res(ok ? out : null); },
    });
    requestAnimationFrame(paint);
  });
}
const MIN_PREVIEW = 220;
