/* Paste: boot. Loads the pastes from Slop Drive, opens the paste named by ?paste=<id> (a share link) or the one
 * open last (SlopSession), and wires the screen, the paste handler, the menus, the commands and the save indicator. */
import * as store from './store.js';
import { S } from './state.js';
import * as A from './actions.js';
import { renderAll, wireView, relabel } from './view.js';
import { registerCommands, resolveMenu } from './commands.js';
import { $, t, onLang } from './dom.js';

function wire() {
  $('pb-new').addEventListener('click', () => A.newPaste({ kind: 'text' }));
  $('pb-add-img').addEventListener('click', () => A.addImage());
  $('pb-side-btn').addEventListener('click', () => A.setPane('list'));
  $('pb-cmd').addEventListener('click', () => { if (window.SlopCmd && SlopCmd.open) SlopCmd.open(); });
  $('pb-link-copy').addEventListener('click', () => {
    const v = $('pb-link').value;
    navigator.clipboard.writeText(v).then(() => SlopUI.toast(t('paste.toast.link_copied')), () => { $('pb-link').select(); SlopUI.toast(t('paste.toast.select_link')); });
  });
  wireView(A);
  A.registerIntake();
  document.addEventListener('paste', (e) => A.onPaste(e)); // intake-ok: pasted text (a pasted picture is the intake's)
  if (window.SlopCtx) SlopCtx.bind($('pb-app'), resolveMenu);
}

/** The save indicator, and the guard that asks before leaving while a paste is not yet in Slop Drive. */
function wireSaves() {
  let last = null;
  const show = (state, err) => {
    const box = $('pb-save');
    box.dataset.state = state;
    box.textContent = state === 'saving' ? t('paste.save.saving') : state === 'saved' ? t('paste.save.saved') : t('paste.save.failed', { msg: (err && err.message) || t('paste.save.unavailable') });
  };
  store.onSaveState((state, err) => {
    last = [state, err];
    show(state, err);
    if (window.SlopGuard) SlopGuard.setUnsaved('paste', store.hasPending());
  });
  onLang(() => { if (last) show(...last); relabel(); });   // a language change: the save line, the list and the selects
  addEventListener('pagehide', () => { store.flush(); });
}

async function openStart() {
  const link = new URL(location.href).searchParams.get('paste');
  if (link) { A.openLink(link); return; }
  let last = null;
  try { last = await SlopSession.load('paste', 'last', null); } catch (e) { last = null; }
  if (last && last.id && S.pastes.some((p) => p.id === last.id)) A.open(last.id);
}

async function boot() {
  SlopHub.register('paste');
  wire();
  wireSaves();
  registerCommands();
  try {
    S.pastes = await store.load();
    await openStart();
    // First visit (nothing saved yet): open a new paste straight away, so the editor is ready to type in.
    if (!S.pastes.length && !S.id) await A.newPaste({ kind: 'text' });
  } catch (e) {
    SlopUI.toast(t('paste.toast.read_failed', { msg: e.message }));
  }
  renderAll();
  document.body.classList.add('ready');
}

boot();
