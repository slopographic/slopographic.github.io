/* Slop Purchases in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: purchases/js/core/pdf.js, purchases/js/core/purchases.js, purchases/js/core/util.js, purchases/js/ui/app.js, purchases/js/ui/commands.js, purchases/js/ui/editor.js, purchases/js/ui/list.js, purchases/js/ui/page.js, purchases/js/ui/reorder.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'purchases',
  ready: '#pNew',
  sv: [['#pNew', 'Ny inköpsorder'], ['#tab-list', 'Inköpsorder'], ['#pSearch', 'Sök nummer, leverantör eller anteckningar', 'placeholder'], ['#tab-data', 'Data'],
    ['.smb-app', 'Inköpsorder']],
  en: [['#pNew', 'New purchase order'], ['#tab-list', 'Purchase orders']],
}]);
