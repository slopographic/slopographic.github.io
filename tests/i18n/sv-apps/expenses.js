/* Slop Expenses in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: expenses/js/core/expenses.js, expenses/js/core/mileage.js, expenses/js/ui/app.js, expenses/js/ui/commands.js, expenses/js/ui/editor.js, expenses/js/ui/list.js, expenses/js/ui/mileage.js, expenses/js/ui/pay.js, expenses/js/ui/receipt.js, expenses/js/ui/summary.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'expenses',
  ready: '#xNew',
  sv: [['#xNew', 'Ny utgift'], ['#tab-list', 'Utgifter'], ['#tab-summary', 'Sammanställning'], ['#xSearch', 'Sök leverantör, beskrivning eller anteckningar', 'placeholder'],
    ['#xStatus option[value="owed"]', 'Att betala'], ['#xMileage', 'Milersättning…'], ['.smb-app', 'Utgifter']],
  en: [['#xNew', 'New expense'], ['#tab-summary', 'Summary']],
}]);
