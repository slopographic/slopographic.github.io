/* SlopIsolate — SlopCmd commands: every menu action, tool, view and zoom step as a command (ids co.*), so the
 * Spotlight palette finds them and the person can rebind any key. The actions are the shared ones in
 * CO.menus.act (ui/menus.js), so a key, a menu item and a palette row do the same thing. Titles and groups are in the
 * chosen language (cutout.cmd.*, registered again on a language change); ids and keywords stay English (API). */
(function () {
  'use strict';
  const CO = window.CO, S = CO.state, H = CO.history, t = CO.util.t;
  const hub = () => (document.documentElement.dataset.offline ? null : window.SlopHub || null);
  const cur = () => S.current();
  const hasDone = () => S.items.some((i) => i.status === 'done');
  const hasItem = () => !!cur();

  /** The command list. Each row: {id, title, group, keys, run, when?, checked?, keywords?}. */
  function list(a) {
    const C = [];
    const F = t('menu.file'), E = t('menu.edit'), T = t('cutout.cmd.group_tools'), V = t('menu.view');
    const add = (id, title, group, keys, run, extra) => C.push(Object.assign({ id, title, group, keys, run }, extra || {}));

    add('co.file-open', t('cutout.menu.open_images'), F, ['Mod+O'], () => a.open(), { keywords: ['add', 'import', 'file', 'photos'] });
    add('co.file-sample', t('cutout.menu.try_sample'), F, [], () => a.sample(), { keywords: ['demo', 'sloppo', 'example'] });
    if (hub()) add('co.file-drive', t('cutout.menu.drive_open'), F, [], () => a.driveOpen(), { keywords: ['drive', 'files'] });
    add('co.export-one', t('cutout.menu.export'), F, ['Mod+S'], () => a.exportOne(), { when: () => !!cur() && cur().status === 'done', keywords: ['download', 'save', 'png', 'webp', 'jpg'] });
    add('co.export-all', t('cutout.cmd.export_all'), F, ['Shift+Mod+S'], () => a.exportAll(), { when: hasDone, keywords: ['batch', 'zip', 'download'] });

    if (window.SlopFlowDoc) add('co.add-to-workflow', t('cutout.menu.add_workflow'), F, [], () => a.workflow(), { keywords: ['workflow', 'batch', 'pipeline', 'chain', 'automate'] });

    add('co.undo', t('ui.undo'), E, ['Mod+Z'], () => a.undo(), { when: () => H.can(cur(), 'undo') });
    add('co.redo', t('ui.redo'), E, ['Shift+Mod+Z', 'Mod+Y'], () => a.redo(), { when: () => H.can(cur(), 'redo') });
    add('co.clear-edits', t('cutout.menu.clear_edits'), E, [], () => a.clearEdits(), { when: () => hasItem() && CO.brush.hasEdits(cur()), keywords: ['reset', 'keep', 'remove'] });

    add('co.tool-pan', t('cutout.cmd.tool_pan'), T, ['H'], () => a.tool('pan'), { checked: () => S.tool === 'pan' });
    add('co.tool-keep', t('cutout.cmd.tool_keep'), T, ['K'], () => a.tool('keep'), { checked: () => S.tool === 'keep', keywords: ['restore', 'brush', 'paint'] });
    add('co.tool-remove', t('cutout.cmd.tool_remove'), T, ['R'], () => a.tool('remove'), { checked: () => S.tool === 'remove', keywords: ['erase', 'brush', 'paint'] });

    add('co.view-result', t('cutout.cmd.view_result'), V, [], () => a.view('result'), { when: hasItem, checked: () => S.view === 'result' });
    add('co.view-before', t('cutout.cmd.view_before'), V, [], () => a.view('before'), { when: hasItem, checked: () => S.view === 'before' });
    add('co.view-mask', t('cutout.cmd.view_mask'), V, [], () => a.view('mask'), { when: hasItem, checked: () => S.view === 'mask' });
    add('co.view-fit', t('cutout.menu.fit'), V, ['0'], () => a.fit(), { when: hasItem });
    add('co.zoom-in', t('ui.zoom_in'), V, ['+', '='], () => a.zoom(1.25), { when: hasItem });
    add('co.zoom-out', t('ui.zoom_out'), V, ['-'], () => a.zoom(0.8), { when: hasItem });
    add('co.panel', t('cutout.cmd.panel'), V, [], () => a.panel());

    for (const [v, l, s] of [['pro', 'cutout.menu.theme_pro', 'dark'], ['light', 'cutout.menu.theme_light', 'light'], ['classic', 'cutout.menu.theme_classic', 'classic']]) {
      if (window.SlopTheme && !SlopTheme.has(s)) continue;   // a theme the site does not offer
      add('co.theme-' + v, t('cutout.cmd.theme', { name: t(l) }), V, [], () => a.theme(v), { checked: () => !!window.SlopTheme && SlopTheme.get() === s });
    }
    return C;
  }

  /** ai-commands.js and shared/commands/sources.js, loaded when the AI panel first asks. */
  function loadAI() {
    if (CO.aiCommands) return Promise.resolve();
    const one = (src) => new Promise((res, rej) => {
      const s = Object.assign(document.createElement('script'), { src, async: false });
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
    });
    return (window.SlopCmdSources ? Promise.resolve() : one('../shared/commands/sources.js')).then(() => one('js/ui/ai-commands.js'));
  }

  function init() {
    const SC = window.SlopCmd, a = CO.menus && CO.menus.act;
    if (!SC || !a) return;
    try {
      SC.init({ app: 'cutout' });
      const all = () => list(a).concat(CO.bulk && CO.bulk.commands ? CO.bulk.commands() : [], window.CO.configCommands ? window.CO.configCommands() : []);
      SC.register(all());
      CO.util.onLang(() => SC.register(all()));   // the palette follows a language switch
      if (SC.provide && !document.documentElement.dataset.offline) SC.provide({ prepare: loadAI });   // the assistant's batch commands (ai-commands.js)
    } catch (err) { console.warn('SlopIsolate: commands are off', err); }
  }

  CO.commands = { init };
})();
