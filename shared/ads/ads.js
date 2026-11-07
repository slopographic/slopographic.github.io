/* Ad slots. Classic script, exposes window.SlopAds. Fills every [data-slop-ad="<id>"] placeholder with an AdSense unit.
 * The placeholder stays hidden (and empty) unless ALL of these hold: the slot has a unit ID in shared/ads/slots.json,
 * config adsensePublisherId is set, and SlopConsentState says the visitor accepted ads. Nothing is loaded here:
 * the AdSense script is loaded only by consent-mode.js (the one loader), and only after that acceptance.
 * Load order: config.js, state.js, consent-mode.js, then this file. It re-checks on every 'slop-consent' event,
 * so accepting or turning ads off on the same page takes effect at once. Test hook: window.SLOP_ADS_SLOTS (array)
 * replaces slots.json. See shared/ads/HANDOFF.md. */
(function () {
  'use strict';
  var C = window.SlopConsent;
  var S = window.SlopConsentState;
  var cfg = window.SLOP_CONSENT_CONFIG || {};
  var ATTR = 'data-slop-ad';
  var ID_RE = /^[a-z0-9-]{1,40}$/;
  var UNIT_RE = /^\d{6,20}$/;
  var PUB_RE = /^ca-pub-\d{6,20}$/;
  var list = []; // normalized slots, filled once slots.json (or the test hook) is read

  /** Keeps only well-formed entries: a unique id, a name, a numeric unit (or ''), and a sane size. Bad entries are dropped. */
  function normalize(json) {
    var out = [];
    var seen = {};
    var arr = json && Array.isArray(json.slots) ? json.slots : [];
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !ID_RE.test(s.id) || seen[s.id]) continue;
      seen[s.id] = true;
      var w = Math.round(Number(s.width)), h = Math.round(Number(s.height));
      out.push({
        id: s.id,
        name: typeof s.name === 'string' ? s.name : '',
        unit: typeof s.unit === 'string' && UNIT_RE.test(s.unit) ? s.unit : '',
        width: w >= 1 && w <= 2000 ? w : 0,
        height: h >= 1 && h <= 2000 ? h : 0
      });
    }
    return out;
  }
  function spec(id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** True when this slot may show an ad right now. */
  function wanted(s) {
    if (!s || !s.unit || !s.width || !s.height) return false;
    if (!C || !S || !PUB_RE.test(cfg.adsensePublisherId || '')) return false;
    return S.current().ads === true;
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    el.hidden = true;
    el.removeAttribute('style');
    el._slopAdOn = false;
  }
  /** Shows one placeholder: reserves its size first (so the layout does not jump), then adds the unit and asks AdSense. */
  function show(el, s) {
    clear(el);
    el.style.width = '100%';
    el.style.maxWidth = s.width + 'px';
    el.style.minHeight = s.height + 'px';
    el.style.aspectRatio = s.width + ' / ' + s.height;
    el.style.margin = '16px auto';
    el.style.overflow = 'hidden';
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', cfg.adsensePublisherId);
    ins.setAttribute('data-ad-slot', s.unit);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    el.append(ins);
    el.hidden = false;
    el._slopAdOn = true;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* script not ready: the unit fills when it is */ }
  }
  /** Brings every placeholder in line with the current choice. Only changes on a transition, so a repeat event
   * (for example an analytics toggle) does not ask AdSense for the same unit again. */
  function renderAll() {
    var els = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var s = spec(el.getAttribute(ATTR));
      var on = wanted(s);
      if (on && !el._slopAdOn) show(el, s);
      else if (!on && (el._slopAdOn || !el.hidden)) clear(el);
    }
  }
  /** Reads the slot list (or the test hook), then fills the page. A failed read leaves every slot hidden. */
  function load() {
    if (Array.isArray(window.SLOP_ADS_SLOTS)) { list = normalize({ slots: window.SLOP_ADS_SLOTS }); renderAll(); return; }
    if (!S) return;
    var url = S.base + 'shared/ads/slots.json';
    try {
      fetch(url, { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) { list = normalize(json); renderAll(); })
        .catch(function () { list = []; renderAll(); });
    } catch (e) { list = []; }
  }
  function mount() {
    if (!C || !S || !document.querySelector('[' + ATTR + ']')) return;
    load();
  }
  window.addEventListener('slop-consent', renderAll);
  window.SlopAds = Object.freeze({
    normalize: normalize,
    renderAll: renderAll,
    slots: function () { return list.slice(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
