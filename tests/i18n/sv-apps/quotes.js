/* Slop Quotes in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: quotes/js/core/pdf.js, quotes/js/core/quotes.js, quotes/js/core/util.js, quotes/js/ui/commands.js, quotes/js/ui/editor.js, quotes/js/ui/list.js, quotes/js/ui/page.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'quotes',
  ready: '#qNew',
  sv: [['#qNew', 'Ny offert'], ['#tab-list', 'Offerter'], ['#qSearch', 'Sök nummer, kund eller anteckningar', 'placeholder'], ['#tab-data', 'Data'],
    ['.smb-app', 'Offerter']],
  en: [['#qNew', 'New quote'], ['#tab-list', 'Quotes']],
}]);
