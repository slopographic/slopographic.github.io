/* The consent strip: a slim bar along the bottom edge, not a modal. Shown only when storage works and there is no choice
 * for the current policy version. Accept or Reject saves the choice; × rejects the optional extras and closes.
 * Detailed switches live on the Settings page. Classic script, exposes window.SlopBanner. Its text is marked for
 * SlopI18n (data-i18n on the text, data-i18n-attr on the labels), so the language applies to it.
 * Needs config.js, state.js and consent-mode.js loaded first. Plain DOM, native buttons (keyboard works). */
(function () {
  'use strict';
  var S = window.SlopConsentState;
  var C = window.SlopConsent;
  var ID = 'slopc-banner';

  function text(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { el.append(typeof k === 'string' ? document.createTextNode(k) : k); });
    return el;
  }
  /** The English text, or the chosen language's text for the key when SlopI18n is on the page. */
  function tr(key, en) {
    var I = window.SlopI18n;
    var s = I ? I.t(key) : en;
    return s === key ? en : s;
  }
  function button(key, en, act, cls, aria) {
    var attrs = { type: 'button', class: 'slopc-btn' + (cls ? ' ' + cls : ''), 'data-act': act };
    if (key) attrs['data-i18n'] = key;
    var b = text('button', attrs, [key ? tr(key, en) : en]);
    if (aria) { b.setAttribute('aria-label', tr(aria[0], aria[1])); b.setAttribute('data-i18n-attr', 'aria-label:' + aria[0]); }
    return b;
  }
  function injectCss() {
    if (document.getElementById('slopc-css')) return;
    var link = text('link', { id: 'slopc-css', rel: 'stylesheet', href: S.base + 'shared/consent/banner.css' });
    (document.head || document.documentElement).append(link);
  }
  /* Room for the strip: while it is up, <html> gets class slopc-on and --consent-h (the strip's measured height, kept
   * current by a ResizeObserver, and measured again when banner.css arrives, when web fonts load and when the window
   * resizes: the first measure can run before the card is styled, and its padding and bottom gap change no content box).
   * On a page that scrolls, banner.css adds that height to the page's bottom padding (class slopc-pad), so the end of the
   * page scrolls clear of the strip; the page's own bottom padding is kept in --slopc-base-pb. A full-height app (its body
   * or root does not scroll: SlopFrame tools, editors, the business apps) is never shrunk: the card floats over it, above
   * a footer at the window's bottom (--slop-foot-h, shared/frame/panel.js). */
  var root = document.documentElement;
  var ro = null, off = null;
  function reserve(el) {
    if (!root.classList.contains('slopc-on')) {
      root.style.setProperty('--slopc-base-pb', getComputedStyle(document.body).paddingBottom);
      root.classList.add('slopc-on');
    }
    // the room the card takes from the bottom of the window: its height and the gap under it
    // (its laid-out size and offset, not its on-screen box, which the slide-in animation moves)
    var measure = function () {
      var gap = parseFloat(getComputedStyle(el).bottom) || 0;
      root.style.setProperty('--consent-h', Math.ceil(el.offsetHeight + gap) + 'px');
      root.classList.toggle('slopc-pad', !fullHeight());
    };
    measure();
    // Later measures run in the next frame (at most one a frame): the card's own size (a ResizeObserver; a change made in its
    // delivery would be a "ResizeObserver loop" error on the page), and the page's classes and hidden views (a
    // MutationObserver: an app that turns full-height after it starts, a view that switches).
    var queued = false;
    var later = function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; if (off) measure(); }); };
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(later); ro.observe(el, { box: 'border-box' }); }
    var mo = typeof MutationObserver === 'function' && document.body ? new MutationObserver(later) : null;
    if (mo) mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });   // not text: a live timer
    var link = document.getElementById('slopc-css'), fonts = document.fonts;
    if (link) link.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    if (fonts && fonts.addEventListener) { fonts.addEventListener('loadingdone', measure); fonts.ready.then(function () { if (off) measure(); }); }
    off = function () {
      if (mo) mo.disconnect();
      if (link) link.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
      if (fonts && fonts.removeEventListener) fonts.removeEventListener('loadingdone', measure);
    };
  }
  /** A full-height app: its body or root clips instead of scrolling (the app scrolls its own parts). */
  function fullHeight() {
    var b = document.body ? getComputedStyle(document.body).overflowY : '', r = getComputedStyle(root).overflowY;
    return /hidden|clip/.test(b) || /hidden|clip/.test(r);
  }
  function unreserve() {
    if (ro) { ro.disconnect(); ro = null; }
    if (off) { off(); off = null; }
    root.classList.remove('slopc-on', 'slopc-pad');
    root.style.removeProperty('--consent-h');
    root.style.removeProperty('--slopc-base-pb');
  }
  function remove() {
    var el = document.getElementById(ID);
    if (el) el.remove();
    unreserve();
  }
  function choose(next) {
    if (C) C.setChoices(next);
    remove(); // a choice (or a refused save) ends the strip: nothing asks again on this page
  }
  function build() {
    var root = text('div', { id: ID, class: 'slopc-banner', role: 'region', 'aria-label': tr('consent.region', 'Privacy choice'), 'data-i18n-attr': 'aria-label:consent.region' }, [
      text('p', { class: 'slopc-text' }, [
        text('span', { 'data-i18n': 'consent.text' }, [tr('consent.text', 'Analytics and ads are off. Turn them on? You can change this any time in')]),
        ' ',
        text('a', { href: S.base + 'settings/', 'data-i18n': 'nav.settings' }, [tr('nav.settings', 'Settings')]), '.'
      ]),
      text('div', { class: 'slopc-actions' }, [
        button('consent.reject', 'Reject', 'reject'),
        button('consent.accept', 'Accept', 'accept', 'primary'),
        button(null, '×', 'close', 'x', ['consent.close_aria', 'Reject optional and close'])
      ])
    ]);
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'accept') choose({ analytics: true, ads: true });
      else if (act === 'reject' || act === 'close') choose({ analytics: false, ads: false });
    });
    return root;
  }
  /** Shows the strip if the visitor still needs to choose. Pages with body[data-consent="off"] never show it. */
  function mount() {
    if (!S || !C) return false;
    if (document.body && document.body.getAttribute('data-consent') === 'off') return false;
    if (window.SLOP_CONSENT_CONFIG && window.SLOP_CONSENT_CONFIG.thirdParty === false) return false;
    if (!S.needsChoice() || document.getElementById(ID) || !document.body) return false;
    injectCss();
    var el = build();
    document.body.append(el);
    reserve(el);
    return true;
  }
  window.SlopBanner = { mount: mount, remove: remove };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
