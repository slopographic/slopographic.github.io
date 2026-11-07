/* Slop Invoices in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: invoices/js/core/context.js, invoices/js/core/invoices.js, invoices/js/core/util.js, invoices/js/ui/commands.js, invoices/js/ui/credit-dialog.js, invoices/js/ui/credit-note.js, invoices/js/ui/editor.js, invoices/js/ui/list.js, invoices/js/ui/page.js, invoices/js/ui/payment-dialog.js, invoices/js/ui/preview.js, invoices/js/ui/reminder.js, invoices/js/ui/repeat-dialog.js, invoices/js/ui/repeat.js, invoices/js/ui/statement.js, shared/tour/tours/invoices.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'invoices',
  ready: '#iNew',
  sv: [['#iNew', 'Ny faktura'], ['#tab-list', 'Fakturor'], ['#iSearch', 'Sök nummer, kund eller anteckningar', 'placeholder'], ['#tab-data', 'Data'],
    ['#iStatus option[value="void"]', 'Makulerad'], ['#iFromOrder', 'Från en order…'], ['.smb-app', 'Fakturor']],
  en: [['#iNew', 'New invoice'], ['#iStatus option[value="void"]', 'Void']],
}]);
