/* Paste for the assistant: SlopCmd commands with arguments (shared/commands/args.js), imported on demand by
 * SlopCmd.prepare() (commands.js). Through the app's own store and actions: new_paste, insert_text, set_paste,
 * delete_paste (destructive: to the Slop Drive Trash), export_paste (a file with its language's extension to Slop Drive
 * and/or a download). state() lists the pastes; the checkpoint trashes pastes made since and puts changed ones back. */
import * as store from './store.js';
import * as A from './actions.js';
import { S, byId, current, visible } from './state.js';
import { LANGS, EXT } from './highlight.js';
import { EXPIRY_OPTIONS } from './store.js';
import { renderAll } from './view.js';

const C = window.SlopCmd;
const log = [];
const LANG = { name: 'language', type: 'enum', values: LANGS.map((l) => l[0]), description: 'sets the highlighting' };
const EXP = { name: 'expiry', type: 'enum', values: EXPIRY_OPTIONS.map((e) => e[0]), description: 'a label only' };
const PASTE = { name: 'paste', type: 'string', maxLength: 200, description: 'title or id; the open paste when empty' };
const list = [];
const add = C.aiAdder('paste', list);   // shared/commands/commands.js

function find(q) {
  if (!q) { const p = current(); if (!p) throw new Error('No paste is open'); return p; }
  const s = String(q).toLowerCase(), p = byId(q) || S.pastes.find((x) => (x.title || '').toLowerCase() === s) || S.pastes.find((x) => (x.title || '').toLowerCase().includes(s));
  if (!p) throw new Error(`No paste “${q}”`);
  return p;
}
const textOnly = (p) => { if (p.kind !== 'text') throw new Error('That paste is an image'); return p; };
const snap = (p) => ({ title: p.title, body: p.body, language: p.language, expiry: p.expiry });
async function changed(p, before) { log.push({ kind: 'changed', id: p.id, before }); store.touch(p); await store.flush(); renderAll(); }

add('new_paste', 'New paste', [{ name: 'title', type: 'string', maxLength: 200 }, { name: 'text', type: 'string', maxLength: 500000, default: '' }, Object.assign({}, LANG, { default: 'plain' }), Object.assign({}, EXP, { default: 'never' })],
  async (a) => {
    const p = await A.newPaste({ kind: 'text', title: a.title || '', body: a.text || '', language: a.language, expiry: a.expiry });
    if (!p) throw new Error('Slop Drive is not available');
    log.push({ kind: 'made', id: p.id });
    return `Made the paste “${p.title || 'Untitled paste'}” (${a.language}, ${(a.text || '').length} characters), saved to Slop Drive. Link id ${p.pasteId}.`;
  }, { description: 'Start a new text or code paste, saved to Slop Drive.' });
add('insert_text', 'Insert text', [PASTE, { name: 'text', type: 'string', maxLength: 500000, required: true }, { name: 'where', type: 'enum', values: ['end', 'start'], default: 'end' }],
  async (a) => {
    const p = textOnly(find(a.paste)), before = snap(p);
    p.body = a.where === 'start' ? a.text + (p.body ? '\n' + p.body : '') : (p.body ? p.body + '\n' : '') + a.text;
    await changed(p, before);
    return `Added ${a.text.length} characters at the ${a.where} of “${p.title || 'Untitled paste'}”.`;
  });
add('set_paste', 'Change a paste', [PASTE, { name: 'title', type: 'string', maxLength: 200 }, { name: 'text', type: 'string', maxLength: 500000, description: 'replaces the whole text' }, LANG, EXP],
  async (a) => {
    const p = find(a.paste), before = snap(p);
    if (a.text != null) textOnly(p).body = a.text;
    for (const k of ['title', 'language', 'expiry']) if (a[k] != null) p[k] = a[k];
    await changed(p, before);
    return `Changed “${p.title || 'Untitled paste'}”.`;
  });
add('delete_paste', 'Move a paste to the Trash', [PASTE], async (a) => {
  const p = find(a.paste);
  store.forget(p.id);
  await store.trash(p.id);
  S.pastes = S.pastes.filter((x) => x.id !== p.id);
  if (S.id === p.id) { S.id = null; S.pane = 'list'; }
  log.push({ kind: 'trashed', id: p.id, paste: p });
  renderAll();
  return `Moved “${p.title || 'Untitled paste'}” to the Slop Drive Trash.`;
}, { destructive: true });
add('export_paste', 'Export a paste', [PASTE, { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }, { name: 'name', type: 'string', maxLength: 120, description: 'file name without extension' }],
  async (a) => {
    const p = find(a.paste), ext = p.kind === 'image' ? (p.blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg') : EXT[p.language] || 'txt';
    const name = (a.name || p.title || 'paste-' + p.pasteId.slice(0, 6)).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.' + ext;
    const blob = p.kind === 'image' ? p.blob : new Blob([p.body], { type: 'text/plain;charset=utf-8' }), out = [];
    if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'paste' })})`);
    if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  }, { description: 'Save the paste as a file with its language\'s extension (.js, .py, .md…) to Slop Drive and/or a download.' });

function state() {
  const p = current();
  return { app: 'Paste', pastes: visible().slice(0, 40).map((x) => ({ id: x.id, title: x.title || 'Untitled paste', kind: x.kind, language: x.language, characters: (x.body || '').length })),
    open: p ? { id: p.id, title: p.title, language: p.language, text: (p.body || '').slice(0, 2000) } : null };
}
function checkpoint() {
  const mark = log.length;
  return () => {
    for (const e of log.splice(mark).reverse()) {
      if (e.kind === 'made') { const p = byId(e.id); store.forget(e.id); store.trash(e.id); S.pastes = S.pastes.filter((x) => x !== p); if (S.id === e.id) S.id = null; }
      else if (e.kind === 'changed') { const p = byId(e.id); if (p) { Object.assign(p, e.before); store.touch(p); } }
      else if (e.kind === 'trashed') { window.SlopHub.update(e.id, { trashedAt: null }); S.pastes.unshift(e.paste); }
    }
    renderAll();
    return true;
  };
}

C.register(list);
C.provide({ state, checkpoint });
