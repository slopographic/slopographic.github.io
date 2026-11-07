/* Slop Contacts: one import from files (dropped or chosen). CSV files go through the column mapping first, then every
 * file's contacts go to the preview together. A cancelled mapping imports nothing. Adds SlopContacts.importFlow.run(files). */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const UI = window.SlopUI;

  /** Reads the files and shows the preview. Resolves with true when contacts were imported. */
  async function run(files) {
    const parts = [], names = [], errors = [];
    for (const f of files) {
      try {
        const r = await SC.importPlan.readFile(f);
        if (r.kind === 'csv') {
          const contacts = await SC.importMap.dialog(r.name, r);
          if (contacts === null) return false;
          parts.push(...contacts);
        } else parts.push(...r.contacts);
        names.push(r.name);
      } catch (e) {
        errors.push(`${(f && f.name) || SC.tr('contacts.imp.a_file')}: ${e.message}.`);
      }
    }
    if (!parts.length) {
      UI.alert(SC.tr('contacts.imp.nothing'), errors.join(' ') || SC.tr('contacts.imp.none_found'));
      return false;
    }
    return SC.importPreview.show(parts, names.length === 1 ? names[0] : SC.tr('contacts.imp.n_files', { n: names.length }), errors);
  }

  SC.importFlow = { run };
})();
