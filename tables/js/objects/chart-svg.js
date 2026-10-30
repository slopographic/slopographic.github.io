/* Slop Tables charts: draws a chart as an SVG string. No DOM, so the same picture is drawn on the grid, in the Insert
 * chart preview and in tests.
 *   chartSvg(data, { type, title, legend, w, h, theme }) → '<svg …>…</svg>'
 *   data: chartData() output ({ cats, series, more }) or { error }. theme: { palette: 8 colours, text, muted, grid, surface }.
 * Marks follow one style: thin bars with a 4 px rounded end at the value and a 2 px gap, 2 px lines with ringed markers,
 * pie slices split by a 2 px surface line; value and category text in the text colours, never the series colour. Every
 * mark has a <title>, so hovering it names the category, the series and the value. */
import { MAX_SERIES } from './chart-data.js';
import { t } from '../i18n.js';

export const LIGHT = { palette: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  text: '#0b0b0b', muted: '#52514e', grid: '#e4e2dc', base: '#9a978e', surface: '#fcfcfb' };
export const DARK = { palette: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  text: '#f0efec', muted: '#c3c2b7', grid: '#34332f', base: '#6f6d66', surface: '#1a1a19' };

export const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const W = (s, size) => String(s).length * size * 0.58; // text width estimate (no DOM to measure with)
const n2 = (v) => Math.round(v * 100) / 100;
const fit = (s, px, size) => { s = String(s); const max = Math.max(1, Math.floor(px / (size * 0.58))); return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s; };

/** A short number for an axis: 1.5k, 2M, 0.25. */
export function shortNum(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return n2(v / 1e9) + 'B';
  if (a >= 1e6) return n2(v / 1e6) + 'M';
  if (a >= 1e4) return n2(v / 1e3) + 'k';
  return String(n2(v));
}
/** Round axis bounds and a step for about n ticks. */
export function niceScale(lo, hi, n = 5) {
  if (lo === hi) { hi = lo + 1; if (lo > 0) lo = 0; }
  const raw = (hi - lo) / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  return { lo: Math.floor(lo / step + 1e-9) * step, hi: Math.ceil(hi / step - 1e-9) * step, step };
}

const text = (x, y, s, size, fill, anchor = 'start', weight = 400) =>
  `<text x="${n2(x)}" y="${n2(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${weight !== 400 ? ` font-weight="${weight}"` : ''}>${esc(s)}</text>`;
/** A bar with its value end rounded: dir is where the value end points ('up', 'down', 'right', 'left'). */
function bar(x, y, w, h, dir, fill, tip) {
  const r = Math.max(0, Math.min(4, (dir === 'up' || dir === 'down' ? w : h) / 2, dir === 'up' || dir === 'down' ? h : w));
  let d;
  if (dir === 'up') d = `M${n2(x)} ${n2(y + h)}V${n2(y + r)}Q${n2(x)} ${n2(y)} ${n2(x + r)} ${n2(y)}H${n2(x + w - r)}Q${n2(x + w)} ${n2(y)} ${n2(x + w)} ${n2(y + r)}V${n2(y + h)}Z`;
  else if (dir === 'down') d = `M${n2(x)} ${n2(y)}V${n2(y + h - r)}Q${n2(x)} ${n2(y + h)} ${n2(x + r)} ${n2(y + h)}H${n2(x + w - r)}Q${n2(x + w)} ${n2(y + h)} ${n2(x + w)} ${n2(y + h - r)}V${n2(y)}Z`;
  else if (dir === 'right') d = `M${n2(x)} ${n2(y)}H${n2(x + w - r)}Q${n2(x + w)} ${n2(y)} ${n2(x + w)} ${n2(y + r)}V${n2(y + h - r)}Q${n2(x + w)} ${n2(y + h)} ${n2(x + w - r)} ${n2(y + h)}H${n2(x)}Z`;
  else d = `M${n2(x + w)} ${n2(y)}H${n2(x + r)}Q${n2(x)} ${n2(y)} ${n2(x)} ${n2(y + r)}V${n2(y + h - r)}Q${n2(x)} ${n2(y + h)} ${n2(x + r)} ${n2(y + h)}H${n2(x + w)}Z`;
  return `<path class="mark" d="${d}" fill="${fill}"><title>${esc(tip)}</title></path>`;
}

/** Legend rows at the bottom: [{ label, color }] → { svg, h }. */
function legendOf(items, w, bottom, th) {
  const size = 12, rows = [[]];
  let x = 0;
  for (const it of items) {
    const iw = 16 + Math.min(W(it.label, size), 160) + 14;
    if (x + iw > w - 24 && rows[rows.length - 1].length) { rows.push([]); x = 0; }
    rows[rows.length - 1].push({ ...it, iw }); x += iw;
  }
  const shown = rows.slice(0, 3), h = shown.length * 18;
  let svg = '';
  shown.forEach((row, ri) => {
    const total = row.reduce((a, it) => a + it.iw, 0);
    let lx = Math.max(12, (w - total) / 2);
    const y = bottom - h + ri * 18 + 13;
    for (const it of row) {
      svg += `<rect x="${n2(lx)}" y="${n2(y - 9)}" width="10" height="10" rx="2" fill="${it.color}"/>` + text(lx + 15, y, fit(it.label, 160, size), size, th.muted);
      lx += it.iw;
    }
  });
  return { svg: `<g class="legend">${svg}</g>`, h: h + 6 };
}

function pie(d, x0, y0, x1, y1, th) {
  let items = d.cats.map((c, i) => ({ label: c, v: d.series[0].values[i] })).filter((it) => it.v > 0);
  if (items.length > MAX_SERIES) {
    const sorted = [...items].sort((a, b) => b.v - a.v), keep = sorted.slice(0, MAX_SERIES - 1);
    items = items.filter((it) => keep.includes(it)).concat([{ label: t('tables.chart.other'), v: sorted.slice(MAX_SERIES - 1).reduce((a, it) => a + it.v, 0) }]);
  }
  const sum = items.reduce((a, it) => a + it.v, 0);
  if (!sum) return { svg: text((x0 + x1) / 2, (y0 + y1) / 2, t('tables.chart.no_positive'), 12, th.muted, 'middle'), items: [] };
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(4, Math.min(x1 - x0, y1 - y0) / 2);
  let a0 = -Math.PI / 2, svg = '';
  items.forEach((it, i) => {
    const frac = it.v / sum, a1 = a0 + frac * Math.PI * 2, color = th.palette[i];
    const tip = `${it.label}: ${it.v} (${Math.round(frac * 1000) / 10}%)`;
    if (frac > 0.9999) svg += `<circle class="mark" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fill="${color}"><title>${esc(tip)}</title></circle>`;
    else {
      const p = (a) => `${n2(cx + Math.cos(a) * r)} ${n2(cy + Math.sin(a) * r)}`;
      svg += `<path class="mark" d="M${n2(cx)} ${n2(cy)}L${p(a0)}A${n2(r)} ${n2(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}Z" fill="${color}" stroke="${th.surface}" stroke-width="2" stroke-linejoin="round"><title>${esc(tip)}</title></path>`;
    }
    it.color = color; it.label = `${it.label} ${Math.round(frac * 100)}%`;
    a0 = a1;
  });
  return { svg, items };
}

function cartesian(d, type, x0, y0, x1, y1, th) {
  const series = d.series.slice(0, MAX_SERIES), n = d.cats.length || 1, horiz = type === 'bar';
  const all = series.flatMap((s) => s.values).filter((v) => v !== null);
  const sc = niceScale(Math.min(0, ...all), Math.max(0, ...all), Math.max(2, Math.round((horiz ? x1 - x0 : y1 - y0) / 48)));
  const ticks = [];
  for (let v = sc.lo; v <= sc.hi + sc.step / 2; v += sc.step) ticks.push(n2(v));
  const tickW = Math.max(...ticks.map((v) => W(shortNum(v), 11))) + 8;
  const catW = horiz ? Math.min((x1 - x0) * 0.35, Math.max(...d.cats.map((c) => W(c, 11))) + 8) : 0;
  const px0 = x0 + (horiz ? catW : tickW), py1 = y1 - (horiz ? 16 : 18);
  const V = (v) => (horiz ? px0 + (v - sc.lo) / (sc.hi - sc.lo) * (x1 - px0) : py1 - (v - sc.lo) / (sc.hi - sc.lo) * (py1 - y0));
  let svg = '<g class="axes">';
  for (const v of ticks) {
    const p = V(v);
    svg += horiz ? `<line x1="${n2(p)}" y1="${n2(y0)}" x2="${n2(p)}" y2="${n2(py1)}" stroke="${v === 0 ? th.base : th.grid}" stroke-width="1"/>` + text(p, y1 - 3, shortNum(v), 11, th.muted, 'middle')
      : `<line x1="${n2(px0)}" y1="${n2(p)}" x2="${n2(x1)}" y2="${n2(p)}" stroke="${v === 0 ? th.base : th.grid}" stroke-width="1"/>` + text(px0 - 6, p + 4, shortNum(v), 11, th.muted, 'end');
  }
  const slot = ((horiz ? py1 - y0 : x1 - px0)) / n, every = Math.max(1, Math.ceil((horiz ? 14 : Math.min(90, Math.max(...d.cats.map((c) => W(c, 11))) + 8)) / slot));
  d.cats.forEach((c, i) => {
    if (i % every) return;
    const m = (horiz ? y0 : px0) + slot * (i + 0.5);
    svg += horiz ? text(px0 - 6, m + 4, fit(c, catW - 6, 11), 11, th.muted, 'end') : text(m, y1 - 3, fit(c, slot * every - 4, 11), 11, th.muted, 'middle');
  });
  svg += '</g><g class="marks">';
  const zero = V(Math.max(sc.lo, Math.min(0, sc.hi)));
  if (type === 'line') {
    series.forEach((s, si) => {
      const color = th.palette[si];
      let path = '', pen = false, dots = '';
      s.values.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        const x = px0 + slot * (i + 0.5), y = V(v);
        path += (pen ? 'L' : 'M') + n2(x) + ' ' + n2(y); pen = true;
        if (n <= 60) dots += `<circle class="mark" cx="${n2(x)}" cy="${n2(y)}" r="4" fill="${color}" stroke="${th.surface}" stroke-width="2"><title>${esc(`${d.cats[i]} · ${s.name}: ${v}`)}</title></circle>`;
      });
      svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` + dots;
    });
  } else {
    const ns = series.length, group = slot * 0.78, bw = group / ns;
    series.forEach((s, si) => s.values.forEach((v, i) => {
      if (v === null) return;
      const a = (horiz ? y0 : px0) + slot * i + (slot - group) / 2 + bw * si + 1, p = V(v), size = Math.max(1, bw - 2);
      const tip = `${d.cats[i]} · ${s.name}: ${v}`;
      svg += horiz ? bar(Math.min(p, zero), a, Math.abs(p - zero), size, v >= 0 ? 'right' : 'left', th.palette[si], tip)
        : bar(a, Math.min(p, zero), size, Math.abs(p - zero), v >= 0 ? 'up' : 'down', th.palette[si], tip);
    }));
  }
  return svg + '</g>';
}

export function chartSvg(data, { type = 'column', title = '', legend = true, w = 480, h = 300, theme = LIGHT } = {}) {
  const th = theme, pad = 12;
  let body = '', top = pad;
  if (title) { body += text(w / 2, pad + 13, fit(title, w - 2 * pad, 14), 14, th.text, 'middle', 600); top += 26; }
  if (!data || data.error) {
    body += text(w / 2, Math.max(top + 14, h / 2), fit(data ? data.error : t('tables.chart.no_data'), w - 2 * pad, 12), 12, th.muted, 'middle');
  } else {
    let bottom = h - pad, items;
    if (type === 'pie') {
      const pr = pie(data, pad, top, w - pad, bottom - (legend ? 24 : 0), th);
      if (legend && pr.items.length) { const lg = legendOf(pr.items, w, bottom, th); body += lg.svg; bottom -= lg.h; }
      body += pie(data, pad, top, w - pad, bottom, th).svg;
    } else {
      items = data.series.slice(0, MAX_SERIES).map((s, i) => ({ label: s.name, color: th.palette[i] }));
      if (legend && items.length > 1) { const lg = legendOf(items, w, bottom, th); body += lg.svg; bottom -= lg.h; }
      if (data.more) { body += text(w - pad, bottom - 2, t('tables.chart.showing_series', { shown: MAX_SERIES, n: data.series.length }), 11, th.muted, 'end'); bottom -= 16; }
      body += cartesian(data, type, pad, top + 4, w - pad, bottom, th);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(w)} ${n2(h)}" width="${n2(w)}" height="${n2(h)}" role="img" aria-label="${esc(title || type + ' chart')}">` +
    `<rect width="100%" height="100%" fill="${th.surface}"/>${body}</svg>`;
}
