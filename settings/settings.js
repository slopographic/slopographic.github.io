/* Settings page: the consent toggles, read from and written to the same record as the banner. Classic script.
 * Needs config.js, state.js and consent-mode.js loaded first, and shared/i18n/i18n.js. Toggles save at once; the note
 * is drawn again on a language switch. A site with no analytics or ads at all (the brand's third-party switch off, or no
 * IDs: shared/consent/config.js) has nothing to choose, and the section is hidden. */
(function () {
  'use strict';
  var S = window.SlopConsentState;
  var C = window.SlopConsent;
  var analytics = document.getElementById('set-analytics');
  var ads = document.getElementById('set-ads');
  var note = document.getElementById('settings-note');
  var I = window.SlopI18n;
  var cfg = window.SLOP_CONSENT_CONFIG || {};
  var box = document.getElementById('choices');
  if (box && (cfg.thirdParty === false || (!cfg.ga4MeasurementId && !cfg.adsensePublisherId))) box.hidden = true;

  function sync() {
    var cur = C.state();
    var avail = S.available();
    var rec = S.read();
    analytics.checked = cur.analytics;
    ads.checked = cur.ads;
    analytics.disabled = ads.disabled = !avail;
    var msg;
    if (!avail) msg = I.t('settings.consent.no_storage');
    else if (S.needsChoice()) msg = rec ? I.t('settings.consent.policy_changed') : I.t('settings.consent.not_chosen');
    else if (rec) msg = I.t('settings.consent.saved_on', { date: I.date(rec.timestamp, { dateStyle: 'medium', timeStyle: 'short' }) });
    else msg = I.t('settings.consent.off');
    note.textContent = msg;
  }
  function wire(el, cat) {
    el.addEventListener('change', function () {
      if (el.checked) C.grant(cat); else C.revoke(cat);
      sync(); // a refused save (storage blocked) puts the switch back
    });
  }
  wire(analytics, 'analytics');
  wire(ads, 'ads');
  sync();
  I.on(sync);   // the note in the new language
  window.SlopSettings = { sync: sync };
})();
