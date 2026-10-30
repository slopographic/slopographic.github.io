/* Slop CRM in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: crm/js/core/contacts-import.js, crm/js/core/customer-fields.js, crm/js/core/customers.js, crm/js/core/labels.js, crm/js/core/util.js, crm/js/ui/app.js, crm/js/ui/board.js, crm/js/ui/bulk.js, crm/js/ui/commands.js, crm/js/ui/detail.js, crm/js/ui/followups.js, crm/js/ui/form-parts.js, crm/js/ui/form.js, crm/js/ui/groups-panel.js, crm/js/ui/import.js, crm/js/ui/list.js, crm/js/ui/menu.js, crm/js/ui/sidebar.js, crm/js/ui/tag-manager.js, shared/tour/tours/crm.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'crm',
  ready: '#cSide .side-item',
  sv: [['#tab-customers', 'Kunder'], ['#tab-pipeline', 'Säljtratt'], ['#cAdd', 'Lägg till kund'], ['#cSearch', 'Sök namn, e-post, telefon eller adress', 'placeholder'],
    ['#cSide .side-name', 'Alla kunder'], ['.smb-app', 'Kundregister']],
  en: [['#tab-customers', 'Customers'], ['#cSide .side-name', 'All customers']],
}]);
