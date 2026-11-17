/* Slop Timesheets in Swedish: what tests/i18n/biz-sv-docs.test.html checks.
 * Covers: timesheets/js/core/entries.js, timesheets/js/core/time.js, timesheets/js/ui/app.js, timesheets/js/ui/bill.js, timesheets/js/ui/commands.js, timesheets/js/ui/editor.js, timesheets/js/ui/list.js, timesheets/js/ui/timer.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'timesheets',
  ready: '#tNew',
  sv: [['#tNew', 'Registrera tid'], ['#tmGo', 'Starta timer'], ['#tab-bill', 'Fakturera'], ['#tSearch', 'Sök beskrivning, projekt eller kund', 'placeholder'],
    ['#tState option[value="open"]', 'Att fakturera'], ['.smb-app', 'Tidrapporter']],
  en: [['#tNew', 'Log time'], ['#tmGo', 'Start timer']],
}]);
