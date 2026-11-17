/* SlopTutorialVideo: a video tutorial played in a dialog on the page, from YouTube's privacy-enhanced player
 * (youtube-nocookie.com), loaded only when the person asks for it. Classic script; needs SlopUI.dialog (shared/slopui.js).
 *   SlopTutorialVideo.open({ id, title })   opens the player for YouTube video `id` and starts it; closing the dialog stops it
 *   SlopTutorialVideo.wire(doc)             one click handler for the page: a plain click on <a data-slop-video="ID"> opens the
 *                                   player instead of following the link. Ctrl/⌘/Shift/middle clicks still open YouTube,
 *                                   and the link stays a normal link for search engines and archives.
 * Loaded by shell/shell.js on every shell page, which calls wire(document). */
(function () {
  'use strict';
  if (window.SlopTutorialVideo) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const ID = /^[\w-]{6,20}$/;
  const STYLE = '.svid-dlg{width:min(960px,100%)}.svid-frame{position:relative;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden}'
    + '.svid-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.svid-note{margin:8px 0 0;font-size:12px;opacity:.75}'
    + '.svid-note a{color:inherit}';

  function css(doc) {
    if (doc.getElementById('svid-css')) return;
    const s = doc.createElement('style'); s.id = 'svid-css'; s.textContent = STYLE; doc.head.append(s);
  }
  /** The embed address: privacy-enhanced, started on open, no related videos from other channels. */
  const embed = (id) => 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
  const watch = (id) => 'https://www.youtube.com/watch?v=' + id;

  function open(o) {
    const id = o && o.id, UI = window.SlopUI;
    if (!ID.test(id || '') || !UI || !UI.dialog) return null;
    const doc = document;
    css(doc);
    const frame = doc.createElement('div'); frame.className = 'svid-frame';
    const ifr = doc.createElement('iframe');
    ifr.src = embed(id);
    ifr.title = o.title || tr('ui.video.title', 'Video tutorial');
    ifr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    ifr.allowFullscreen = true;
    ifr.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.append(ifr);
    const note = doc.createElement('p'); note.className = 'svid-note';
    const a = doc.createElement('a'); a.href = watch(id); a.target = '_blank'; a.rel = 'noopener'; a.textContent = tr('ui.video.open', 'Open on YouTube');
    note.append(tr('ui.video.note', 'Plays from YouTube in privacy-enhanced mode.') + ' ', a);
    const body = doc.createElement('div'); body.append(frame, note);
    return UI.dialog({ title: o.title || tr('ui.video.title', 'Video tutorial'), body, cls: 'svid-dlg', dismissable: true });
  }

  function wire(doc) {
    if (doc.__slopVideo) return;
    doc.__slopVideo = true;
    doc.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-slop-video]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (!window.SlopUI || !ID.test(a.dataset.slopVideo)) return;   // no dialog kit: the link opens YouTube as before
      e.preventDefault();
      open({ id: a.dataset.slopVideo, title: a.dataset.slopVideoTitle || a.getAttribute('aria-label') || '' });
    });
  }

  window.SlopTutorialVideo = { open, wire, embed, watch };
})();
