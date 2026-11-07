/* Slop Admin in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: admin/js/core/numbering.js, admin/js/core/profile.js, admin/js/core/restore.js, admin/js/core/storage.js, admin/js/core/util.js, admin/js/ui/app.js, admin/js/ui/commands.js, admin/js/ui/company.js, admin/js/ui/data.js, admin/js/ui/numbering.js, admin/js/ui/start.js, admin/js/ui/storage.js, admin/js/ui/taxes.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'admin',
  ready: '#sSteps li',
  sv: [['#tab-company', 'Företag'], ['#tab-numbering', 'Nummerserier'], ['#tab-taxes', 'Momssatser'], ['#cSave', 'Spara profil'],
    ['#view-start h2', 'Kom igång med affärsapparna'], ['#sSteps li .start-text b', 'Lägg till dina företagsuppgifter'], ['.smb-app', 'Administration']],
  en: [['#tab-company', 'Company'], ['#sSteps li .start-text b', 'Add your company details']],
}]);
