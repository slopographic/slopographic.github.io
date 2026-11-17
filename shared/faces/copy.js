/* The face detection wording, in one place: the opt-in dialog (shared/faces/consent.js) and the Profile switch
 * (shared/profile/app-options.js, shown on settings/) both read it, so they say the same thing. Classic script;
 * sets window.SLOP_FACES_COPY. Load it before app-options.js. The words are the keys ui.faces.copy_* (shared/i18n/ui/
 * <code>/preview.js), read each time a field is read (getters), so a reader built after a language switch has the new words. */
(function (g) {
  'use strict';
  const tr = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  g.SLOP_FACES_COPY = Object.freeze({
    get title() { return tr('ui.faces.copy_title'); },
    get switchLabel() { return tr('ui.faces.copy_switch'); },
    get lines() { return Object.freeze([tr('ui.faces.copy_line1'), tr('ui.faces.copy_line2'), tr('ui.faces.copy_line3')]); },
  });
})(typeof window !== 'undefined' ? window : globalThis);
