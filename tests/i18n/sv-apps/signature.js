/* Slop Signature in Swedish: what tests/i18n/biz-sv.test.html checks.
 * Covers: signature/js/app.js, signature/js/copy.js, signature/js/form.js, signature/js/layout.js, signature/js/logo-ui.js, signature/js/model.js, signature/js/logo.js, signature/js/templates.js, signature/js/ai-commands.js */
window.SV_APPS = (window.SV_APPS || []).concat([{
  app: 'signature',
  ready: '#sgForm fieldset',
  sv: [['#sgCopy', 'Kopiera signatur'], ['#sgExample', 'Fyll i ett exempel'], ['.sg-intro h1', 'Skapa e-postsignatur'],
    ['#sgForm fieldset[data-group="you"] legend', 'Du'], ['#sg-title', 'Försäljningschef', 'placeholder'], ['#sgLogo summary', 'Skapa en logotyp']],
  en: [['#sgCopy', 'Copy signature'], ['#sgForm fieldset[data-group="you"] legend', 'You']],
}]);
