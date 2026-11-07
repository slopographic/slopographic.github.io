/* SlopBuffer formats: the record shape, the kinds, and the format choice. Pure: no DOM, no storage, so the node tests
 * load it as it is. Classic script; creates window.SlopBuffer (the other buffer files add to it).
 * A record is { kind, formats, source, t }:
 *   kind     'vector' | 'image' | 'text' | 'table' | 'clip' (clip: anything that has no single native kind)
 *   formats  { 'image/png': Blob, 'image/svg+xml': string, 'text/html': string, 'text/plain': string, 'text/csv': string }
 *   source   the id of the app that copied it ('vector', 'photoslop', 'slides', 'docs', 'tables')
 *   t        Date.now() when it was copied */
(function (g) {
  'use strict';
  var B = g.SlopBuffer = g.SlopBuffer || {};

  B.KINDS = ['vector', 'image', 'text', 'table', 'clip'];
  B.MIME = ['image/png', 'image/svg+xml', 'text/html', 'text/plain', 'text/csv'];
  /** Richest first. A copy that holds several formats is sent to a target in the first of these it accepts. */
  B.RANK = ['image/svg+xml', 'image/png', 'text/html', 'text/csv', 'text/plain'];

  /** The kind a set of formats implies, when the copying app does not say. */
  B.inferKind = function (formats) {
    if (formats['image/svg+xml']) return 'vector';
    if (formats['image/png']) return 'image';
    if (formats['text/csv']) return 'table';
    if (formats['text/html'] || formats['text/plain']) return 'text';
    return 'clip';
  };

  /** Checks and completes an input object. Returns a new record; throws Error with a readable message when it is not one. */
  B.record = function (input) {
    if (!input || typeof input !== 'object') throw new Error('A buffer item needs { formats }');
    var formats = input.formats, out = {}, keys;
    if (!formats || typeof formats !== 'object') throw new Error('A buffer item needs formats');
    keys = Object.keys(formats).filter(function (k) { return formats[k] != null; });
    if (!keys.length) throw new Error('A buffer item needs at least one format');
    keys.forEach(function (k) {
      if (B.MIME.indexOf(k) < 0) throw new Error('Unknown buffer format: ' + k);
      var v = formats[k];
      if (k === 'image/png') { if (!(typeof Blob !== 'undefined' && v instanceof Blob)) throw new Error('image/png must be a Blob'); }
      else if (typeof v !== 'string') throw new Error(k + ' must be a string');
      out[k] = v;
    });
    if (input.kind != null && B.KINDS.indexOf(input.kind) < 0) throw new Error('Unknown buffer kind: ' + input.kind);
    if (input.t != null && typeof input.t !== 'number') throw new Error('t must be a number');
    return {
      kind: input.kind || B.inferKind(out),
      formats: out,
      source: typeof input.source === 'string' && input.source ? input.source : 'unknown',
      t: input.t != null ? input.t : Date.now()
    };
  };

  /** Picks the first format a target accepts (in the target's order). Returns null when none matches, else
   *  { type, data, simplified, note }. simplified is true when the target gets a poorer format than the copy holds
   *  (say text/plain for a copy that also has text/html, or a PNG for a copy that is a vector), so the app can say so. */
  B.choose = function (record, accepts) {
    if (!record || !record.formats) return null;
    var best = B.RANK.filter(function (t) { return record.formats[t] != null; })[0];
    for (var i = 0; i < accepts.length; i++) {
      var type = accepts[i], data = record.formats[type];
      if (data == null) continue;
      var simplified = type !== best;
      return { type: type, data: data, simplified: simplified, note: simplified ? 'Simplified: sent as ' + label(type) + ', the copy also holds ' + label(best) : '' };
    }
    return null;
  };
  function label(type) { return type.replace(/^.*\//, '').replace('svg+xml', 'SVG').toUpperCase(); }

  /** RFC 4180 CSV to rows of strings. Quoted fields may hold commas, quotes and line breaks. */
  B.parseCsv = function (text, delim) {
    var d = delim || ',', rows = [], row = [], field = '', i = 0, q = false, s = String(text || '');
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    while (i < s.length) {
      var ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"') { q = true; i++; continue; }
      if (ch === d) { row.push(field); field = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += (ch === '\r' && s[i + 1] === '\n') ? 2 : 1; continue; }
      field += ch; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  };

  /** CSV text as TSV text (what spreadsheets paste from plain text). */
  B.csvToTsv = function (csv) {
    return B.parseCsv(csv).map(function (r) { return r.join('\t'); }).join('\n');
  };

  /** Rows of strings as CSV text (RFC 4180 quoting where a field needs it). */
  B.toCsv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (v) { var s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    }).join('\r\n');
  };
})(window);
