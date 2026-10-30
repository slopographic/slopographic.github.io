/* Slop Upscale: SlopCmd commands (the Ctrl+K palette and the shortcut editor) for the page's own buttons, and the
 * assistant's commands with arguments (ai-commands.js), loaded by SlopCmd.prepare() when the AI panel first asks.
 * Classic script, after main.js. */
(function (g) {
  'use strict';
  const U = g.SlopUpscale, $ = (id) => document.getElementById(id);
  function loadAI() {
    if (U.aiCommands) return Promise.resolve();
    const one = (src) => new Promise((res, rej) => {
      const s = Object.assign(document.createElement('script'), { src, async: false });
      s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
    });
    return (g.SlopCmdSources ? Promise.resolve() : one('../shared/commands/sources.js')).then(() => one('js/app/ai-commands.js'));
  }
  function init() {
    const C = g.SlopCmd;
    if (!C) return;
    C.init({ app: 'upscale' });
    const click = (id) => () => { const b = $(id); if (b && !b.disabled) b.click(); };
    const on = (id) => () => { const b = $(id); return !!b && !b.disabled; };
    const t = (k) => (U.t ? U.t(k) : k);
    // titles and groups in the current language: built again on a language change
    const list = () => [
      { id: 'up.open', title: t('upscale.cmd.open'), group: t('menu.file'), keys: [], keywords: ['add', 'import'], run: click('up-open') },
      { id: 'up.drive', title: t('upscale.cmd.drive'), group: t('menu.file'), keys: [], keywords: ['drive'], run: click('up-drive') },
      { id: 'up.run', title: t('upscale.panel.run'), group: t('upscale.panel.run'), keys: [], keywords: ['start', 'enlarge', 'bigger'], when: on('up-run'), run: click('up-run') },
      { id: 'up.download', title: t('upscale.cmd.download'), group: t('menu.file'), keys: [], when: on('up-download'), run: click('up-download') },
      { id: 'up.save', title: t('upscale.cmd.save'), group: t('menu.file'), keys: [], when: on('up-save'), run: click('up-save') },
      { id: 'up.clear', title: t('upscale.panel.clear'), group: t('menu.edit'), keys: [], when: on('up-clear'), run: click('up-clear') },
    ];
    C.register(list());
    if (U.words) U.words.on(() => C.register(list()));
    if (C.provide) C.provide({ prepare: loadAI });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
