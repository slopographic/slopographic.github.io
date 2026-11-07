/* Slop Ledger in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: ledger/js/core/accounts.js, ledger/js/core/csv.js, ledger/js/core/journal.js, ledger/js/core/rates.js, ledger/js/core/sie-import.js, ledger/js/core/util.js, ledger/js/ui/accounts.js, ledger/js/ui/app.js, ledger/js/ui/bank.js, ledger/js/ui/commands.js, ledger/js/ui/gl.js, ledger/js/ui/journal.js, ledger/js/ui/rates.js, ledger/js/ui/sie.js, ledger/js/ui/statements.js, ledger/js/ui/trial.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'ledger',
  ready: '#jPost',
  sv: [['#jPost', 'Bokför'], ['#tab-journal', 'Grundbok'], ['#tab-gl', 'Huvudbok'], ['#tab-trial', 'Råbalans'], ['#jAddLine', 'Lägg till rad'],
    ['#fsPeriod option[value="year"]', 'Det här året'], ['.smb-app', 'Bokföring']],
  en: [['#jPost', 'Post entry'], ['#tab-trial', 'Trial balance']],
}]);
