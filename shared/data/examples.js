// Example files for the imports: CSV text generated here, so nothing is downloaded. Each kind lists its
// columns and a short note; the importer reads the same header names (see each app's import code).
// Exposes window.SlopExamples: kinds(), info(kind), csv(kind), filename(kind), download(kind).
(function (g) {
  'use strict';
  const quote = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const line = (cells) => cells.map(quote).join(',');
  const say = (k) => { const I = g.SlopI18n; return I && I.t ? I.t(k) : k; };   // title and note: keys in shared/i18n/ui/<code>/data2.js
  // Valid GS1 check digits throughout (EAN-13 bodies from the GS1 example prefixes).
  const KINDS = {
    label: {
      title: 'ui.data.ex.label', file: 'sloplabel-data-example.csv',
      columns: ['SKU', 'Name', 'Price', 'EAN', 'Qty'],
      rows: [['SLP-1', 'Lime goo 250 ml', '4.99', '4006381333931', '3'], ['SLP-2', 'Blue sparkle 500 ml', '6.50', '5012345678900', '1'],
        ['SLP-3', 'Mint slime, travel size', '2.25', '9780201379624', '2'], ['SLP-4', 'Glow pebbles (pack of 6)', '11.00', '5901234123457', '1']],
      note: 'ui.data.ex.label_note',
    },
    inventory: {
      title: 'ui.data.ex.inventory', file: 'slop-products-example.csv',
      columns: ['SKU', 'EAN', 'Name', 'Price', 'Reorder level'],
      rows: [['SLP-1', '4006381333931', 'Lime goo 250 ml', '4.99', '10'], ['SLP-2', '5012345678900', 'Blue sparkle 500 ml', '6.50', '5'],
        ['SLP-3', '', 'Mint slime, travel size', '2.25', ''], ['SLP-4', '5901234123457', 'Glow pebbles (pack of 6)', '11.00', '0']],
      note: 'ui.data.ex.inventory_note',
    },
    contacts: {
      title: 'ui.data.ex.contacts', file: 'slop-contacts-example.csv',
      columns: ['First Name', 'Last Name', 'Organization 1 - Name', 'Organization 1 - Title', 'E-mail 1 - Value', 'Phone 1 - Type', 'Phone 1 - Value', 'Labels', 'Notes'],
      rows: [['Ada', 'Lovelace', 'Analytical Works', 'Buyer', 'ada@example.com', 'Work', '+44 20 7946 0001', 'Customers', 'Asked for a quote on 250 ml jars'],
        ['Grace', 'Hopper', '', '', 'grace@example.com', 'Mobile', '+1 555 0100', 'Leads', ''],
        ['Alan', 'Turing', 'Bletchley Supplies', 'Owner', 'alan@example.com', 'Work', '+44 20 7946 0002', '', 'Wants a follow-up in May']],
      note: 'ui.data.ex.contacts_note',
    },
    crm: {
      title: 'ui.data.ex.crm', file: 'slop-crm-customers-example.csv',
      columns: ['First Name', 'Last Name', 'Organization 1 - Name', 'E-mail 1 - Value', 'Phone 1 - Value', 'Labels', 'Notes'],
      rows: [['Ada', 'Lovelace', 'Analytical Works', 'ada@example.com', '+44 20 7946 0001', 'Customers', 'Asked for a quote on 250 ml jars'],
        ['Grace', 'Hopper', '', 'grace@example.com', '+1 555 0100', 'Leads', 'Met at the trade show']],
      note: 'ui.data.ex.crm_note',
    },
  };

  const need = (kind) => { const k = KINDS[kind]; if (!k) throw new Error(`No example for "${kind}"`); return k; };
  /** The example's CSV text (header row, then the rows; CRLF-free, RFC 4180 quoting). */
  function csv(kind) { const k = need(kind); return [line(k.columns), ...k.rows.map(line)].join('\n') + '\n'; }
  /** { title, file, columns, note } for the import dialog's text, in the chosen language (call it when the dialog opens). */
  function info(kind) { const k = need(kind); return { title: say(k.title), file: k.file, columns: k.columns.slice(), note: say(k.note) }; }
  function filename(kind) { return need(kind).file; }
  function kinds() { return Object.keys(KINDS); }

  /** Downloads the example as a file (through SlopUI when the page has it). */
  function download(kind) {
    const blob = new Blob([csv(kind)], { type: 'text/csv;charset=utf-8' });
    if (g.SlopUI && g.SlopUI.download) g.SlopUI.download(blob, filename(kind));
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename(kind); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  }

  g.SlopExamples = { kinds, info, csv, filename, download };
})(typeof window !== 'undefined' ? window : globalThis);
