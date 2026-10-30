/* Slop Reminders in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: reminders/js/app.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'reminders',
  ready: '#rList .rm-group',
  sv: [['#rPermBtn', 'Tillåt webbläsaraviseringar'], ['#rAdd button[type="submit"]', 'Lägg till påminnelse'], ['#rTitle', 'Ring tillbaka till banken', 'placeholder'],
    ['#rList .rm-group .rm-h', 'Förfallna0'], ['#rList .rm-group p.empty', 'Inget förfallet.'], ['.smb-app', 'Påminnelser']],
  en: [['#rPermBtn', 'Allow browser notifications'], ['#rList .rm-group p.empty', 'Nothing overdue.']],
}]);
