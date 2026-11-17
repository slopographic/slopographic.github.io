/* Slop Time commands for SlopCmd (palette, shortcut editor and menu labels). Classic script, loaded after
 * shared/commands/commands.js. Each command calls the same functions as the buttons. */
(function () {
  'use strict';
  const show = (id) => () => window.SlopTimeApp.show(id);
  const focus = (id) => () => { window.SlopTimeApp.show(id.split(':')[0]); const el = document.getElementById(id.split(':')[1]); if (el) el.focus(); };

  const t = (k) => (window.SlopI18n ? SlopI18n.t(k) : k);
  function register() {
    if (!window.SlopCmd) return;
    SlopCmd.init({ app: 'time' });
    words();
    if (window.SlopI18n) SlopI18n.on(words);   // the palette in the new language
  }
  /** The commands, with their titles in the chosen language. */
  function words() {
    const C = window.SlopTime.clocks;
    SlopCmd.register([
      { id: 'time.world', title: t('time.cmd.world'), group: t('time.cmd.g_go'), keys: ['Mod+Alt+1'], keywords: ['cities', 'clock'], run: show('world') },
      { id: 'time.my', title: t('time.cmd.my'), group: t('time.cmd.g_go'), keys: ['Mod+Alt+2'], keywords: ['working hours', 'overlap'], run: show('my') },
      { id: 'time.meet', title: t('time.cmd.meet'), group: t('time.cmd.g_go'), keys: ['Mod+Alt+3'], keywords: ['schedule', 'overlap', 'zones'], run: show('meet') },
      { id: 'time.convert', title: t('time.cmd.convert'), group: t('time.cmd.g_go'), keys: ['Mod+Alt+4'], keywords: ['converter', 'difference'], run: show('conv') },
      { id: 'time.timers', title: t('time.cmd.timers'), group: t('time.cmd.g_go'), keys: ['Mod+Alt+5'], keywords: ['countdown', 'lap'], run: show('timers') },
      { id: 'time.sync', title: t('time.cmd.sync'), group: t('time.cmd.g_go'), keys: ['Mod+Alt+6'], keywords: ['sync', 'offset', 'clock'], run: show('sync') },
      { id: 'time.add', title: t('time.cmd.add'), group: t('time.cmd.g_world'), keys: ['Mod+Alt+A'], keywords: ['zone', 'search'], run: focus('world:st-add') },
      { id: 'time.now', title: t('time.cmd.now'), group: t('time.cmd.g_convert'), keys: [], keywords: ['now'], run: () => { window.SlopTimeApp.show('conv'); window.SlopTime.conv.useNow(); } },
      { id: 'time.sw.toggle', title: t('time.cmd.sw_toggle'), group: t('time.cmd.g_timers'), keys: ['Mod+Alt+G'], keywords: ['stopwatch', 'run'], run: () => { window.SlopTimeApp.show('timers'); C.toggleStopwatch(); } },
      { id: 'time.sw.lap', title: t('time.cmd.sw_lap'), group: t('time.cmd.g_timers'), keys: [], keywords: ['split'], run: () => C.lap() },
      { id: 'time.sw.reset', title: t('time.cmd.sw_reset'), group: t('time.cmd.g_timers'), keys: [], keywords: ['clear'], run: () => C.resetStopwatch() },
      { id: 'time.tm.toggle', title: t('time.cmd.tm_toggle'), group: t('time.cmd.g_timers'), keys: [], keywords: ['timer', 'pause'], run: () => { window.SlopTimeApp.show('timers'); C.toggleTimer(); } },
      { id: 'time.tm.reset', title: t('time.cmd.tm_reset'), group: t('time.cmd.g_timers'), keys: [], keywords: ['timer'], run: () => C.resetTimer() },
    ]);
  }

  /** The assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks. */
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  if (window.SlopCmd && SlopCmd.provide) SlopCmd.provide({ prepare: () => new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: new URL('ai-commands.js', HERE).href });
    s.onload = res; s.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(s);
  }) });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();
})();
