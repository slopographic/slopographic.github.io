/* Settings: Updates. Shows the release the service worker serves and loads the newest one on request (SlopPWA.refresh in
 * shared/pwa.js: deletes the offline caches, fetches the newest worker, reloads). Nothing the person made is cleared.
 * Classic script; needs shared/pwa.js and settings/say.js. */
(function () {
  'use strict';
  var P = window.SlopPWA;
  var btn = document.getElementById('updates-refresh');
  var note = document.getElementById('updates-version');
  var Say = window.SlopSettingsSay;
  if (!P || !btn || !note) return;
  P.version().then(function (v) {
    if (v) Say.key(note, 'settings.updates.release', { version: String(v) }); else Say.key(note, 'settings.updates.no_copy');
  });
  btn.addEventListener('click', function () {
    btn.disabled = true;
    Say.key(note, 'settings.updates.loading');
    P.refresh();
  });
})();
