/* Slop AI Tools: the one way a file comes into a tool page (shared/intake). SlopAITools.intake(id, o) registers the page's
 * spec (one file at a time) and makes its "Drop … here, or choose a file" box the way in: a drop on it, its "choose a
 * file" button (#chooseFile, the intake's picker), a paste, ?drive=<id> (when the page has Slop Hub) and a PWA launch all
 * reach o.read(file, ctx). A paste is not taken before the tool's gate has shown the page (#ui).
 *   o: { accept: rules (shared/intake/rules.js), read(file, ctx), drive?: '#button' (Open from Slop Drive) }
 * Classic script, after shared/intake/*.js and common.js. */
(function (root) {
  'use strict';
  const T = (root.SlopAITools = root.SlopAITools || {});
  const $ = (id) => root.document.getElementById(id);
  T.intake = function (id, o) {
    const SI = root.SlopIntake;
    SI.register({
      id, accept: o.accept, limit: 1,
      gate: (batch) => !$('ui') || !$('ui').hidden || batch.source !== 'paste', // no paste before the gate shows the page
      process: async (file, ctx) => { await o.read(file, ctx); return file.name; },
    });
    SI.dropTarget($('drop'), { to: id });
    const choose = $('chooseFile');
    if (choose) choose.addEventListener('click', () => SI.pick({ to: id, multiple: false }));
    const drive = o.drive && root.document.querySelector(o.drive);
    if (drive) drive.addEventListener('click', () => SI.fromDrive({ to: id, title: root.SlopI18n && root.SlopI18n.has('aitools.frame.pick_drive') ? root.SlopI18n.t('aitools.frame.pick_drive') : 'Pick from Slop Drive' }));
    return {
      /** Call once the page can take a file (after the gate): what the page was opened with comes in. */
      launch: () => { if (root.SlopHub) { try { root.SlopHub.register('aitools'); } catch (e) { /* bus unavailable */ } } return SI.launch({ to: id }); },
    };
  };
})(window);
