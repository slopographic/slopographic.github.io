/* Slop Code for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), through the editor's own
 * code (docs.js, ops.js, drive.js, extensions.js formatDoc, main.js runCurrent): make a file with its code, open one, insert
 * or replace text (each one CodeMirror transaction, so one Ctrl+Z), format, run the preview, save it to its Slop Drive
 * record, and save a copy to Slop Drive or as a download. Imported on demand by SlopCmd.prepare() (commands.js). */
import * as docs from './docs.js';
import { openRecord, saveDoc, showDoc } from './ops.js';
import { uniqueName } from './drive.js';
import { mimeFor, langOf } from './lang.js';
import { formatDoc } from './extensions.js';
import { refresh as refreshTree } from './tree.js';
import { env } from './ui.js';

const H = () => window.SlopHub, C = window.SlopCmd;
const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 500, description }, extra);
const list = [];
const add = C.aiAdder('code', list);   // shared/commands/commands.js

/** A folder id from a path ("site/css") or an id; empty or "/" is the top of Slop Drive. */
async function folderOf(q) {
  const s = String(q || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return null;
  const folders = (await H().listFolders()).filter((f) => !f.trashedAt);
  if (folders.some((f) => f.id === s)) return s;
  const pathOf = (f) => { const out = []; for (let x = f, n = 0; x && n < 64; x = folders.find((y) => y.id === x.parentId), n++) out.unshift(x.name); return out.join('/'); };
  const hit = folders.find((f) => pathOf(f).toLowerCase() === s.toLowerCase()) || folders.find((f) => f.name.toLowerCase() === s.toLowerCase());
  if (!hit) throw new Error(`No Slop Drive folder “${q}”`);
  return hit.id;
}
/** The open text document, or an error that says what to do. */
function current() {
  const d = docs.current();
  if (!d || !env.view) throw new Error('No file is open: use new_file or open_file first');
  if (d.kind !== 'text') throw new Error(`“${d.name}” is not a text file`);
  return d;
}
const lines = (s) => s.split('\n').length;

add('new_file', 'New file', [Str('name', 'file name with its extension, e.g. index.html, app.js, style.css', { required: true, maxLength: 200 }),
  Str('content', 'the code', { maxLength: 2000000, default: '' }), Str('folder', 'Slop Drive folder path or id; the top when empty')],
async (a) => {
  const folderId = await folderOf(a.folder), name = await uniqueName(a.name.trim(), folderId);
  const id = await H().put(new Blob([String(a.content || '')], { type: mimeFor(name) }), { name, from: 'code', folderId });
  await refreshTree();
  const d = await openRecord(await H().get(id));
  return `Created and opened “${name}” (${langOf(d).label}, ${lines(String(a.content || ''))} lines; id ${id}).`;
}, { description: 'Make a file in Slop Drive with its code and open it in the editor.' });

add('open_file', 'Open a file', [Str('file', 'a Slop Drive file name, path or id', { required: true })], async (a) => {
  const all = (await H().list()).filter((r) => !r.trashedAt), s = String(a.file).trim().toLowerCase();   // intake-ok: an AI command looks a Drive file up by name or id (a lookup; the person's picker is SlopIntake.fromDrive)
  const rec = all.find((r) => r.id === a.file) || all.find((r) => r.name.toLowerCase() === s.split('/').pop()) || all.find((r) => r.name.toLowerCase().includes(s));
  if (!rec) throw new Error(`No Slop Drive file “${a.file}”`);
  const d = await openRecord(rec);
  return `Opened “${d.name}”${d.kind === 'text' ? ` (${lines(docs.textOf(d))} lines)` : ` (${d.kind}, a view)`}.`;
});

add('insert_text', 'Insert text', [Str('text', 'the text to put in', { required: true, maxLength: 1000000 }),
  { name: 'at', type: 'enum', values: ['cursor', 'start', 'end', 'line'], default: 'end', description: 'line: before the line given' },
  { name: 'line', type: 'number', min: 1, max: 10000000, integer: true, description: 'line number for at: line' }],
(a) => {
  const d = current(), v = env.view, doc = v.state.doc;
  let pos = a.at === 'start' ? 0 : a.at === 'cursor' ? v.state.selection.main.head : doc.length;
  if (a.at === 'line') { if (!a.line) throw new Error('Give line'); pos = doc.line(Math.min(a.line, doc.lines)).from; }
  let text = String(a.text);
  if (a.at === 'end' && doc.length && !doc.toString().endsWith('\n') && !text.startsWith('\n')) text = '\n' + text;
  v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, scrollIntoView: true, userEvent: 'input' });
  return `Inserted ${lines(String(a.text))} line(s) into “${d.name}” at ${a.at === 'line' ? 'line ' + a.line : 'the ' + a.at}; it has ${v.state.doc.lines} lines now.`;
});

add('replace_text', 'Find and replace', [Str('find', 'the text to look for', { required: true, maxLength: 100000 }), Str('replace', 'the new text; empty removes it', { default: '', maxLength: 1000000 }),
  { name: 'all', type: 'boolean', default: true }, { name: 'match_case', type: 'boolean', default: true }],
(a) => {
  const d = current(), v = env.view, text = v.state.doc.toString();
  const hay = a.match_case ? text : text.toLowerCase(), needle = a.match_case ? a.find : a.find.toLowerCase();
  const changes = [];
  for (let i = hay.indexOf(needle); i >= 0 && needle; i = hay.indexOf(needle, i + needle.length)) { changes.push({ from: i, to: i + needle.length, insert: a.replace }); if (!a.all) break; }
  if (!changes.length) return `0 replacements: “${a.find.slice(0, 60)}” was not found in “${d.name}”.`;
  v.dispatch({ changes, userEvent: 'input' });
  return `${changes.length} replacement${changes.length === 1 ? '' : 's'} in “${d.name}”.`;
});

add('set_text', 'Replace the whole file', [Str('text', 'the new content of the open file', { required: true, maxLength: 2000000 })], (a) => {
  const d = current(), v = env.view;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: String(a.text) }, userEvent: 'input' });
  return `“${d.name}” now has ${v.state.doc.lines} lines (not saved yet: save_file writes it to Slop Drive).`;
});

add('format_document', 'Format document', [], () => { const d = current(); if (!formatDoc()) throw new Error(`“${d.name}” could not be formatted`); return `Formatted “${d.name}”.`; });
add('run_preview', 'Run preview', [], async () => { const d = current(); await window.SlopCode.runCurrent(); return `Ran “${d.name}” in the preview.`; });

add('save_file', 'Save', [], async () => { const d = current(); if (!(await saveDoc(d))) throw new Error('Could not save'); return `Saved “${d.name}” to Slop Drive.`; },
  { description: 'Write the open file back to its Slop Drive file.' });
add('export_file', 'Save a copy', [Str('name', 'file name; the same name when empty', { maxLength: 200 }), Str('folder', 'Slop Drive folder path or id; the file\'s own folder when empty'),
  { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
async (a) => {
  const d = current(), name = (a.name || d.name).trim(), blob = new Blob([docs.textOf(d)], { type: mimeFor(name) }), out = [];
  if (a.to !== 'download') {
    const folderId = a.folder ? await folderOf(a.folder) : d.folderId, fname = await uniqueName(name, folderId);
    out.push(`Saved a copy as “${fname}” in Slop Drive (id ${await H().put(blob, { name: fname, from: 'code', folderId })})`);
    await refreshTree();
  }
  if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded “${name}”`); }
  return out.join(' and ') + '.';
}, { description: 'Save a copy of the open file to Slop Drive and/or as a download.' });

function state() {
  const d = docs.current();
  return { app: 'Slop Code', open: docs.list().map((x) => ({ name: x.name, kind: x.kind, unsaved: !!x.dirty })),
    current: d && d.kind === 'text' ? { name: d.name, language: langOf(d).id, lines: env.view.state.doc.lines, unsaved: !!d.dirty, text: env.view.state.doc.toString().slice(0, 3000) } : d ? { name: d.name, kind: d.kind } : null };
}
/** The open files' text now; the rollback puts each back (one transaction each), then shows the file that was open. */
function checkpoint() {
  const was = docs.current(), texts = new Map(docs.list().filter((d) => d.kind === 'text').map((d) => [d.id, docs.textOf(d)]));
  return () => {
    for (const [id, text] of texts) {
      const d = docs.find(id);
      if (!d || docs.textOf(d) === text) continue;
      showDoc(d);
      env.view.dispatch({ changes: { from: 0, to: env.view.state.doc.length, insert: text } });
    }
    if (was && docs.find(was.id)) showDoc(was);
    return true;
  };
}

C.register(list);
C.provide({ state, checkpoint });
