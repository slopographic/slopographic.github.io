/* Tip jar link (the donate link). Classic script, exposes window.SlopDonate. Renders into every [data-donate] element, but only when
 * config patreonUrl is set. With an empty URL the element stays hidden and nothing is rendered. */
(function () {
  'use strict';
  var cfg = window.SLOP_CONSENT_CONFIG;

  /** Fills one [data-donate] container with the link (or hides it when there is no URL). Only the link it made before
   * is replaced: the container may also hold a heading and text (Settings does), and those stay. */
  function render(el) {
    if (!el) return false;
    for (var i = el.children.length - 1; i >= 0; i--) {
      if (el.children[i].hasAttribute('data-donate-link')) el.removeChild(el.children[i]);
    }
    if (!cfg.patreonUrl) { el.hidden = true; return false; }
    var a = document.createElement('a');
    a.setAttribute('data-donate-link', '');
    a.className = 'btn';
    a.href = cfg.patreonUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    // the same word as Settings' button (strings.js), marked so a language switch redraws it
    a.setAttribute('data-i18n', 'settings.donate');
    a.textContent = window.SlopI18n ? window.SlopI18n.t('settings.donate') : 'settings.donate';
    el.append(a);
    el.hidden = false;
    return true;
  }
  function renderAll() {
    var els = document.querySelectorAll('[data-donate]');
    for (var i = 0; i < els.length; i++) render(els[i]);
  }
  window.SlopDonate = { render: render, renderAll: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
  else renderAll();
})();
