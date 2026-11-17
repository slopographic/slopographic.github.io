/* SlopFmp.exporters: a table as a CSV or JSON file (a Blob), read page by page from a reader's rows().
   csv: UTF-8 with a BOM and CRLF (so spreadsheets open it with the right letters), RFC 4180 quoting, the column names
   first. json: an array with one object per record, keyed by column name (a repeated name gets " (2)", " (3)").
   Neither adds anything to the values, so a repeating field keeps its group separators (0x1D). Pure (Node too). */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const PAGE = 500;
  const quote = (s) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);

  /** Walk every row of a table: each(rows) is called per page, in order. */
  async function eachPage(reader, table, each) {
    for (let from = 0; from < table.rowCount; from += PAGE) {
      const rows = await reader.rows(table.id, from, PAGE);
      if (!rows.length) break;
      each(rows);
    }
  }

  async function csv(reader, table) {
    const parts = ['﻿' + table.columns.map((c) => quote(c.name)).join(',') + '\r\n'];
    await eachPage(reader, table, (rows) => parts.push(rows.map((r) => r.map(quote).join(',') + '\r\n').join('')));
    return new Blob(parts, { type: 'text/csv;charset=utf-8' });
  }

  async function json(reader, table) {
    const seen = new Map();
    const keys = table.columns.map((c) => {
      const n = (seen.get(c.name) || 0) + 1;
      seen.set(c.name, n);
      return n > 1 ? c.name + ' (' + n + ')' : c.name;
    });
    const parts = ['['];
    let first = true;
    await eachPage(reader, table, (rows) => {
      parts.push(rows.map((r) => {
        const o = Object.create(null);
        keys.forEach((k, i) => { o[k] = r[i]; });
        const line = (first ? '\n' : ',\n') + JSON.stringify(o);
        first = false;
        return line;
      }).join(''));
    });
    parts.push('\n]\n');
    return new Blob(parts, { type: 'application/json' });
  }

  F.exporters = { csv, json };
})(typeof window !== 'undefined' ? window : globalThis);
