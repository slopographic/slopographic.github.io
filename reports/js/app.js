/* Slop Reports: the page. Lists the built-in and saved reports, runs the chosen one over the data in this browser (read-only),
 * and shows the rows with the sort and filter header of SlopFinder (the one Slop Sheets uses), or a plain table without it.
 * Saved definitions are checked by the engine before they are kept. A link may name the built-in report to open
 * (?report=sales-tax, from a task page): this visit only (R.presetOf, pure; unknown ids are ignored, nothing is stored).
 * Classic script. */
(function (g) {
  'use strict';
  const R = g.SlopReports;
  const E = R.engine;
  const $ = (id) => g.document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = g.document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const dom = {
    select: $('report'), dataNote: $('data-note'), reportNote: $('report-note'), results: $('results'),
    editor: $('editor'), json: $('json'), err: $('err'), edit: $('edit'), del: $('delete'), save: $('save'),
  };
  const S = { def: null, saved: false, result: null, shown: null, finder: null, ctx: {}, seq: 0 };
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  /** A built-in report in the chosen language (its title, note and column headings from reports.def.<id>.*); a saved
   *  one as it is (the person's own words). */
  function localDef(def) {
    const I = g.SlopI18n, base = 'reports.def.' + def.id.replace(/-/g, '_');
    if (!I || !R.BUILTIN.some((b) => b.id === def.id) || !I.has(base + '.title')) return def;
    const w = (k, en) => (I.has(`${base}.${k}`) ? I.t(`${base}.${k}`) : en);
    return { ...def, title: w('title', def.title), note: w('note', def.note), columns: def.columns.map((c) => ({ ...c, label: w(c.field, c.label) })) };
  }
  R.localDef = localDef;

  // Number, money and time cells line up on the right.
  const numCls = (c) => (['money', 'number', 'duration', 'percent'].includes(c.type) ? 'rp-num' : null);
  const option = (value, text) => { const o = el('option', null, text); o.value = value; return o; };

  /** Fills the picker: the built-in reports, then the saved ones. */
  function fillPicker() {
    dom.select.replaceChildren();
    const built = el('optgroup'); built.label = t('reports.app.builtin');
    for (const d of R.BUILTIN) built.append(option(d.id, localDef(d).title));
    dom.select.append(built);
    const saved = R.saved.list();
    if (saved.length) {
      const mine = el('optgroup'); mine.label = t('reports.app.saved');
      for (const d of saved) mine.append(option(d.id, d.title));
      dom.select.append(mine);
    }
  }

  /** The definition with this id: a built-in, or a saved one. */
  function findDef(id) {
    const built = R.BUILTIN.find((d) => d.id === id);
    if (built) return { def: built, saved: false };
    const mine = R.saved.list().find((d) => d.id === id);
    return mine ? { def: mine, saved: true } : null;
  }

  function choose(id) {
    const hit = findDef(id) || { def: R.BUILTIN[0], saved: false };
    S.def = localDef(hit.def);
    S.saved = hit.saved;
    dom.select.value = hit.def.id;
    dom.edit.textContent = hit.saved ? t('reports.page.edit') : t('reports.app.copy_edit');
    dom.del.hidden = !hit.saved;
    closeEditor();
    run();
  }

  /** Says what the data state means for the person: no records yet, or the report's own note. */
  function showNotes(loaded) {
    const empty = !loaded.found || !R.hasData(loaded.counts);
    dom.dataNote.hidden = !empty;
    dom.dataNote.textContent = empty
      ? t('reports.app.no_data')
      : '';
    dom.reportNote.textContent = S.def.note || '';
  }

  async function run() {
    const seq = ++S.seq;
    const loaded = await R.loadData();
    if (seq !== S.seq) return;
    S.ctx = { baseCurrency: loaded.baseCurrency, locale: loaded.locale };
    showNotes(loaded);
    const res = E.run(S.def, loaded.data, S.ctx);
    S.result = res;
    if (!res.ok) { showErrors(res.errors); return; }
    S.shown = res.rows;
    render(res);
  }

  function showErrors(errors) {
    dropFinder();
    dom.results.replaceChildren(el('p', 'rp-err', t('reports.app.cannot_run', { why: errors.join('; ') })));
  }

  function dropFinder() {
    if (S.finder) { S.finder.destroy(); S.finder = null; }
  }

  function render(res) {
    dropFinder();
    dom.results.replaceChildren();
    if (g.SlopFinder && g.SlopFinderModel) mountFinder(res); else plainTable(res);
  }

  const cellOf = (r, c) => E.cellText(r, c, S.ctx);
  const rawOf = (r, c) => { const v = r[c.field]; return v === undefined || v === null ? '' : v; };

  /** The Slop Sheets header: search, filters, sortable column headers, in a table view. */
  function mountFinder(res) {
    const cols = res.columns;
    const distinct = (c) => new Set(res.rows.map((r) => cellOf(r, c))).size;
    const facetCols = cols.filter((c) => c.type === 'text' && res.rows.length > 1 && distinct(c) <= 25);
    const line = (r) => el('div', 'rp-line', cols.map((c) => cellOf(r, c)).filter(Boolean).join(' · '));
    // A card names each value: the first column is its title, the rest read "Label: value".
    const card = (r) => {
      const box = el('div', 'rp-card');
      box.append(el('b', 'rp-card-title', cellOf(r, cols[0]) || t('reports.app.none')));
      for (const c of cols.slice(1)) { const v = cellOf(r, c); if (v) box.append(el('span', 'rp-kv', `${c.label}: ${v}`)); }
      return box;
    };
    S.finder = g.SlopFinder.mount(dom.results, {
      items: res.rows,
      fields: cols.map((c) => ({ key: c.field, label: c.label, get: (r) => cellOf(r, c) })),
      searchKeys: cols.map((c) => c.field),
      facets: facetCols.map((c) => ({ key: c.field, label: c.label, values: (r) => [cellOf(r, c)] })),
      columns: cols.map((c) => ({ key: c.field, label: c.label, get: (r) => rawOf(r, c), render: (r) => cellOf(r, c) })),
      card,
      view: 'table',
      row: line,
      placeholder: t('reports.app.search'),
      searchLabel: t('reports.app.search'),
      count: (n) => t('reports.app.rows_n', { n }),
      countOf: (shown, n) => t('reports.app.rows_of', { shown, n }),
      emptyText: t('reports.app.no_match'),
      onChange: (shown) => { S.shown = shown; },
    });
  }

  /** The plain table, when the Finder is not loaded. */
  function plainTable(res) {
    const cols = res.columns;
    if (!res.rows.length) { dom.results.append(el('p', 'rp-empty', t('reports.app.no_rows'))); return; }
    const head = el('tr');
    for (const c of cols) { const th = el('th', numCls(c), c.label); th.scope = 'col'; head.append(th); }
    const body = el('tbody');
    for (const r of res.rows) {
      const tr = el('tr');
      for (const c of cols) tr.append(el('td', numCls(c), cellOf(r, c)));
      body.append(tr);
    }
    const table = el('table', 'rp-table');
    table.append(el('thead'), body);
    table.querySelector('thead').append(head);
    const wrap = el('div', 'rp-tablewrap');
    wrap.append(table);
    dom.results.append(wrap);
    S.shown = res.rows;
  }

  function exportCsv() {
    if (!S.result || !S.result.ok) return;
    const text = E.toCsv(S.result.columns, S.shown || S.result.rows, S.ctx);
    const blob = new g.Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
    const a = el('a');
    a.href = g.URL.createObjectURL(blob);
    a.download = `${S.def.id}.csv`;
    g.document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => g.URL.revokeObjectURL(a.href), 1000);
  }

  function openEditor(def) {
    dom.json.value = JSON.stringify(def, null, 2);
    dom.err.textContent = '';
    dom.editor.hidden = false;
    dom.json.focus();
  }

  function closeEditor() {
    dom.editor.hidden = true;
    dom.err.textContent = '';
  }

  /** Checks the JSON, then keeps it as a saved report. A built-in id is refused by the store. */
  function saveEditor() {
    let def;
    try { def = JSON.parse(dom.json.value); } catch (e) { dom.err.textContent = t('reports.app.bad_json', { why: e.message }); return; }
    const errors = E.validate(def);
    if (errors.length) { dom.err.textContent = errors.join('. '); return; }
    const res = R.saved.save(def);
    if (!res.ok) { dom.err.textContent = res.error; return; }
    fillPicker();
    choose(def.id);
  }

  function removeSaved() {
    if (!S.saved || !g.confirm(t('reports.app.del_q', { title: S.def.title }))) return;
    R.saved.remove(S.def.id);
    fillPicker();
    choose(R.BUILTIN[0].id);
  }

  function newReport() {
    openEditor({
      id: `report-${Date.now().toString(36)}`, title: t('reports.app.my_report'), from: 'customers',
      columns: [{ field: 'name', label: t('reports.app.name_col') }, { field: 'email', label: t('reports.app.email_col') }],
    });
  }

  function editReport() {
    if (S.saved) { openEditor(S.def); return; }
    openEditor({ ...S.def, id: `${S.def.id}-copy`, title: t('reports.app.copy', { title: S.def.title }) });
  }

  /** The preset in a page address: { report } when it names a built-in report, else {}. */
  R.presetOf = (search) => {
    const id = new URLSearchParams(search || '').get('report');
    return R.BUILTIN.some((d) => d.id === id) ? { report: id } : {};
  };

  function init() {
    fillPicker();
    dom.select.addEventListener('change', () => choose(dom.select.value));
    $('new').addEventListener('click', newReport);
    dom.edit.addEventListener('click', editReport);
    dom.del.addEventListener('click', removeSaved);
    $('csv').addEventListener('click', exportCsv);
    dom.save.addEventListener('click', saveEditor);
    $('cancel').addEventListener('click', closeEditor);
    choose(R.presetOf(g.location.search).report || R.BUILTIN[0].id);
    // a language change: the picker and the report again in the new words
    if (g.SlopI18n) g.SlopI18n.on(() => { const id = S.def && S.def.id; fillPicker(); if (id) choose(id); });
  }

  init();
  /** For the commands (js/commands.js, js/ai-commands.js): pick and run a report, read what is shown, export it. */
  R.app = { fillPicker, choose, findDef, run, exportCsv, current: () => ({ def: S.def, saved: S.saved, result: S.result, shown: S.shown, ctx: S.ctx }) };
})(window);
