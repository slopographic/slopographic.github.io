/* Slop Drive link: a "Slop Drive" link with the Drive icon for an app's top bar or menu, so there is always an
 * easy way back to the drive. The link goes to the Drive path in the registry (SLOP_APPS, id 'drive') and resolves
 * from this script's own location, so it works from any folder depth. A plain click opens Drive in the same tab;
 * Shift-, Ctrl/⌘- or middle-click opens it in a new tab. Its look is the shared header button (shared/ui/hbtn.css, linked
 * by the shell). Classic script; exposes window.SlopDriveLink:
 *   SlopDriveLink.mount(container, { before })   container: an element or a selector; the link is appended (or
 *                                                 placed before `before`). Mounting twice in one place adds one link.
 *   SlopDriveLink.href()                          the absolute URL of Slop Drive. */
(function () {
  'use strict';
  if (window.SlopDriveLink) return;
  const self = document.currentScript;
  // The site root: from this script's URL, else from the page. A blob: or about: page (an offline file run inline)
  // has no usable base, so the root is null and no link is made; the throw would otherwise stop the whole script.
  function rootUrl() {
    try { return self && self.src ? new URL('../', self.src).href : new URL('/', location.href).href; } catch (e) { return null; }
  }
  const ROOT = rootUrl();
  const ICON = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
  /** The absolute Drive URL, or null when the page has no site root. */
  function href() {
    if (!ROOT) return null;
    const app = (window.SLOP_APPS || []).find((a) => a.id === 'drive');
    return new URL(app ? app.path : 'drive/', ROOT).href;
  }
  /** The link element (not yet placed), or null when there is no Drive URL to point at. */
  function build() {
    const url = href();
    if (!url) return null;
    const a = document.createElement('a');
    a.className = 'sdl slop-hbtn';
    a.href = url;
    // the tooltip is a key (ui.misc.drive_tip), marked so a language switch redraws it (SlopI18n.apply)
    a.setAttribute('data-i18n-attr', 'title:ui.misc.drive_tip');
    a.title = window.SlopI18n ? window.SlopI18n.t('ui.misc.drive_tip') : 'ui.misc.drive_tip';
    // the name is Drive's as the app list shows it, in the chosen language (slopAppName); data-app-name keeps it so on a switch
    const name = window.slopAppName ? window.slopAppName('drive') : 'Slop Drive';   // i18n-ignore: the app name
    a.setAttribute('aria-label', name);
    a.dataset.sdl = '';
    a.dataset.appName = 'drive';
    a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON}</svg><span class="slop-hbtn-txt" data-app-name="drive"></span>`;
    a.lastChild.textContent = name;
    // Plain click: the browser follows the link in this tab. Modified or middle clicks open a new tab.
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    });
    a.addEventListener('auxclick', (e) => {
      if (e.button === 1) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    });
    return a;
  }
  function mount(container, { before } = {}) {
    const host = typeof container === 'string' ? document.querySelector(container) : container;
    if (!host) return null;
    const have = host.querySelector(':scope > [data-sdl]');
    if (have) return have;
    const a = build();
    if (!a) return null;
    const ref = typeof before === 'string' ? host.querySelector(before) : before;
    host.insertBefore(a, ref && ref.parentNode === host ? ref : null);
    return a;
  }

  window.SlopDriveLink = { mount, href };
})();
