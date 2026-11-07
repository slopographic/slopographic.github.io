/* SlopNav entry point: an app registers its canvas host and view adapter here; the engine then runs
 * the app's active preset, and openModal opens the navigation dialog for that app. Classic script,
 * loaded last. Apps include, in order: slopui.js, nav/presets, validate, logic, describe, store,
 * engine, pad, modal, index (and nav.css). See HANDOFF.md. */
(function () {
  'use strict';
  const N = window.SlopNav;
  const apps = {};
  const say = (k) => { const I = window.SlopI18n; return I && I.t ? I.t(k) : k; };   // shared/i18n/ui/<code>/print.js

  /** Remembers an app's title, shortcut list and (optionally) its host and adapter, without attaching. */
  function register(app, meta) {
    apps[app] = Object.assign({}, apps[app] || {}, meta || {});
    return apps[app];
  }
  /**
   * Attaches the active preset to an app's canvas. meta: { host, adapter, title?, shortcuts?, skip? }.
   * Returns { detach() } (or null when there is no host yet). Calling again replaces the old attachment.
   */
  function attach(app, meta) {
    const m = register(app, meta);
    if (m.handle) m.handle.detach();
    m.handle = null;
    if (!m.host || !m.adapter) return null;
    m.handle = N.engine.attach({ host: m.host, adapter: m.adapter, bindings: () => N.store.resolve(app).bindings, skip: m.skip });
    return { detach() { if (m.handle) m.handle.detach(); m.handle = null; } };
  }
  /** Opens the navigation dialog for an app (from Preferences, the profile page or the command palette). */
  function openModal(app, extra) {
    const m = apps[app] || {};
    return N.modal.open(Object.assign({ app, title: (m.title ? m.title + ' · ' : '') + say('ui.nav.navigation'), shortcuts: m.shortcuts }, extra || {}));
  }
  /**
   * Builds the shortcut list for the clash check from the app's own commands (SlopCmd), by command title.
   * titles: { fit: 'Fit on Screen', actual: '100%', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', hand: 'Hand Tool' }
   */
  function shortcutsFrom(titles) {
    return () => {
      if (!window.SlopCmd || !SlopCmd.list) return [];
      const out = [];
      const all = SlopCmd.list();
      for (const [action, title] of Object.entries(titles)) {
        const c = all.find((x) => x.title === title);
        for (const k of c ? c.keys || [] : []) {
          const combo = N.validate.canonCombo(k);
          if (combo) out.push({ combo, title, action });
        }
      }
      return out;
    };
  }

  // Another tab or a profile page may change the stored preset: re-read it on the next use.
  window.addEventListener('storage', (e) => { if (e.key === N.store.KEY) N.store._reset(); });

  N.register = register;
  N.attach = attach;
  N.openModal = openModal;
  N.shortcutsFrom = shortcutsFrom;
  N.apps = apps;
})();
