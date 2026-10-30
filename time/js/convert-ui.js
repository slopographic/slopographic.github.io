/* Slop Time converter: a time in one zone, shown in every city of the list; and the time difference between two zones.
 * Classic script (after state.js, ui.js, convert.js). Exposes window.SlopTime.conv: init(), render(). */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones, S = ns.state, C = ns.convert, UI = ns.ui, $ = UI.$;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  function renderConvert() {
    const from = $('st-conv-from').value.trim();
    const body = $('st-conv-out');
    body.replaceChildren();
    const err = $('st-conv-err');
    const date = C.parseIsoDate($('st-conv-date').value);
    const clock = C.parseClock($('st-conv-time').value);
    if (!Z.isZone(from)) { err.textContent = t('time.conv.bad_from'); return; }
    if (!date) { err.textContent = t('time.conv.bad_date'); return; }
    if (!clock) { err.textContent = t('time.conv.bad_time'); return; }
    err.textContent = '';
    const result = C.convertTime(from, date, clock, S.cities());
    $('st-conv-caption').textContent = t('time.conv.caption', { time: `${UI.pad(clock.h)}:${UI.pad(clock.mi)}`, date, city: Z.cityOf(from) });
    for (const r of result.rows) {
      const tr = document.createElement('tr');
      tr.dataset.zone = r.zone;
      const city = document.createElement('th');
      city.scope = 'row';
      city.textContent = r.city;
      const time = document.createElement('td');
      time.className = 'st-conv-time';
      time.textContent = r.time;
      const day = document.createElement('td');
      day.textContent = r.day + (r.dayShift ? ' ' + t('time.conv.shift', { n: `${r.dayShift > 0 ? '+' : ''}${r.dayShift}` }) : '');
      const gmt = document.createElement('td');
      gmt.textContent = r.gmt;
      tr.append(city, time, day, gmt);
      body.append(tr);
    }
    if (!result.rows.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 4; td.textContent = t('time.conv.no_cities'); tr.append(td); body.append(tr); }
  }

  function renderDiff() {
    const a = $('st-diff-a').value.trim(), b = $('st-diff-b').value.trim();
    const out = $('st-diff-out');
    if (!Z.isZone(a) || !Z.isZone(b)) { out.textContent = t('time.conv.bad_two'); return; }
    const d = C.difference(a, b, S.nowMs());
    out.textContent = t('time.conv.diff', { text: d.text, a: Z.gmtLabel(Z.offsetMinutes(a, S.nowMs())), b: Z.gmtLabel(Z.offsetMinutes(b, S.nowMs())) });
  }

  /** Fill the converter with the current time in its zone. */
  function useNow() {
    const from = $('st-conv-from').value.trim() || S.prefs().zone;
    const now = S.nowMs();
    const p = Z.localParts(from, now);
    $('st-conv-from').value = from;
    $('st-conv-date').value = Z.dateIso(from, now);
    $('st-conv-time').value = `${UI.pad(p.h)}:${UI.pad(p.mi)}`;
    renderConvert();
  }

  function init() {
    const p = S.prefs();
    $('st-conv-from').value = p.zone;
    $('st-diff-a').value = p.zone;
    $('st-diff-b').value = S.cities()[0] || p.zone;
    useNow();
    for (const id of ['st-conv-from', 'st-conv-date', 'st-conv-time']) $(id).addEventListener('input', renderConvert);
    $('st-conv-now').addEventListener('click', useNow);
    for (const id of ['st-diff-a', 'st-diff-b']) $(id).addEventListener('input', renderDiff);
    renderDiff();
  }

  /* render() is the per-tick part: only the difference line says "right now", so only it is refreshed. */
  ns.conv = Object.freeze({ init, renderConvert, renderDiff, useNow, render: renderDiff });
})(typeof window !== 'undefined' ? window : globalThis);
