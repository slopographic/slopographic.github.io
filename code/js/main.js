/* Slop Code: boot. Wires the editor, the tabs, the Slop Drive tree, Run, the drawer and the commands, then
 * opens the file given by ?drive=<id> (Send to, or Open with). Files come in one way (shared/intake, spec 'code'):
 * Open from Slop Drive, ?drive=<id> and a PWA launch, a drop on the editor and a paste. Slop Code edits Slop Drive
 * files, so a file from this device is put in Slop Drive (the folder chosen in the tree) and opened from there. */
import * as docs from './docs.js';
import { newView, makeState, setHooks, setWrap, isWrap, showFind } from './editor.js';
import { initTree, refresh as refreshTree, selectedFolder, revealFolder, newFolder, folderAt } from './tree.js';
import { initLayout, expandSection } from './explorer.js';
import { renderExtensions, formatDoc, chooseLanguage } from './extensions.js';
import { toggleFmt, copyFmt, syncFmt, initFmt, fmtView } from './fmtpane.js';
import { initSearch, focusSearch } from './search.js';
import { openKinds } from './findkinds.js';
import { chooseEncoding, chooseEol } from './encops.js';
import { $, env, setHandlers, renderChrome, setStatus, setTreeOpen, treeOpen, setPreview, toast, isPhone, initDrawer } from './ui.js';
import { openRecord, saveDoc, saveAs, newFile, closeDoc, onEdit, showDoc, restoreTabs, togglePreview } from './ops.js';
import { uniqueName } from './drive.js';
import { runDoc, attachPreview, canRun } from './run.js';
import { registerCommands } from './commands.js';
import { t, onLang } from './dom.js';

function registerIntake() {
  window.SlopIntake.register({
    id: 'code', accept: { any: true, allowEmpty: true, noun: 'code.app.a_file' },
    process: async (file, ctx) => {
      let rec = ctx.drive && ctx.drive.record;
      if (!rec) {
        // a drop on a folder in the Explorer saves into that folder (null: the root); otherwise the folder chosen in the tree
        const folderId = ctx.data && 'folderId' in ctx.data ? ctx.data.folderId : selectedFolder() || null;
        rec = await SlopHub.get(await SlopHub.put(file, { name: await uniqueName(file.name, folderId), from: 'code', folderId }));
      }
      if (ctx.source === 'launch' && rec.folderId) revealFolder(rec.folderId);
      await openRecord(rec);
      return rec.id;
    },
  });
  window.SlopIntake.dropTarget(document.querySelector('.cd-main'), { to: 'code' });
  window.SlopIntake.dropTarget(document.getElementById('cd-tree-list'), { to: 'code', data: (e) => ({ folderId: folderAt(e.target) }) });
  // a drop anywhere else on the page (the toolbar, the Explorer's headings) is taken by the shared page-wide handler (shared/intake/sources.js)
}
const openPicker = () => window.SlopIntake.fromDrive({ to: 'code', title: t('code.app.drive_title') });
async function runCurrent() {
  const d = docs.current();
  if (!d) { toast(t('code.toast.open_first')); return; }
  if (d.kind !== 'text' || !canRun(d.name)) { toast(t('code.toast.run_only')); return; }
  setPreview(true);
  await runDoc(d, docs.textOf(d), (id) => { const o = docs.find(id); return o ? docs.textOf(o) : undefined; });
}
function toggleWrap() {
  setWrap(env.view, !isWrap());
  setStatus();
  toast(t(isWrap() ? 'code.toast.wrap_on' : 'code.toast.wrap_off'));
}
const toggleFiles = () => setTreeOpen(!treeOpen());
/** Show the sidebar with the Extensions section open, and put focus on the first helper. */
function showExtensions() {
  setTreeOpen(true);
  expandSection('ext');
  const first = document.getElementById('cd-ext-formatter');
  if (first) first.focus();
}

/** Find (Ctrl+F) and Replace (Ctrl+H) in whatever is on screen: the editor, the formatted pane when it has focus, or the find box of a
 * bytes view or a database table. A view that is read only has nothing to replace. */
function findHere(replace) {
  const d = docs.current();
  if (d && d.kind !== 'text') {
    const input = $('cd-viewer') && $('cd-viewer').querySelector('.cd-hex-findbox, .sfv-find-in');
    if (replace) { toast(t('code.search.read_only')); return false; }
    if (!input) return false;
    input.focus(); if (input.select) input.select();
    return true;
  }
  const pane = fmtView();
  if (pane && $('cd-fmt-body').contains(document.activeElement)) { showFind(pane, false); return true; }
  return !!env.view && (showFind(env.view, replace), true);
}

/** The actions the commands and buttons call. */
const ACTIONS = {
  open: openPicker,
  new: () => newFile(selectedFolder()),
  save: () => saveDoc(),
  saveAs: () => saveAs(),
  close: () => closeDoc(),
  find: () => findHere(false),
  replace: () => findHere(true),
  findFiles: () => focusSearch(setTreeOpen),
  kinds: openKinds,
  wrap: toggleWrap,
  files: toggleFiles,
  run: runCurrent,
  newFolder: () => newFolder(selectedFolder()),
  format: formatDoc,
  language: chooseLanguage,
  extensions: showExtensions,
  markdown: () => togglePreview(),
  fmtview: () => { const on = toggleFmt(); renderExtensions($('cd-ext-list')); return on; },
  copyFmt,
  encoding: chooseEncoding,
  eol: chooseEol,
};

function wireButtons() {
  const on = (id, fn) => $(id).addEventListener('click', fn);
  on('cd-open', openPicker); on('cd-empty-open', openPicker);
  on('cd-new', () => ACTIONS.new()); on('cd-empty-new', () => ACTIONS.new()); on('cd-tree-new', () => ACTIONS.new());
  on('cd-save', () => saveDoc()); on('cd-saveas', () => saveAs());
  on('cd-run', runCurrent);
  on('cd-md', () => togglePreview());
  on('cd-cmd', () => (window.SlopCmd && SlopCmd.open ? SlopCmd.open() : toast(t('code.toast.no_cmds'))));
  on('cd-files', () => { if (!isPhone()) toggleFiles(); });   // on a phone it is the drawer's own toggle
  on('cd-tree-folder', () => newFolder(selectedFolder()));
  on('cd-pv-close', () => setPreview(false));
}

async function boot() {
  SlopHub.register('code');
  registerIntake();
  initLayout();
  initDrawer();
  setTreeOpen(treeOpen()); // keeps the Files button's aria-expanded in step with what is shown
  const view = newView($('cd-editor'), makeState('', 'untitled.txt'));
  env.view = view;
  docs.attachView(view);
  setHooks({ change: () => { onEdit(); syncFmt(); }, select: () => setStatus() });
  setHandlers({ select: (d) => showDoc(d), close: (d) => closeDoc(d) });
  attachPreview($('cd-frame'), $('cd-console'));
  initTree($('cd-tree-list'), {
    // Opening a file keeps the sidebar where it is. Only the phone drawer closes, since it covers the editor.
    onOpen: (rec) => { openRecord(rec); if (isPhone()) setTreeOpen(false); },
    onNew: (folderId) => newFile(folderId),
    onRenamed: (rec) => { docs.rename(rec.id, rec.name); renderChrome(); },
    onMoved: (rec) => { docs.rename(rec.id, rec.name); const d = docs.find(rec.id); if (d) d.folderId = rec.folderId ?? null; renderChrome(); },
    onTrashed: () => {},
  });
  renderExtensions($('cd-ext-list'));
  wireButtons();
  initFmt();
  initSearch();
  registerCommands(ACTIONS);
  // a language change: the tabs, the status bar, the helpers and the tree again, in the new language
  onLang(() => { renderChrome(); renderExtensions($('cd-ext-list')); refreshTree(); });
  await refreshTree();
  await restoreTabs();
  await window.SlopIntake.launch({ to: 'code' });
  renderChrome();
  document.body.classList.add('ready');
}

window.SlopCode = { view: () => env.view, docs, openRecord, saveDoc, saveAs, newFile, closeDoc, runCurrent, refreshTree, actions: ACTIONS };
// Convert… in the header (shared/convert/provided.js): the open file (its live text, or a viewer tab's Drive file).
addEventListener('slop:convert-files', (e) => e.detail.provide(async () => {
  const d = docs.current();
  if (!d) return null;
  if (d.kind === 'text' || !d.kind) return [{ name: d.name, blob: new Blob([docs.textOf(d)], { type: 'text/plain' }) }];
  const rec = d.id && window.SlopHub ? await SlopHub.get(d.id).catch(() => null) : null;
  return rec && rec.blob ? [{ name: rec.name || d.name, blob: rec.blob }] : null;
}));
boot().catch((e) => { console.error(e); toast(t('code.toast.start_failed', { error: e.message })); document.body.classList.add('ready'); });
