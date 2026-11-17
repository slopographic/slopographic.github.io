/* Google Consent Mode v2 and the only place third-party scripts are added. Classic script, exposes window.SlopConsent.
 * Load order: config.js, state.js, then this file, before any other script. On load it sets every consent type to
 * 'denied' BEFORE any tag, then loads what the stored choice allows. Nothing is loaded while an ID is empty.
 * Revoking sets consent to denied, does not reload the page, and stops future loads (window['ga-disable-<ID>'] = true).
 * Every apply() dispatches a window 'slop-consent' event (detail: the categories), so ad slots react at once.
 * Tests replace the loader: set window.SLOP_CONSENT_LOADER before this file, or SlopConsent.loadScript later.
 * Text about analytics and ads (marked data-third-party, like the footer's "stay off unless you switch them on") is hidden
 * on a site that has none: the brand's third-party switch off (the store app) or no IDs. */
(function () {
  'use strict';
  var cfg = window.SLOP_CONSENT_CONFIG;
  var S = window.SlopConsentState;
  var GA_SRC = 'https://www.googletagmanager.com/gtag/js';
  var ADS_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  var DENIED = {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', functionality_storage: 'denied', personalization_storage: 'denied', security_storage: 'denied'
  };
  gtag('consent', 'default', Object.assign({}, DENIED));

  function mapping(c) {
    var ads = c.ads ? 'granted' : 'denied';
    return {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: ads, ad_user_data: ads, ad_personalization: ads
    };
  }
  function defaultLoad(src, crossOrigin) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    if (crossOrigin) s.crossOrigin = crossOrigin;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }
  var loaded = { analytics: false, ads: false };

  /** True when a gtag.js script for this ID is already on the page (the homepage puts it there inline). */
  function gaTagOnPage(id) {
    try {
      var list = document.getElementsByTagName('script');
      for (var i = 0; i < list.length; i++) {
        if ((list[i].src || '').indexOf(GA_SRC + '?id=' + encodeURIComponent(id)) === 0) return true;
      }
    } catch (e) { /* no DOM access: treat as absent */ }
    return false;
  }
  function loadAnalytics() {
    if (loaded.analytics || !cfg.ga4MeasurementId) return;
    loaded.analytics = true;
    if (gaTagOnPage(cfg.ga4MeasurementId)) {
      // The tag and its config are already on the page: only the consent state changes.
      gtag('consent', 'update', { analytics_storage: 'granted' });
      // The page view was sent while consent was denied, so it was not counted. Send this one now.
      gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
      return;
    }
    api.loadScript(GA_SRC + '?id=' + encodeURIComponent(cfg.ga4MeasurementId));
    gtag('js', new Date());
    gtag('config', cfg.ga4MeasurementId);
  }
  /** Loads AdSense only after the visitor accepts ads, then turns on Auto ads (page-level) for every page. */
  function loadAds() {
    if (loaded.ads || !cfg.adsensePublisherId) return;
    loaded.ads = true;
    api.loadScript(ADS_SRC + '?client=' + encodeURIComponent(cfg.adsensePublisherId), 'anonymous');
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({
        google_ad_client: cfg.adsensePublisherId,
        enable_page_level_ads: true
      });
    } catch (e) { /* script blocked: no Auto ads, nothing else changes */ }
  }

  /** Makes the consent state match the stored record and loads whatever is allowed. */
  function apply() {
    var c = S.current();
    try { window.dispatchEvent(new CustomEvent('slop-consent', { detail: c })); } catch (e) { /* old browser: slots re-check on load */ }
    gtag('consent', 'update', mapping(c));
    if (c.analytics) {
      if (cfg.ga4MeasurementId) window['ga-disable-' + cfg.ga4MeasurementId] = false;
      loadAnalytics();
    } else if (cfg.ga4MeasurementId) {
      window['ga-disable-' + cfg.ga4MeasurementId] = true;
      if (gaTagOnPage(cfg.ga4MeasurementId)) gtag('consent', 'update', { analytics_storage: 'denied' });
    }
    if (c.ads) loadAds();
    return c;
  }

  /** Saves the full set of choices and applies them. Returns false if storage refused (then nothing changes). */
  function setChoices(next) {
    var base = S.current();
    var rec = S.write({
      analytics: next && 'analytics' in next ? !!next.analytics : base.analytics,
      ads: next && 'ads' in next ? !!next.ads : base.ads,
      rates: next && 'rates' in next ? !!next.rates : base.rates
    });
    if (!rec) return false;
    apply();
    return true;
  }
  function setOne(cat, on) {
    if (cat !== 'analytics' && cat !== 'ads' && cat !== 'rates') throw new Error('unknown consent category: ' + cat);
    var o = {}; o[cat] = on;
    return setChoices(o);
  }

  var api = {
    loadScript: typeof window.SLOP_CONSENT_LOADER === 'function' ? window.SLOP_CONSENT_LOADER : defaultLoad,
    apply: apply,
    setChoices: setChoices,
    grant: function (cat) { return setOne(cat, true); },
    revoke: function (cat) { return setOne(cat, false); },
    /** The categories in force right now (necessary is always true). */
    state: function () { return S.current(); }
  };
  /** True when the site can load analytics or ads at all (shared/consent/config.js). */
  function hasThirdParty() { return !!(cfg && cfg.thirdParty !== false && (cfg.ga4MeasurementId || cfg.adsensePublisherId)); }
  function hideThirdPartyText() {
    if (hasThirdParty() || typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    var els = document.querySelectorAll('[data-third-party]');
    for (var i = 0; i < els.length; i++) els[i].hidden = true;
  }
  api.hasThirdParty = hasThirdParty;
  window.SlopConsent = api;
  apply();
  if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideThirdPartyText);
  else hideThirdPartyText();
})();
