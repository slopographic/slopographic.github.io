/* Slop Code: the Explorer's folder tree, over the Slop Drive folders and files (Trash hidden). Click a folder to
 * open or close it (it becomes the selected folder for New), click a file to open it. Drag a row onto a folder to
 * move it (drop on empty space for the root). Right-click (or the Menu key) for New, Open, Rename, Move to, Copy path
 * and Delete. Arrow keys move between rows. On a phone the tree is a drawer. */
import { el, t } from './dom.js';
import { tree as loadTree, pathOf, uniqueName } from './drive.js';
import { askTrash } from './dialogs.js';

const KEY = 'slop-code.open-folders';
const H = () => window.SlopHub;
let host = null, cb = null, rows = [], byKey = new Map();
let cache = { folders: [], files: [] }; // the last read of Drive, so a toggle redraws without reading again
let expanded = readExpanded();
let selected = null; // folder id of the last folder clicked (null: the root)
let activeId = null;
let dragging = null; // the row being dragged

function readExpanded() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); }
}
function saveExpanded() {
  try { localStorage.setItem(KEY, JSON.stringify([...expanded])); } catch (e) { /* not kept */ }
}
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** Wire the tree. callbacks: onOpen(rec), onNew(folderId), onRenamed(rec), onMoved(rec), onTrashed(rec). */
export function initTree(listEl, callbacks) {
  host = listEl; cb = callbacks;
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = [...host.querySelectorAll('.cd-row')], i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
  host.addEventListener('dragstart', (e) => {
    const r = rowOf(e.target);
    if (!r) return;
    dragging = r;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', r.rec.name); } catch (err) { /* not kept */ } }
  });
  host.addEventListener('dragend', () => { dragging = null; clearDrop(); });
  host.addEventListener('dragover', (e) => {
    if (!dragging) return;
    const target = dropTarget(e.target);
    clearDrop();
    if (!canMove(dragging, target)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const btn = e.target.closest ? e.target.closest('.cd-row') : null;
    if (btn) btn.classList.add('drop');
  });
  host.addEventListener('drop', (e) => { // intake-ok: a row of the tree moved to another folder, not a file
    if (!dragging) return;
    const r = dragging, target = dropTarget(e.target);
    dragging = null; clearDrop();
    if (!canMove(r, target)) return;
    e.preventDefault();
    moveTo(r, target);
  });
  if (window.SlopHub && SlopHub.on) SlopHub.on('drive:change', () => refresh());
  if (window.SlopCtx) SlopCtx.bind(host, resolveMenu);
}

/** Read Drive and redraw. */
export async function refresh() {
  cache = await loadTree();
  build();
}

/** Flatten the cached folders and files into rows, following the open folders. */
function build() {
  const { folders, files } = cache;
  rows = [];
  const walk = (parentId, depth) => {
    for (const f of folders.filter((x) => (x.parentId ?? null) === parentId).sort(byName)) {
      rows.push({ kind: 'folder', rec: f, depth, key: 'd:' + f.id });
      if (expanded.has(f.id)) walk(f.id, depth + 1);
    }
    for (const f of files.filter((x) => (x.folderId ?? null) === parentId).sort(byName)) rows.push({ kind: 'file', rec: f, depth, key: 'f:' + f.id });
  };
  walk(null, 0);
  draw();
}

function draw() {
  byKey = new Map(rows.map((r) => [r.key, r]));
  const nodes = rows.map((r) => {
    const isFolder = r.kind === 'folder';
    const open = isFolder && expanded.has(r.rec.id);
    const isSel = isFolder && r.rec.id === selected;
    const isOn = r.kind === 'file' && r.rec.id === activeId;
    return el('button', { type: 'button', class: 'cd-row' + (isOn ? ' on' : '') + (isSel ? ' sel' : '') + (isFolder ? ' cd-dir' : ''),
      'data-key': r.key, draggable: 'true', style: `padding-left:${8 + r.depth * 14}px`, title: r.rec.name,
      'aria-expanded': isFolder ? (open ? 'true' : 'false') : null, 'aria-selected': isSel ? 'true' : null,
      'aria-current': isOn ? 'true' : null, onclick: () => activate(r) },
      el('span', { class: 'cd-ic', 'aria-hidden': 'true' }, isFolder ? (open ? '▾' : '▸') : extLabel(r.rec.name)),
      el('span', { class: 'cd-nm' }, r.rec.name));
  });
  host.replaceChildren(...(nodes.length ? nodes : [el('p', { class: 'cd-hint' }, t('code.tree.empty'))]));
}
const extLabel = (name) => { const m = /\.([^.]+)$/.exec(name); return m ? m[1].slice(0, 4).toUpperCase() : '·'; };

function activate(r) {
  if (r.kind === 'folder') {
    selected = r.rec.id;
    if (expanded.has(r.rec.id)) expanded.delete(r.rec.id); else expanded.add(r.rec.id);
    saveExpanded();
    build();
    return;
  }
  cb.onOpen(r.rec);
}

/** Mark the open file in the tree. */
export function setActive(id) { activeId = id; for (const b of host.querySelectorAll('.cd-row')) { const on = b.dataset.key === 'f:' + id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); } }
/** The folder for New: the last folder clicked, or the root. */
export const selectedFolder = () => selected;
/** Open every folder above `id` so a file in it shows in the tree. */
export function revealFolder(id) {
  for (let f = id, n = 0; f && n < 64; n++) {
    expanded.add(f);
    const folder = cache.folders.find((x) => x.id === f);
    f = folder ? folder.parentId ?? null : null;
  }
  saveExpanded();
  build();
}

/* ---------- drag and move ---------- */
const rowOf = (node) => { const b = node && node.closest ? node.closest('[data-key]') : null; return b ? byKey.get(b.dataset.key) || null : null; };
/** The folder a drop lands in: the folder row, the folder of a file row, or the root (null) on empty space. */
function dropTarget(node) {
  const r = rowOf(node);
  if (!r) return null;
  return r.kind === 'folder' ? r.rec.id : (r.rec.folderId ?? null);
}
const clearDrop = () => { if (host) for (const b of host.querySelectorAll('.drop')) b.classList.remove('drop'); };
/** Is `id` the folder `ancestor` or inside it? */
function within(id, ancestor) {
  for (let f = id, n = 0; f && n < 64; n++) {
    if (f === ancestor) return true;
    const fo = cache.folders.find((x) => x.id === f);
    f = fo ? fo.parentId ?? null : null;
  }
  return false;
}
/** A file can go anywhere. A folder cannot go into itself or into one of its own folders. */
const canMove = (r, target) => r.kind !== 'folder' || (target !== r.rec.id && !within(target, r.rec.id));

/** Move a row into `target` (null: the root). A file that clashes gets a free name, as New does. */
async function moveTo(r, target) {
  const parent = target ?? null;
  if (!canMove(r, parent)) { SlopUI.toast(t('code.tree.no_self')); return; }
  if (r.kind === 'folder') {
    if ((r.rec.parentId ?? null) === parent) return;
    await H().updateFolder(r.rec.id, { parentId: parent });
  } else {
    if ((r.rec.folderId ?? null) === parent) return;
    const name = await uniqueName(r.rec.name, parent);
    const out = await H().update(r.rec.id, { folderId: parent, name });
    if (out && cb.onMoved) cb.onMoved(out);
  }
  if (parent) expanded.add(parent);
  saveExpanded();
  await refresh();
}

/** Move through a folder picker (the touch-friendly way; drag is for a mouse). */
async function moveDialog(r) {
  const folderId = await H().pickFolder({ title: t('code.tree.move_to', { name: r.rec.name }), ok: t('code.tree.move_here'),
    start: (r.kind === 'folder' ? r.rec.parentId : r.rec.folderId) ?? null, exclude: r.kind === 'folder' ? [r.rec.id] : [] });
  if (folderId === undefined) return;
  await moveTo(r, folderId);
}

/* ---------- right-click menu ---------- */
function resolveMenu(target) {
  const btn = target && target.closest ? target.closest('[data-key]') : null;
  const r = btn ? byKey.get(btn.dataset.key) : null;
  const folderId = r ? (r.kind === 'folder' ? r.rec.id : (r.rec.folderId ?? null)) : selected;
  const newSub = [
    { label: t('code.tree.file'), act: () => cb.onNew(folderId) },
    { label: t('code.tree.folder'), act: () => newFolder(folderId) },
  ];
  if (!r) return [{ label: t('code.app.new'), sub: newSub }];
  if (r.kind === 'folder') {
    const open = expanded.has(r.rec.id);
    return [{ label: open ? t('menu.close') : t('menu.open'), act: () => activate(r) }, { label: t('code.app.new'), sub: newSub }, '-',
      { label: t('ui.rename_dots'), act: () => rename(r) }, { label: t('code.tree.move'), act: () => moveDialog(r) }, { label: t('code.tree.copy_path'), act: () => copyPath(r) },
      '-', { label: t('code.tree.delete'), act: () => remove(r) }];
  }
  return [{ label: t('menu.open'), act: () => cb.onOpen(r.rec) }, { label: t('code.app.new'), sub: newSub }, '-',
    { label: t('ui.rename_dots'), act: () => rename(r) }, { label: t('code.tree.move'), act: () => moveDialog(r) }, { label: t('code.tree.copy_path'), act: () => copyPath(r) },
    '-', { label: t('code.tree.delete'), act: () => remove(r) }];
}

/** New folder in `parentId` (null: the root). It becomes the selected folder. */
export async function newFolder(parentId) {
  const name = await SlopUI.prompt(t('code.tree.new_folder'), t('code.tree.folder_name'), t('code.tree.new_folder'), { ok: t('code.dlg.create') });
  if (!name || !name.trim()) return;
  const id = await H().createFolder(name.trim(), parentId ?? null);
  if (parentId) expanded.add(parentId);
  expanded.add(id); saveExpanded();
  selected = id;
  await refresh();
}

async function rename(r) {
  const name = await SlopUI.prompt(t('ui.rename'), t('code.dlg.name'), r.rec.name, { ok: t('ui.rename') });
  if (!name || !name.trim() || name.trim() === r.rec.name) return;
  const next = name.trim();
  if (r.kind === 'folder') await H().updateFolder(r.rec.id, { name: next });
  else { const out = await H().update(r.rec.id, { name: next }); if (out) cb.onRenamed(out); }
  await refresh();
}

async function copyPath(r) {
  const p = r.kind === 'folder' ? await pathOf(r.rec.parentId ?? null, r.rec.name) : await pathOf(r.rec.folderId ?? null, r.rec.name);
  try { await navigator.clipboard.writeText(p); SlopUI.toast(t('code.tree.copied', { path: p })); } catch (e) { SlopUI.toast(p); }
}

async function remove(r) {
  if (!(await askTrash(r.rec.name, r.kind === 'folder'))) return;
  const stamp = { trashedAt: Date.now() };
  if (r.kind === 'folder') await H().updateFolder(r.rec.id, stamp);
  else await H().update(r.rec.id, stamp);
  cb.onTrashed(r.rec, r.kind);
  await refresh();
}
