/* Slop Calendar in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: calendar/js/config.js, calendar/js/core/model.js, calendar/js/core/periods.js, calendar/js/ui/agenda.js, calendar/js/ui/app.js, calendar/js/ui/chip.js, calendar/js/ui/commands.js, calendar/js/ui/editor.js, calendar/js/ui/ics-ui.js, calendar/js/ui/month.js, calendar/js/ui/panel.js, calendar/js/ui/timegrid.js, calendar/js/ui/year.js, shared/tour/tours/calendar.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'calendar',
  ready: '#cView > *',
  sv: [['#cToday', 'I dag'], ['#cNew', 'Ny händelse'], ['[data-view="month"]', 'Månad'], ['#cImport', 'Importera .ics'],
    ['#cPrev', 'Föregående period', 'aria-label'], ['.smb-app', 'Kalender']],
  en: [['#cToday', 'Today'], ['#cNew', 'New event']],
}]);
