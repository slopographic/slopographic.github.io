// CSV in and out for the product list. Pure: no storage here. Handles quoted cells, doubled quotes,
// CRLF or LF line ends, a byte-order mark, and a semicolon delimiter when the header uses only semicolons.
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});

  /** Splits CSV text into rows of cells. Blank lines are dropped. Returns { rows, error? }. */
  function parse(text) {
    let s = String(text ?? '');
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    const first = s.split(/\r?\n/, 1)[0] || '';
    const delim = !first.includes(',') && first.includes(';') ? ';' : ',';
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (quoted) return { rows: [], error: g.SlopI18n ? g.SlopI18n.t('inventory.im.e_quote') : 'inventory.im.e_quote' };
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return { rows: rows.filter((r) => r.some((x) => String(x).trim() !== '')) };
  }

  /** One cell as CSV text: quoted when it holds a comma, quote or line break. */
  function cell(v) {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }

  /** Rows (arrays of values) as CSV text with CRLF line ends. */
  function build(rows) {
    return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  NS.csv = { parse, build };
})(typeof window !== 'undefined' ? window : globalThis);
