/* Slop Contacts: import and export dialogs. Import (the toolbar, the palette, the list's drop target, or a .scontacts
 * handed over from Slop Drive) goes through importFlow: CSV column mapping, then the preview (import-flow.js). Export
 * writes vCard 3.0 or 4.0 (one file or one per contact), CSV, XLSX (the shared writer, shared/sheets/write.js), Google
 * or Outlook CSV, or .scontacts, for the selection when there is one, otherwise every contact. Adds SlopContacts.io. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const el = UI.el;
  const tr = (k, v) => SC.tr(k, v);
  // the export formats; their names are the string tables' contacts.io.f_<id>
  const EXPORTS = ['vcf', 'vcf40', 'zip', 'zip40', 'csv', 'xlsx', 'google', 'outlook', 'scontacts'];

  /** Imports files: the flow reads them, maps CSV columns and shows the preview. Resolves with true when imported. */
  function importFiles(files) { return SC.importFlow.run(files); }

  /** The file picker (several files at once). */
  function importPick() {
    const ex = SlopExamples.info('contacts');
    UI.dialog({ title: tr('contacts.io.import_title'), body: el('div', null,
      el('p', { class: 'sui-p' }, tr('contacts.io.import_note')),
      el('p', { class: 'sui-p' }, tr('contacts.io.drop_note')),
      el('p', { class: 'sui-p' }, ex.note), el('p', { class: 'sui-p' }, tr('contacts.io.columns', { list: ex.columns.join(', ') })),
      el('button', { type: 'button', class: 'sui-btn', onclick: () => SlopExamples.download('contacts') }, tr('contacts.io.dl_example'))),
    buttons: [{ label: tr('menu.cancel') }, { label: tr('contacts.io.choose'), primary: true, act: async () => {
      SC.dropImport.pick(); // the intake's picker (drop-import.js); the preview is its own dialog, this one closes now
    } }] });
  }

  /** The .xlsx file from the shared XLSX writer (loaded on first use, from the page's shared folder). */
  async function xlsxFile(list) {
    const mod = await import(new URL('../shared/sheets/write.js', document.baseURI).href);
    const blob = await mod.toXlsxBlob([SC.csv.sheetOf(list, 'Contacts')]);   // i18n-ignore: file names and sheet names of the export (the user's files)
    return { blob, name: 'Contacts.xlsx' };   // i18n-ignore: file names and sheet names of the export (the user's files)
  }

  /** Downloads one export for a scope: a set of ids, or null for every contact. */
  async function exportAs(id, scopeIds) {
    const list = scopeIds ? S.list.filter((c) => scopeIds.has(c.id)) : S.list;
    if (!list.length) { UI.toast(tr('contacts.io.nothing')); return false; }
    if (id === 'scontacts') {
      UI.download(new Blob([SC.format.toScontacts(list, { cc: S.cc })], { type: SC.format.MIME }), `Contacts.${SC.format.EXT}`);   // i18n-ignore: file names and sheet names of the export (the user's files)
    } else if (id === 'xlsx') {
      const r = await xlsxFile(list);
      UI.download(r.blob, r.name);
    } else {
      const r = SC.format.exportAs(id, list, 'Contacts');   // i18n-ignore: file names and sheet names of the export (the user's files)
      UI.download(r.blob, r.name);
    }
    UI.toast(tr('contacts.io.exported', { n: list.length }));
    return true;
  }

  /** The export dialog: format and scope (the selection, when there is one). */
  function exportDialog() {
    if (!S.list.length) { UI.toast(tr('contacts.io.no_contacts')); return; }
    const hasSel = S.sel.size > 0;
    const format = UI.select(EXPORTS.map((id) => [id, tr('contacts.io.f_' + id)]), 'vcf');
    let scope = hasSel ? 'sel' : 'all';
    const radio = (value, label) => {
      const r = el('input', { type: 'radio', name: 'export-scope', value, checked: scope === value });
      r.addEventListener('change', () => { if (r.checked) scope = value; });
      return el('label', { class: 'sui-check' }, r, el('span', null, label));
    };
    const body = el('div', null, UI.field(tr('contacts.io.format'), format),
      el('div', { class: 'ed-scope' }, hasSel ? radio('sel', tr('contacts.io.selected', { n: String(S.sel.size) })) : null, radio('all', tr('contacts.io.all', { n: String(S.list.length) }))));
    UI.dialog({ title: tr('contacts.io.export_title'), body, buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.export'), primary: true, act: () => {
      exportAs(format.value, scope === 'sel' ? new Set(S.sel) : null).catch((e) => UI.toast(tr('contacts.io.failed', { why: e.message })));
      return undefined;
    } }] });
  }

  SC.io = { importFiles, importPick, exportAs, exportDialog, xlsxFile };
})();
