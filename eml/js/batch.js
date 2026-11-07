/* Slop EML: the pure parts of working with many messages at once. No DOM: window.EmlBatch in the page, module.exports
 * for the Node tests (tests/node/eml-batch.test.mjs). An item is { id, name, summary: { from, to, subject, date },
 * time (ms or null), attachments: [{ name, type, size }] } (an EmlApp doc has all of these).
 *   safeName(name, fallback)      a file name with no path or reserved characters, at most 120 characters
 *   uniqueNames(names)            the same names, duplicates made distinct ("a (2).pdf"), case-insensitively
 *   person(address)               "Ann Example <ann@x>" -> "Ann Example"; a bare address stays as it is
 *   sort(items, key, dir)         by 'date' | 'from' | 'subject' ('asc' | 'desc'); stable; undated last either way
 *   chrono(items)                 oldest first (the order of a combined PDF)
 *   search(items, query)          the items whose sender, recipients, subject, file name or attachment names hold every word
 *   range(ids, a, b)              the ids from a to b (inclusive) in list order, for shift-click
 *   stems(items)                  a folder / file stem per item: "2024-03-01 Subject", unique
 *   csvRows(items)                [['Date', 'From', 'To', 'Subject', 'Attachments'], ...] in the given order
 *   csv(rows)                     RFC 4180 text with CRLF line ends
 *   typeOf(name, type)            a MIME type from the extension when the mail says only application/octet-stream
 *   isoDate(time)                 'YYYY-MM-DD HH:MM' (UTC) or '' */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EmlBatch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

  function safeName(raw, fallback = 'file') {
    let s = String(raw == null ? '' : raw).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, ' ').trim();
    s = s.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
    if (!s || RESERVED.test(s)) s = (s ? '_' + s : '') || fallback;
    if (s.length > 120) {
      const dot = s.lastIndexOf('.'), ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
      s = s.slice(0, 120 - ext.length).trim() + ext;
    }
    return s;
  }

  function uniqueNames(names, fallback) {
    const used = new Set();
    return names.map((raw) => {
      const base = safeName(raw, fallback || 'file'), dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base, ext = dot > 0 ? base.slice(dot) : '';
      let name = base, n = 1;
      while (used.has(name.toLowerCase())) { n += 1; name = stem + ' (' + n + ')' + ext; }
      used.add(name.toLowerCase());
      return name;
    });
  }

  function person(addr) {
    const s = String(addr || '').trim();
    const m = /^"?([^"<]*?)"?\s*<([^>]*)>/.exec(s);
    if (m) return m[1].trim() || m[2].trim();
    return s;
  }

  const KEY = {
    from: (it) => person(it.summary.from).toLowerCase(),
    subject: (it) => String(it.summary.subject || '').replace(/^\s*((re|fw|fwd|sv|vs|aw|wg)\s*:\s*)+/i, '').trim().toLowerCase(),
  };
  function sort(items, key = 'date', dir = 'desc') {
    const sign = dir === 'asc' ? 1 : -1;
    const indexed = items.map((it, i) => ({ it, i }));
    indexed.sort((a, b) => {
      if (key === 'date') {
        const x = a.it.time, y = b.it.time;
        if (x == null || y == null) return x == null && y == null ? a.i - b.i : x == null ? 1 : -1;
        return (x - y) * sign || a.i - b.i;
      }
      const f = KEY[key] || KEY.subject;
      return f(a.it).localeCompare(f(b.it), undefined, { sensitivity: 'base', numeric: true }) * sign || a.i - b.i;
    });
    return indexed.map((x) => x.it);
  }
  const chrono = (items) => sort(items, 'date', 'asc');

  function search(items, query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items.slice();
    return items.filter((it) => {
      const s = it.summary;
      const hay = [s.from, s.to, s.cc, s.subject, it.name, ...(it.attachments || []).map((a) => a.name)].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  function range(ids, a, b) {
    const i = ids.indexOf(a), j = ids.indexOf(b);
    if (i < 0 || j < 0) return j >= 0 ? [b] : [];
    return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
  }

  const pad = (n) => String(n).padStart(2, '0');
  function isoDate(t) {
    if (t == null || !Number.isFinite(t)) return '';
    const d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function stems(items) {
    const raw = items.map((it) => {
      const day = isoDate(it.time).slice(0, 10);
      const subj = String(it.summary.subject || '').trim() || String(it.name || 'message').replace(/\.(eml|mbox)$/i, '');
      return safeName((day ? day + ' ' : '') + subj.slice(0, 80), 'message');
    });
    return uniqueNames(raw, 'message');
  }

  function csvRows(items) {
    return [['Date', 'From', 'To', 'Subject', 'Attachments']].concat(items.map((it) => [
      isoDate(it.time) || String(it.summary.date || ''), it.summary.from || '', it.summary.to || '', it.summary.subject || '',
      (it.attachments || []).map((a) => a.name).join('; '),
    ]));
  }
  const cell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

  const EXT = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain',
    md: 'text/markdown', html: 'text/html', htm: 'text/html', json: 'application/json', ics: 'text/calendar', vcf: 'text/vcard', eml: 'message/rfc822',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', zip: 'application/zip',
  };
  function typeOf(name, type) {
    const t = String(type || '').toLowerCase();
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    const byExt = m ? EXT[m[1].toLowerCase()] : null;
    if (byExt && (!t || t === 'application/octet-stream' || t === 'application/x-download' || t === 'application/force-download')) return byExt;
    return t || byExt || 'application/octet-stream';
  }

  return { safeName, uniqueNames, person, sort, chrono, search, range, stems, csvRows, csv, typeOf, isoDate };
});
