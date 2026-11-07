/* QR SLOP: boot. Builds the page (header, tabs, panels, preview), the batch tab and the commands, then marks the page ready
 * for the tests. Classic script, runs once the page is parsed. */
(function () {
  'use strict';
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  function boot() {
    window.QRApp.init();
    window.QRBatch.init();
    window.QRCommands.register();
    document.body.classList.add('ready');
  }
  document.addEventListener('DOMContentLoaded', () => {
    try { boot(); } catch (e) {
      console.error(e);
      document.body.classList.add('ready');
      if (window.SlopUI) SlopUI.toast(t('qr.app.start_failed', { error: e.message }));
    }
  });
})();
