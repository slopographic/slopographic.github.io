/* The Slopographic support card: when it appears. Classic script, exposes window.SlopSupport.
 * Needs state.js (SlopSupportState) and card.js (SlopSupportCard) loaded first. The brand flags and the Patreon link
 * come from brand/brand.json (via SlopBrand.ready when brand.js is on the page, otherwise fetched here).
 *   SlopSupport.afterExport(appId)  call after any export succeeds. Shows the corner card on the FIRST export of
 *                                   this browser only (any app, image or document). Resolves true if it showed.
 *   SlopSupport.trackRender(appId, host, { delayMs })  call when a video render starts. If the render is still
 *                                   running after delayMs (default 10 s), the card is placed inside host (the
 *                                   progress dialog). Call .done() when the render ends: the card is removed and the
 *                                   render itself is never affected. Closing the card does not stop the render.
 * Nothing shows when brand support.exportCard is false, when storage is blocked, or after "No thanks".
 * The card is never part of an exported file. It is not a modal: no overlay, no focus trap. */
(function () {
  'use strict';
  var S = window.SlopSupportState, C = window.SlopSupportCard;
  var DEFAULT_DELAY = 10000;

  var brandReady = null;
  /** Loads the brand data once: SlopBrand.ready when brand.js is on the page, else brand/brand.json. Never rejects. */
  function loadBrand() {
    if (!brandReady) {
      var p = window.SlopBrand && window.SlopBrand.ready
        ? window.SlopBrand.ready
        : fetch(S.base + 'brand/brand.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
      brandReady = Promise.resolve(p).then(function (json) { C.setBrand(json); }, function () { C.setBrand(null); });
    }
    return brandReady;
  }
  function enabled() { return !!(S && C && S.available() && C.config().exportCard && !S.dismissed()); }
  function ensureCss() {
    if (document.getElementById('slopsup-css')) return;
    var link = document.createElement('link');
    link.id = 'slopsup-css'; link.rel = 'stylesheet'; link.href = S.base + 'shared/support/support.css';
    (document.head || document.documentElement).append(link);
  }
  function mount(host, mode) {
    ensureCss();
    var card = C.build({
      onClose: function () {},                        // × closes for this visit only: nothing is stored
      onNoThanks: function () { S.dismiss(); }        // stored: the card never shows again on any app
    });
    card.classList.add(mode === 'inline' ? 'slopsup-inline' : 'slopsup-corner');
    if (mode !== 'inline') {
      var old = document.querySelectorAll('.slopsup-corner');
      for (var i = 0; i < old.length; i++) old[i].remove();
    }
    host.append(card);
    return card;
  }

  var api = {
    afterExport: function (appId) {
      return loadBrand().then(function () {
        if (!enabled() || S.shown() || !document.body) return false;
        S.markShown();
        mount(document.body, 'corner');
        return true;
      });
    },
    trackRender: function (appId, host, opts) {
      var delay = opts && opts.delayMs != null ? opts.delayMs : DEFAULT_DELAY;
      var state = { ended: false, card: null, shown: false };
      var timer = setTimeout(function () {
        timer = null;
        loadBrand().then(function () {
          if (state.ended || !host || !enabled()) return;
          S.markShown();
          state.card = mount(host, 'inline');
          state.shown = true;
        });
      }, delay);
      return {
        /** The render has finished (or was stopped): clears the timer and removes the card. */
        done: function () {
          state.ended = true;
          if (timer) clearTimeout(timer);
          if (state.card) state.card.remove();
        },
        shown: function () { return state.shown && !!state.card && state.card.isConnected; }
      };
    }
  };
  window.SlopSupport = Object.freeze(api);
})();
