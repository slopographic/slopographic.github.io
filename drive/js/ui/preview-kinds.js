/* Slop Drive — ui/preview-kinds: previews for the kinds that are neither pictures, PDFs, audio, video nor 3D scenes:
 * text and code as scrollable text, CSV/TSV as a table of the first 200 rows, and everything else as its card (the
 * thumbnail at full size) with its size and type. Classic script. */
'use strict';
(function (DR) {
  const el = DR.el;
  const TEXT_PANEL = 4000, TEXT_QL = 400000, CSV_ROWS = 200, CSV_BYTES = 262144;
  /** Text and code: the start of the file in a scrollable block (more in Quick look). */
  DR.textPreview = function (r, big = false) {
    const limit = big ? TEXT_QL : TEXT_PANEL, pre = el('pre', { class: 'pv-text' }, DR.t('drive.pv.loading'));
    r.blob.slice(0, limit).text().then((t) => { pre.textContent = t + (r.size > limit ? '\n…' : ''); },
      () => { pre.textContent = DR.t('drive.pv.text_unreadable'); });
    return pre;
  };
  /** CSV and TSV: a table of the first 200 rows; the first row is the header. */
  DR.csvPreview = function (r) {
    const wrap = el('div', { class: 'pv-csv' }, el('p', { class: 'pv-note' }, DR.t('drive.pv.table_loading')));
    r.blob.slice(0, CSV_BYTES).text().then((t) => {
      const [head = [], ...body] = DR.parseRows(t, { max: CSV_ROWS + 1, sep: DR.sepFor(r) });
      const shown = Math.min(body.length, CSV_ROWS), cut = body.length > CSV_ROWS || r.size > CSV_BYTES;
      const table = el('table', { class: 'csv-table' },
        el('thead', null, el('tr', null, head.map((c) => el('th', { scope: 'col' }, c)))),
        el('tbody', null, body.slice(0, CSV_ROWS).map((row) => el('tr', null, row.map((c) => el('td', null, c))))));
      wrap.replaceChildren(el('div', { class: 'csv-scroll' }, table),
        el('p', { class: 'pv-note' }, DR.t(cut ? 'drive.pv.rows_first' : 'drive.pv.rows_n', { n: shown })));
    }, () => wrap.replaceChildren(el('p', { class: 'pv-note' }, DR.t('drive.pv.table_unreadable'))));
    return wrap;
  };
  /** Anything else: the card thumbnail at full size, then its size and type. Returns the nodes to append. */
  DR.cardPreview = function (r, note = '') {
    const th = el('div', { class: 'th pv-card' }, DR.badge(r, 'badge big'));
    DR.fillThumb(th, r);
    return [th, el('p', { class: 'pv-note' }, note || DR.t('drive.pv.no_preview', { kind: DR.kindLabel(r), size: DR.fmtSize(r.size) }))];
  };
})(window.DR);
