/* SlopLabel — vars/sources: data sources. CSV/TSV (RFC 4180, auto delimiter), JSON paste, and a
 * minimal Excel .xlsx reader (zip central directory + DecompressionStream('deflate-raw') + XML). */
'use strict';

/** Parse delimited text. Handles quotes, "" escapes, delimiters and newlines inside quoted fields, BOM, CRLF. */
function parseCSV(text, delim) {
  let s = String(text);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (!delim) delim = detectDelimiter(s);
  const rows = [];
  let row = [], f = '', q = false, i = 0, quotedField = false;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f === '' && !quotedField) { q = true; quotedField = true; i++; continue; }
    if (c === delim) { row.push(f); f = ''; quotedField = false; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(f); rows.push(row); row = []; f = ''; quotedField = false;
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1; continue;
    }
    f += c; i++;
  }
  if (f !== '' || quotedField || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
function detectDelimiter(s) {
  const line = s.slice(0, 4000).split(/\r?\n/).slice(0, 5).join('\n');
  let best = ',', bestN = -1;
  for (const d of [',', ';', '\t', '|']) {
    let n = 0, q = false;
    for (const c of line) { if (c === '"') q = !q; else if (!q && c === d) n++; }
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}
/** rows[][] (first row = header) → data source. Pads short rows; de-duplicates empty/duplicate headers. */
function tableToSource(rows, name = 'Data') {
  if (!rows.length) throw new Error('The data source is empty');
  const seen = new Map();
  const columns = rows[0].map((h, i) => {
    let c = String(h == null ? '' : h).trim() || 'Column' + (i + 1);
    if (seen.has(c)) { seen.set(c, seen.get(c) + 1); c += '_' + seen.get(c); } else seen.set(c, 1);
    return c;
  });
  const body = rows.slice(1).map((r) => columns.map((_, i) => (r[i] == null ? '' : String(r[i]))));
  return { name, columns, rows: body, map: {}, qtyCol: '' };
}
function parseJSONSource(text, name = 'JSON') {
  let v = JSON.parse(text);
  if (v && !Array.isArray(v) && typeof v === 'object') { const k = Object.keys(v).find((key) => Array.isArray(v[key])); v = k ? v[k] : [v]; }
  if (!Array.isArray(v) || !v.length) throw new Error('Expected a JSON array of records');
  if (Array.isArray(v[0])) return tableToSource(v, name);
  const cols = [];
  for (const r of v) for (const k of Object.keys(r || {})) if (!cols.includes(k)) cols.push(k);
  return tableToSource([cols, ...v.map((r) => cols.map((c) => (r[c] == null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])))], name);
}

/* ---------------- zip (read) ---------------- */
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
/** Read a zip into { name: async () => Uint8Array }. Supports stored (0) and deflate (8). */
function readZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {}, dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lstart = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const data = u8.subarray(lstart, lstart + csize);
    files[name] = method === 0 ? async () => data : method === 8 ? () => inflateRaw(data) : async () => { throw new Error('Unsupported zip compression ' + method); };
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

/* ---------------- xlsx ---------------- */
function colIndex(ref) { let n = 0; for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }
const XLSX_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
function excelSerialToISO(v, withTime) {
  const ms = Math.round((+v - 25569) * 86400000);
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return withTime && (+v % 1) ? `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : date;
}
/** Read the first worksheet of an .xlsx file as rows[][] of strings. */
async function readXLSX(buf) {
  const z = readZip(buf), dec = new TextDecoder();
  const txt = async (n) => (z[n] ? dec.decode(await z[n]()) : null);
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (node, tag) => [...node.getElementsByTagName(tag)];
  // locate the first sheet through workbook.xml + rels; fall back to sheet1.xml
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await txt('xl/workbook.xml'), rels = await txt('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = kids(xml(wb), 'sheet')[0];
    const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = kids(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target'); sheetPath = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); }
  }
  const sheet = await txt(sheetPath);
  if (!sheet) throw new Error('No worksheet found in this .xlsx');
  const ssx = await txt('xl/sharedStrings.xml');
  const shared = ssx ? kids(xml(ssx), 'si').map((si) => kids(si, 't').map((t) => t.textContent).join('')) : [];
  const stx = await txt('xl/styles.xml');
  const dateStyles = new Set();
  if (stx) {
    const sd = xml(stx), custom = new Map(kids(sd, 'numFmt').map((n) => [+n.getAttribute('numFmtId'), n.getAttribute('formatCode') || '']));
    const xfs = sd.getElementsByTagName('cellXfs')[0];
    if (xfs) kids(xfs, 'xf').forEach((xf, i) => { const id = +xf.getAttribute('numFmtId'); const code = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''); if (XLSX_DATE_FMT.has(id) || /[dy]/i.test(code) && !/^[#0.,%]+$/.test(code)) dateStyles.add(i); });
  }
  const rows = [];
  for (const r of kids(xml(sheet), 'row')) {
    const ri = (+r.getAttribute('r') || rows.length + 1) - 1;
    const row = [];
    let ci = 0;
    for (const c of kids(r, 'c')) {
      const ref = c.getAttribute('r'); if (ref) ci = colIndex(ref);
      const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0], v = vEl ? vEl.textContent : '';
      let val;
      if (t === 's') val = shared[+v] != null ? shared[+v] : '';
      else if (t === 'inlineStr') val = kids(c, 't').map((x) => x.textContent).join('');
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'str' || t === 'e') val = v;
      else if (v !== '' && dateStyles.has(+c.getAttribute('s'))) val = excelSerialToISO(v, true);
      else val = v !== '' ? String(+v === Math.round(+v) ? +v : Math.round(+v * 1e10) / 1e10) : '';
      row[ci++] = val;
    }
    rows[ri] = Array.from(row, (x) => (x == null ? '' : x));
  }
  return Array.from(rows, (r) => r || []).filter((r) => r.some((x) => x !== ''));
}
/** Load any supported data file into a data source. */
async function loadDataFile(file) {
  const name = file.name || 'Data';
  if (/\.xlsx$/i.test(name) || /spreadsheetml/.test(file.type)) return tableToSource(await readXLSX(await file.arrayBuffer()), name);
  const text = await file.text();
  if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) return parseJSONSource(text, name);
  return tableToSource(parseCSV(text, /\.tsv$|\.tab$/i.test(name) ? '\t' : undefined), name);
}
