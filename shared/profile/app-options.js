/* Per-app options shown on the Settings page: one section per app listed here (apps are listed from shared/apps.js).
 * Each option: { label, type: 'bool' | 'number' | 'string' | 'enum', default, values (enum), min, max, help }.
 * The app keeps its own default in its code and reads with SlopProfile.get(appId, key, appDefault). The default
 * here is what the Settings page shows; a value equal to it is not stored as an override.
 *   tables: { decimalPlaces: { label: 'Decimal places', type: 'number', default: 2, min: 0, max: 6 } }   (example, not active)
 * SLOP_APP_SHARED lists option groups that several apps show with ONE stored value: { appId: { groupId: 'Heading' } }.
 * Here the group 'faces' (face detection, off by default, shared/faces/) is shown in Drive's and Gallery's sections.
 * label, help and the group headings are i18n keys or functions (SlopI18n.label), read each time the Settings page
 * draws them, so they follow a language switch. Classic script; exposes window.SLOP_APP_OPTIONS and window.SLOP_APP_SHARED. */
(function (g) {
  'use strict';
  // the switch's words are the opt-in dialog's (shared/faces/copy.js: ui.faces.copy_*), so both say the same thing
  var lines = function () { var I = g.SlopI18n; return I ? ['ui.faces.copy_line1', 'ui.faces.copy_line2', 'ui.faces.copy_line3'].map(function (k) { return I.t(k); }).join(' ') : ''; };
  g.SLOP_APP_OPTIONS = Object.freeze({
    faces: {
      detect: { label: 'ui.faces.copy_switch', type: 'bool', default: false, help: lines },
      threshold: { label: 'ui.faces.threshold', type: 'number', default: 0.4, min: 0.2, max: 0.8, help: 'ui.faces.threshold_help' },
    },
  });
  g.SLOP_APP_SHARED = Object.freeze({
    drive: Object.freeze({ faces: 'ui.faces.detection' }),
    gallery: Object.freeze({ faces: 'ui.faces.detection' }),
  });
})(typeof window !== 'undefined' ? window : globalThis);
