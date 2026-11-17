/* Slop Resize: SlopCmd commands and their keys (the palette and the shortcut editor both list them). Classic script; adds
 * window.SlopResize.commands.install(api), where api is the controller in main.js. A command that changes a setting
 * sets the panel's own control and fires 'change', so the panel updates exactly as if the person had picked it.
 * SlopCmd.prepare() loads ai-commands.js and ai-files.js: the assistant's commands with arguments, state and checkpoint. */
(function (g) {
  'use strict';
  const NS = g.SlopResize, C = (NS.commands = {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let provided = false;

  function setField(id, value) {
    const e = $(id);
    if (!e) return;
    e.value = String(value);
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const busy = () => NS.queue.busy();
  const hasItems = () => NS.queue.items().some((i) => i.src);
  const hasDone = () => NS.queue.items().some((i) => i.status === 'done');
  const hasUnsaved = () => NS.queue.items().some((i) => i.status === 'done' && !i.drive);

  C.install = function (api) {
    if (!g.SlopCmd) return;
    // titles and groups in the page's language; app/main.js installs them again on a language change
    const MODES = [['size', t('resize.cmd.mode_size')], ['scale', t('resize.cmd.mode_scale')], ['long', t('resize.cmd.mode_long')], ['bytes', t('resize.cmd.mode_bytes')]];
    const FILLS = [['fit', t('resize.panel.fill_fit')], ['cover', t('resize.panel.fill_cover')], ['stretch', t('resize.panel.fill_stretch')], ['within', t('resize.panel.fill_within')]];
    const FILE = t('menu.file'), RUN = t('resize.cmd.g_resize'), PRESETS = t('resize.cmd.g_presets'), SIZE = t('resize.panel.g_size');
    const list = [
      { id: 'rs.open', title: t('resize.cmd.open'), group: FILE, keys: ['Mod+O'], keywords: ['add', 'import', 'photo', 'video'], run: () => api.open() },
      { id: 'rs.drive', title: t('resize.cmd.drive'), group: FILE, keys: ['Shift+Mod+O'], keywords: ['drive', 'saved', 'file'], run: () => api.drive() },
      { id: 'rs.zip', title: t('resize.cmd.zip'), group: FILE, keys: ['Mod+S'], keywords: ['save', 'zip', 'download'], when: hasDone, run: () => api.downloadAll() },
      { id: 'rs.save-drive', title: t('resize.cmd.save_drive'), group: FILE, keys: ['Shift+Mod+S'], keywords: ['drive', 'keep', 'store'], when: () => hasUnsaved() && !busy(), run: () => api.saveAll() },
      { id: 'rs.run', title: t('resize.cmd.run'), group: RUN, keys: ['Mod+Enter'], keywords: ['start', 'go', 'convert', 'run'], when: () => hasItems() && !busy(), run: () => api.run() },
      { id: 'rs.cancel', title: t('resize.cmd.cancel'), group: RUN, keys: ['Escape'], keywords: ['stop', 'abort'], when: busy, run: () => api.cancel() },
      { id: 'rs.clear', title: t('resize.cmd.clear'), group: t('menu.edit'), keywords: ['remove', 'empty', 'reset'], when: () => !busy() && NS.queue.items().length > 0, run: () => api.clear() },
      { id: 'rs.preset-save', title: t('resize.cmd.preset_save'), group: PRESETS, keys: ['Shift+Mod+P'], keywords: ['saved', 'remember'], run: () => $('rs-save-as').click() },
      { id: 'rs.preset-apply', title: t('resize.cmd.preset_apply'), group: PRESETS, keywords: ['saved', 'load'], run: () => $('rs-apply').click() },
      ...MODES.map(([mode, title]) => ({ id: 'rs.mode.' + mode, title, group: SIZE, keywords: ['mode', 'scale', 'dimensions'], run: () => setField('rs-mode', mode) })),
      ...FILLS.map(([fill, title]) => ({ id: 'rs.fill.' + fill, title: t('resize.cmd.fill', { fill: title }), group: SIZE, keywords: ['fill', 'letterbox', 'crop', 'stretch'], run: () => { setField('rs-mode', 'size'); setField('rs-fill', fill); } })),
      ...NS.size.PRESETS.map((p) => ({ id: 'rs.target.' + p.id, title: t('resize.cmd.target', { size: NS.size.presetLabel(p) }), group: t('resize.cmd.g_target'), keywords: ['resize', 'dimensions', `${p.w}x${p.h}`, `${p.w}×${p.h}`], run: () => setField('rs-preset', p.id) })),
    ];
    g.SlopCmd.register(list);
    if (g.SlopCmd.provide && !provided) { provided = true; g.SlopCmd.provide({ prepare: loadAICommands }); }   // the assistant's commands load when first needed
  };

  /** ai-commands.js (commands with arguments, the state summary, the checkpoint), loaded on demand, never on first paint. */
  function loadAICommands() {
    if (NS.aiCommands && NS.aiFiles) return Promise.resolve();
    const one = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.append(s);
    });
    // shared/commands/sources.js finds Slop Drive files for add_files (ai-files.js)
    return (g.SlopCmdSources ? Promise.resolve() : one('../shared/commands/sources.js')).then(() => one('js/app/ai-commands.js')).then(() => one('js/app/ai-files.js'));
  }
})(typeof window !== 'undefined' ? window : globalThis);
