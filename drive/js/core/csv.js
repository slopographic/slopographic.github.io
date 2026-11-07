/* Slop Drive — core/csv: a small CSV/TSV reader (quoted fields, doubled quotes, CRLF, a BOM). Used by the table
 * preview and the card thumbnails. parseRows(text, { max, sep }) → rows of strings; it stops after max rows. */
'use strict';
(function (DR) {
  DR.parseRows = function (text, { max = Infinity, sep = ',' } = {}) {
    const s = String(text).replace(/^﻿/, ''), rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = ''; rows.push(row); row = [];
        if (rows.length >= max) return rows;
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.slice(0, max);
  };
  /** The separator for a file: a tab for .tsv, a comma otherwise. */
  DR.sepFor = (r) => (DR.ext(r.name) === 'tsv' ? '\t' : ',');
})(window.DR);
