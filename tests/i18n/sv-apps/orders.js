/* Slop Orders in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: orders/js/core/actions.js, orders/js/core/fulfil.js, orders/js/core/orders.js, orders/js/core/pdf.js, orders/js/core/util.js, orders/js/ui/commands.js, orders/js/ui/delivery.js, orders/js/ui/editor.js, orders/js/ui/list.js, orders/js/ui/page.js, shared/tour/tours/orders.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'orders',
  ready: '#oNew',
  sv: [['#oNew', 'Ny order'], ['#tab-list', 'Order'], ['#oSearch', 'Sök nummer, kund eller anteckningar', 'placeholder'], ['#tab-data', 'Data'],
    ['#oStatus option[value="open"]', 'Bekräftad'], ['.smb-app', 'Order']],
  en: [['#oNew', 'New order'], ['#oStatus option[value="open"]', 'Confirmed']],
}]);
