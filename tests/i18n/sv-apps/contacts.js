/* Slop Contacts in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: contacts/js/app/card-edit.js, contacts/js/app/card-read.js, contacts/js/app/card.js, contacts/js/app/commands.js, contacts/js/app/drive-load.js, contacts/js/app/drive-save.js, contacts/js/app/drop-import.js, contacts/js/app/filter-panel.js, contacts/js/app/groups.js, contacts/js/app/import-flow.js, contacts/js/app/import-map.js, contacts/js/app/import-preview.js, contacts/js/app/io-dialogs.js, contacts/js/app/keys.js, contacts/js/app/list.js, contacts/js/app/main.js, contacts/js/app/new-contact.js, contacts/js/app/photo-ui.js, contacts/js/app/records.js, contacts/js/app/select.js, contacts/js/app/state.js, contacts/js/app/table.js, contacts/js/app/tools-dialogs.js, contacts/js/core/csv-map.js, contacts/js/core/csv-read.js, contacts/js/core/csv-write.js, contacts/js/core/customer-map.js, contacts/js/core/dedupe.js, contacts/js/core/filters.js, contacts/js/core/format.js, contacts/js/core/model.js, contacts/js/core/table-model.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'contacts',
  ready: '#groups .grp',
  sv: [['#listTitle', 'Alla kontakter'], ['#btnSelect', 'Markera'], ['[data-view="table"]', 'Tabell'], ['#search', 'Sök', 'placeholder'],
    ['#empty .empty-h', 'Inga kontakter än'], ['#groups .grp-h', 'Bibliotek']],
  en: [['#listTitle', 'All Contacts'], ['#groups .grp-h', 'Library']],
}]);
