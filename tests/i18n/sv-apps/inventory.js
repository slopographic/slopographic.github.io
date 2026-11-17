/* Slop Inventory in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: inventory/js/core/count.js, inventory/js/core/csv.js, inventory/js/core/import.js, inventory/js/core/pricelist.js, inventory/js/core/scan.js, inventory/js/core/stock-ops.js, inventory/js/core/util.js, inventory/js/scan/camera.js, inventory/js/ui/app.js, inventory/js/ui/commands.js, inventory/js/ui/count.js, inventory/js/ui/import.js, inventory/js/ui/prices.js, inventory/js/ui/product-form.js, inventory/js/ui/products.js, inventory/js/ui/reports.js, inventory/js/ui/scan-view.js, inventory/js/ui/stock.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'inventory',
  ready: '#pAdd',
  sv: [['#pAdd', 'Lägg till produkt'], ['#tab-products', 'Produkter'], ['#tab-count', 'Inventering'], ['#pSearch', 'Sök artikelnr, EAN eller namn', 'placeholder'],
    ['#pFilter option[value="low"]', 'Bara lågt lager'], ['.smb-app', 'Lager']],
  en: [['#pAdd', 'Add product'], ['#tab-count', 'Count']],
}]);
