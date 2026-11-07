/* Slop Code: the SlopUI dialogs (never a browser alert or confirm). */
import { el, t } from './dom.js';
import { LANGS, languageById, withExt, langLabel } from './lang.js';

const UI = () => window.SlopUI;

/** New file: a type (it sets the extension and the language) and a name. Resolves { name, lang } or null. */
export function askNewFile(folderLabel, startId = 'javascript') {
  return new Promise((res) => {
    let picked = null;
    const sel = UI().select(LANGS.map((l) => [l.id, langLabel(l)]), startId);
    const name = el('input', { class: 'sui-input', type: 'text', value: withExt('untitled', languageById(startId)),
      'aria-label': t('code.dlg.file_name'), spellcheck: 'false', autocomplete: 'off' });
    sel.addEventListener('change', () => { name.value = withExt(name.value, languageById(sel.value)); });
    const body = el('div', null, UI().field(t('code.dlg.type'), sel), UI().field(t('code.dlg.name'), name),
      el('p', { class: 'sui-p cd-note' }, t('code.dlg.saved_in', { folder: folderLabel })));
    UI().dialog({ title: t('code.dlg.new_file'), body, buttons: [{ label: t('menu.cancel') }, { label: t('code.dlg.create'), primary: true, act: () => {
      const v = name.value.trim();
      if (!v) { name.focus(); return false; }
      const lang = languageById(sel.value);
      picked = { name: withExt(v, lang), lang };
    } }], onClose: () => res(picked) });
  });
}

/** The document has unsaved changes. Resolves 'save', 'discard' or 'cancel' (Escape is cancel). */
export function askUnsaved(name) {
  return new Promise((res) => {
    let choice = 'cancel';
    UI().dialog({ title: t('code.dlg.unsaved'), body: t('code.dlg.unsaved_body', { name }), buttons: [
      { label: t('menu.cancel') },
      { label: t('code.dlg.discard'), danger: true, act: () => { choice = 'discard'; } },
      { label: t('menu.save'), primary: true, act: () => { choice = 'save'; } },
    ], onClose: () => res(choice) });
  });
}

/** Resolves true when the user confirms the move to the Trash. */
export const askTrash = (name, isFolder) => UI().confirm(t('code.dlg.delete_q', { name }),
  t(isFolder ? 'code.dlg.delete_folder' : 'code.dlg.delete_file'),
  t('ui.delete'), { danger: true });

/** Language mode: the language for the open file. Resolves the language id, or null on Cancel. */
export function askLanguage(curId) {
  return new Promise((res) => {
    let picked = null;
    const sel = UI().select(LANGS.map((l) => [l.id, langLabel(l)]), curId);
    const body = el('div', null, UI().field(t('code.dlg.language'), sel),
      el('p', { class: 'sui-p cd-note' }, t('code.dlg.language_note')));
    UI().dialog({ title: t('code.dlg.language_mode'), body, buttons: [{ label: t('menu.cancel') }, { label: t('code.dlg.set'), primary: true, act: () => { picked = sel.value; } }],
      onClose: () => res(picked) });
  });
}
