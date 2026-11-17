/* Slop Notes: boot. Reads the notebooks, folders and notes from Slop Drive, reopens the notes that were open (their tabs,
 * tabs.js), and wires the screen, the menus, the commands and the save indicator. Saves run in the background. */
import * as store from './store.js';
import * as tabs from './tabs.js';
import { S, curNote } from './state.js';
import * as A from './actions.js';
import { renderSide } from './side.js';
import { renderList } from './list.js';
import { renderEditor, wireEditor } from './editor.js';
import { resolveMenu, exportMenu, renameFocused } from './menus.js';
import { blockItems } from './blocks.js';
import { registerCommands } from './commands.js';
import { $, t, onLang } from './dom.js';

function refresh() {
  renderSide();
  renderList();
  renderEditor();
  $('nt-app').dataset.pane = S.pane;
  tabs.refresh();
}
A.setRedraw(refresh);

function wire() {
  const on = (id, fn) => $(id).addEventListener('click', fn);
  on('nt-new', () => A.newNote());
  on('nt-nb-new', () => A.newNotebook());
  on('nt-fd-new', () => A.newFolder());
  // On a phone the notebooks are a drawer from the start edge: SlopSheet (shared/ui/sheet.js) makes Notebooks (View menu)
  // its toggle and gives it the ×, Escape, a tap outside and a swipe left. Wired before the app's keys.
  A.setSide(SlopSheet.attach({ root: $('nt-app'), panel: $('nt-side'), side: 'start', phone: '(max-width: 899px)', toggles: [$('nt-side-btn')], label: t('notes.app.notebooks') }));
  on('nt-del', () => { const n = curNote(); if (n) A.remove(n); });
  on('nt-cmd', () => { if (window.SlopCmd && SlopCmd.open) SlopCmd.open(); });
  $('nt-insert').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    SlopUI.menu(blockItems(), r.left, r.bottom + 4);
  });
  $('nt-app').addEventListener('keydown', (e) => { if (e.key === 'F2' && renameFocused(e.target)) e.preventDefault(); });
  $('nt-export').addEventListener('click', (e) => {
    const items = exportMenu();
    if (!items) return;
    const r = e.currentTarget.getBoundingClientRect();
    SlopUI.menu(items, r.left, r.bottom + 4);
  });
  $('nt-q').addEventListener('input', (e) => { S.query = e.target.value; renderList(); });
  wireEditor({ list: () => { renderList(); tabs.refresh(); }, side: renderSide }); // a typed title also renames the tab
  if (window.SlopCtx) SlopCtx.bind($('nt-app'), resolveMenu);
}

/** The save indicator, and the guard that asks before leaving while a change is not yet in Slop Drive. */
function wireSaves() {
  let last = null;
  const say = (state, err) => {
    const box = $('nt-save');
    box.textContent = state === 'saving' ? t('notes.app.saving') : state === 'saved' ? t('notes.app.saved') : t('notes.app.not_saved', { error: (err && err.message) || t('notes.app.drive_off') });
  };
  onLang(() => { if (last) say(...last); });   // the indicator again, in the new language
  store.onSaveState((state, err) => {
    last = [state, err];
    $('nt-save').dataset.state = state;
    say(state, err);
    if (window.SlopGuard) SlopGuard.setUnsaved('notes', store.hasPending());
    tabs.refresh();
    if (state === 'saved') tabs.flush();
  });
  addEventListener('pagehide', () => { store.flush(); });
}

async function boot() {
  SlopHub.register('notes');
  wire();
  wireSaves();
  registerCommands();
  onLang(refresh);   // a language change: the sidebar, the list and the note's buttons again
  const session = tabs.init({ redraw: refresh });
  try {
    Object.assign(S, await store.load());
  } catch (e) {
    SlopUI.toast(t('notes.app.read_failed', { error: e.message }));
  }
  await tabs.restore(session);   // the notes that were open, if they are still in Slop Drive
  refresh();
  document.body.classList.add('ready');
}

/** Convert… in the header (shared/convert/provided.js): the open note, as Markdown. */
addEventListener('slop:convert-files', (e) => e.detail.provide(async () => {
  const n = curNote();
  if (!n) return null;
  const { noteToMarkdown, fileBase } = await import('./export.js');
  return [{ name: fileBase(n.title) + '.md', blob: noteToMarkdown(n) }];
}));

boot();
