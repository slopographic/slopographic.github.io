/* Slop Reports in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: reports/js/ai-commands.js, reports/js/app.js, reports/js/commands.js, reports/js/defs.js, reports/js/engine.js, reports/js/layout.js, reports/js/saved.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'reports',
  ready: '#report option',
  sv: [['#new', 'Ny rapport'], ['#csv', 'Exportera CSV'], ['#report option', 'Obetalda fakturor per kund'], ['.rp-lead', 'Rapporter över Kontakter, Fakturor, Utgifter, huvudboken och CRM. Skrivskyddat: inget här ändrar dina poster.'],
    ['.smb-app', 'Rapporter']],
  en: [['#new', 'New report'], ['#report option', 'Unpaid invoices by customer']],
}]);
