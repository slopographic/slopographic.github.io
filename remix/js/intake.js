/* Reel Remix: the one way files come in (shared/intake). Spec 'remix': a drop on the bin or the stage, the zone's Choose
   files and sample, Add files…, a paste, ?drive=<id> (another app's Open in Reel Remix) and a PWA launch reach RM.addFiles
   one file at a time; the zone (ui.js) shows each file's progress. Part 'remix.music': Pick music file. ui.js calls
   RM.intake.register({ done(summary), music(file) }) once. */
(function () {
  'use strict';
  const RM = window.RM;
  RM.intake = {
    register(o) {
      let missingBefore = 0;
      SlopIntake.register({
        id: 'remix', accept: { types: ['image/*', 'video/*'], exts: [], get noun() { return RM.t('remix.intake.noun'); } },
        before: () => { missingBefore = RM.state.items.filter((x) => x.missing).length; },
        process: async (file) => {
          if (!(await RM.addFiles([file]))) throw new Error('could not be decoded as a picture or video');
          return RM.state.items.slice().reverse().find((x) => x.name === file.name).id;
        },
        after: (values, batch, sum) => o.done(sum, missingBefore),
      });
      SlopIntake.register({
        id: 'remix.music', main: false, paste: false, toast: false, limit: 1, accept: { types: ['audio/*', 'video/*'], get noun() { return RM.t('remix.intake.music_noun'); } },
        process: async (f) => { o.music(f); return f.name; },
      });
    },
    pickMusic: () => SlopIntake.pick({ to: 'remix.music', multiple: false, accept: 'audio/*,video/*' }),
  };
})();
