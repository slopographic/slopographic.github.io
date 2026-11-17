/* Slop Code: Search in files, the part that reads and writes. It lists the files of a scope, reads each one the way the editor would
 * (its own encoding and line endings, or the live text of an open tab), searches it, and replaces in it. The page of the box and the
 * results is search.js; the matching itself is findall.js.
 * A file that is open takes a replacement as one editor change (Ctrl+Z undoes it, the tab shows it as changed, nothing is written until
 * Save). A file that is not open is written back to Slop Drive at once, but only when its bytes survive a read and write unchanged
 * (so no other byte of it moves): mixed line endings, bytes the encoding cannot hold and the like are skipped and reported. */
import * as docs from './docs.js';
import { projectFiles, writeBlob } from './drive.js';
import { inspect, bytesFor, dominantEol } from './openfile.js';
import { decode, normalizeEol } from './encoding.js';
import { buildRegex, findIn, replaceIn, nameFilter } from './findall.js';
import { flushDraft } from './ops.js';
import { renderChrome } from './ui.js';

const H = () => window.SlopHub;
const idle = () => new Promise((r) => setTimeout(r, 0));
const MAX_TOTAL = 5000;   // a search that finds more than this stops and says so

/** The files a scope covers: [{ id, name, path }]. scope: 'all' (Slop Drive), 'folder' (a folder and what is under it) or 'open' (the tabs). */
export async function listScope({ scope, folderId, include }) {
  const ok = nameFilter(include), out = [];
  if (scope === 'open') {
    for (const d of docs.list()) if (d.kind === 'text' && ok(d.name)) out.push({ id: d.id, name: d.name, path: d.name });
  } else {
    for (const [path, rec] of await projectFiles(scope === 'folder' ? folderId ?? null : null)) if (ok(path)) out.push({ id: rec.id, name: rec.name, path });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** One file as the editor would hold it: { text, doc? } for a tab, { text, bytes, meta } for a file on Drive, or { skip } with why. */
async function load(entry) {
  const doc = docs.find(entry.id);
  if (doc) return doc.kind === 'text' ? { text: docs.textOf(doc), doc } : { skip: 'not_text' };
  const rec = await H().get(entry.id);
  if (!rec || !rec.blob || rec.trashedAt) return { skip: 'gone' };
  const seen = await inspect(rec.blob, rec.name);
  if (!seen.text) return { skip: seen.large ? 'large' : 'not_text' };
  const bytes = new Uint8Array(await rec.blob.arrayBuffer());
  const raw = decode(bytes, seen.encoding, { bom: seen.bom });
  return { text: normalizeEol(raw), bytes, meta: { encoding: seen.encoding, bom: seen.bom, eol: dominantEol(raw) } };
}

/** Search a scope. q: the box and its switches (findall.buildRegex). hooks: { progress(done, total), cancelled() }.
 * Returns { results: [{ id, name, path, open, matches, more }], total, scanned, files, skipped: [{ path, why }], truncated } or { error }. */
export async function searchFiles(q, scope, hooks = {}) {
  const built = buildRegex(q);
  if (built.error) return { error: built };
  const entries = await listScope(scope), results = [], skipped = [];
  let total = 0, scanned = 0, truncated = false;
  for (const e of entries) {
    if (hooks.cancelled && hooks.cancelled()) break;
    if (hooks.progress) hooks.progress(scanned, entries.length);
    const got = await load(e);
    scanned++;
    if (got.skip) { if (got.skip !== 'not_text') skipped.push({ path: e.path, why: got.skip }); continue; }
    const r = findIn(got.text, built.re, { limit: 200 });
    if (r.matches.length) { results.push({ id: e.id, name: e.name, path: e.path, open: !!got.doc, matches: r.matches, more: r.more }); total += r.matches.length + r.more; }
    if (total >= MAX_TOTAL) { truncated = true; break; }
    if (scanned % 4 === 0) await idle();
  }
  return { results, total, scanned, files: entries.length, skipped, truncated };
}

const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

/** Put changes into a tab: the shown one through the view (one undo step), another one through its stored state. */
function changeDoc(doc, changes) {
  const view = docs.mainView();
  if (doc === docs.current() && view) view.dispatch({ changes, userEvent: 'input.replace' });
  else doc.state = doc.state.update({ changes }).state;
  docs.refreshDirty(doc);
  flushDraft(doc.id);
}

/** Replace in the given files (entries from a search: { id, name, path }). Returns { files, count, skipped: [{ path, why }] }.
 * The files are read again, so what is replaced is what is there now, not what the search saw. */
export async function replaceFiles(q, replacement, entries, hooks = {}) {
  const built = buildRegex(q);
  if (built.error) return { error: built };
  let files = 0, count = 0;
  const skipped = [];
  for (const e of entries) {
    if (hooks.cancelled && hooks.cancelled()) break;
    if (hooks.progress) hooks.progress(files + skipped.length, entries.length);
    const got = await load(e);
    if (got.skip) { skipped.push({ path: e.path, why: got.skip }); continue; }
    const r = replaceIn(got.text, built.re, replacement, !!q.regexp);
    if (!r.count) continue;
    if (got.doc) changeDoc(got.doc, r.changes);
    else {
      const back = bytesFor(got.meta, got.text);
      if (back.fell || !same(back.bytes, got.bytes)) { skipped.push({ path: e.path, why: 'rewrites' }); continue; }
      const out = bytesFor(got.meta, r.text);
      if (out.fell) { skipped.push({ path: e.path, why: 'encoding' }); continue; }
      try { await writeBlob(e.id, out.bytes, e.name); } catch (err) { skipped.push({ path: e.path, why: 'gone' }); continue; }
    }
    files++; count += r.count;
    await idle();
  }
  renderChrome();
  return { files, count, skipped };
}
