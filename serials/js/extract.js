/* Slop Serial counter: the rules, with no DOM, so the page and the tests share them.
 *   DEFAULT_PATTERN             the Cisco serial shape: 3 letters, 4 digits (year and week), 4 letters or digits
 *   serialsIn(text, pattern)    each match in the text once, in reading order, upper case
 *   serialsFor(photo, pattern)  the photo's serials: those read from its text plus typed ones, minus removed ones
 *   tally(photos, pattern)      { unique: [{ serial, count, photos }], totals } across all photos
 *   csvOf(rows)                 rows of cells → CSV text (quoted where needed, spreadsheet-safe) */
export const DEFAULT_PATTERN = '\\b[A-Z]{3}\\d{4}[A-Z0-9]{4}\\b';

export function serialsIn(text, pattern = DEFAULT_PATTERN) {
  let re;
  try { re = new RegExp(pattern, 'gi'); } catch (e) { throw new Error('That pattern is not valid: ' + e.message); }
  const out = [];
  for (const m of String(text || '').matchAll(re)) {
    const s = m[0].toUpperCase();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function serialsFor(photo, pattern = DEFAULT_PATTERN) {
  const found = serialsIn(photo.text, pattern);
  const typed = [...(photo.manual || [])];
  const removed = photo.removed || new Set();
  return [...new Set([...found, ...typed])].filter((s) => !removed.has(s));
}

export function tally(photos, pattern = DEFAULT_PATTERN) {
  const by = new Map();
  let read = 0, withSerial = 0, hits = 0;
  for (const p of photos) {
    if (!p.read) continue;
    read++;
    const list = serialsFor(p, pattern);
    if (list.length) withSerial++;
    for (const s of list) {
      hits++;
      const row = by.get(s) || { serial: s, count: 0, photos: [] };
      row.count++;
      row.photos.push(p.name);
      by.set(s, row);
    }
  }
  const unique = [...by.values()].sort((a, b) => a.serial.localeCompare(b.serial));
  const totals = {
    photos: photos.length,
    read,
    withSerial,
    needsReview: read - withSerial,
    hits,
    quantity: unique.length,
    repeats: hits - unique.length,
  };
  return { unique, totals };
}

/** One cell as CSV: quoted when it holds a comma, quote or line break, and a leading = + - @ is made text so a spreadsheet
 *  never runs it as a formula. */
function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function csvOf(rows) {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
