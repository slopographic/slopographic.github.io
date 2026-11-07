/* Slop AI — ui/launcher: the Apps list under the chat list. Every app in the registry (shared/apps.js) can be opened
 * in a new tab, with a Slop Drive file, or with a file from this computer (the same as "Send to…" in the other apps). */
'use strict';
(function (AI) {
  const el = AI.el;
  const hub = () => window.SlopHub || null;
  const apps = () => (window.SLOP_APPS || []).filter((a) => a.kind === 'app' && a.id !== 'ai');
  const urlOf = (app) => (hub() ? hub().urlOf(app) : new URL('../' + app.path, location.href).href);

  // A file from this computer or Slop Drive opened in the app: the intake's part 'ai.launch' (ui/intake.js), which sends it
  // the one way out (SlopOuttake).
  function menuFor(app, x, y) {
    window.SlopUI.menu([
      { label: AI.t('ai.launch.new_tab'), act: () => window.open(urlOf(app), '_blank') },
      { label: AI.t('ai.launch.drive_file'), disabled: !hub(), act: () => AI.intake.openDriveFileInApp(app) },
      { label: AI.t('ai.launch.computer_file'), act: () => AI.intake.openInApp(app) },
    ], x, y);
  }
  /** The one-line description: the language's own (apptag.<id>, shared/i18n) when it has one, else the registry's. */
  const tagline = (app) => { const I = window.SlopI18n; return I && I.has('apptag.' + app.id) ? I.t('apptag.' + app.id) : app.tagline; };
  function row(app) {
    return el('div', { class: 'app-row', 'data-app': app.id },
      el('a', { class: 'app-link', href: urlOf(app), target: '_blank', rel: 'noopener', title: AI.t('ai.launch.open_tip', { name: app.name }) },
        el('b', null, app.name), el('small', null, tagline(app))),
      el('button', { type: 'button', class: 'app-more', 'aria-label': AI.t('ai.launch.with', { name: app.name }), title: AI.t('ai.launch.with_tip'),
        onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); menuFor(app, r.right - 220, r.bottom + 4); } }, AI.icon('more')));
  }

  /** The Apps section of the chat sidebar. */
  AI.renderLauncher = function () {
    return el('section', { class: 'apps-launch', id: 'appsLaunch', 'aria-label': AI.t('ai.launch.section') },
      el('h2', { class: 'apps-h' }, AI.t('ai.launch.apps')),
      el('div', { class: 'apps-list' }, apps().map(row)));
  };
  AI.onLang(() => { const old = document.getElementById('appsLaunch'); if (old) old.replaceWith(AI.renderLauncher()); });
})(window.AI);
