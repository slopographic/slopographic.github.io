/* Slop To-do in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: todo/js/ui/app.js, todo/js/ui/list.js, todo/js/ui/editor.js, todo/js/ui/commands.js, todo/js/config.js, shared/tour/tours/todo.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'todo',
  ready: '#tSide .side-btn',
  sv: [['#tTitle', 'I dag'], ['#tAddBtn', 'Lägg till'], ['#tNew', 'Detaljer…'], ['#tAdd', 'Skriv en uppgift och tryck på Enter', 'placeholder'],
    ['#tSide .side-h', 'Listor'], ['#tList p.empty', 'Inget förfaller i dag och inget är försenat.'], ['.smb-app', 'Att göra']],
  en: [['#tTitle', 'Today'], ['#tAddBtn', 'Add']],
}]);
