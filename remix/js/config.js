/* Reel Remix: the config kind 'project' (app remix) in the shared format (shared/config, HANDOFF.md there). Export writes the
   bin's clips by file name and size, the plan options, the layout lane, the locks and the keyframes (config-map.js holds the
   data). Import checks the file, then sets the state and plans again with the file's seed, so the same file gives the same
   edit. A clip the bin does not hold becomes a 'missing' placeholder: it is listed, and a file added with the same name fills
   it (items.js). Also the Config button on the page and the palette commands. Loaded after config-map.js. */
(function () {
  'use strict';
  const RM = window.RM, C = window.SlopConfig, D = window.SlopConfigDialog, CM = RM.config;
  const APP = 'remix';
  const MB = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');

  /** Apply: the checked file replaces the reel's clips and options; the edit is planned again with its seed. */
  async function apply(d) {
    const st = RM.state;
    const items = CM.resolveItems(d.clips, st.items);
    for (const m of st.items) if (!items.includes(m) && m.url) URL.revokeObjectURL(m.url);
    Object.assign(st, CM.toState(d, items));
    RM.remix();
    if (RM.syncUI) RM.syncUI();
    const missing = items.filter((m) => m.missing);
    if (missing.length && window.SlopUI) {
      SlopUI.dialog({
        title: RM.t('remix.config.add_title'),
        body: SlopUI.el('div', null,
          SlopUI.el('p', { class: 'sui-p' }, RM.t('remix.config.add_body')),
          SlopUI.el('ul', { class: 'sui-errors' }, missing.map((m) => SlopUI.el('li', null, `${m.name} (${MB(m.size || 0)})`)))),
        buttons: [{ label: RM.t('remix.config.later') }, { label: RM.t('remix.config.add_files'), primary: true, act: () => { window.SlopIntake.pick({ to: 'remix' }); } }],
      });
    }
  }

  C.registerKind('project', APP, CM.SCHEMA, apply, {
    label: 'Reel', description: 'Clips by name and size, plan options, layout lane, locks and keyframes', // i18n-ignore: the config kind (shared/config, API)
    check: CM.check,
    read: () => CM.toData(RM.state, RM.size()),
  });

  const cmds = D.commands({ app: APP, prefix: 'remix' });
  RM.configCommands = cmds;
  // the palette: SlopCmd when the page loads it (shared/commands); otherwise the Config button is the way in
  if (window.SlopCmd && SlopCmd.register) {
    try { SlopCmd.init({ app: APP }); SlopCmd.register(cmds.map((c) => Object.assign({}, c))); } catch (e) { console.warn('Remix: palette commands not registered', e); }
  }
  D.install({ app: APP }); // drag and drop of a .slop.json file onto the page

  /** The Config menu (header button): the same four items as the palette. */
  RM.configMenu = () => D.menuItems({ app: APP });
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('rm-config');
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = btn.getBoundingClientRect();
        SlopUI.menu(RM.configMenu(), r.left, r.bottom + 2);
      });
    });
  }
})();
