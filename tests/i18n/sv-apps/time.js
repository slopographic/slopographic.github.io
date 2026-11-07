/* Slop Time in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: time/js/app.js, time/js/ui.js, time/js/zones.js, time/js/convert.js, time/js/sync.js, time/js/world.js, time/js/my.js, time/js/meet.js, time/js/convert-ui.js, time/js/clocks.js, time/js/commands.js, time/js/sync-ui.js, time/js/ai-commands.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'time',
  ready: '#st-cities .st-card',
  sv: [['#tab-world', 'Världsklocka'], ['#tab-meet', 'Möten'], ['#st-add', 'Lissabon, Sydney, America/Chicago', 'placeholder'],
    ['#st-cities .st-card .st-btn', 'Ta bort'], ['#st-sw-reset', 'Nollställ'], ['.smb-app', 'Världsklocka']],
  en: [['#tab-world', 'World clock'], ['#st-cities .st-card .st-btn', 'Remove']],
}]);
