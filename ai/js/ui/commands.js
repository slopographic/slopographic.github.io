/* Slop AI — ui/commands: every action as a command for the shared palette (window.SlopCmd). Without SlopCmd a
 * small private key map still handles the essentials. */
'use strict';
(function (AI) {
  const E = AI.E;
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  AI.commands = function () {
    // titles and groups from the tables (ai/i18n/<code>/commands.js); ids, keys and keywords stay English (API)
    const T = AI.t, G = (g) => T('ai.cmd.group_' + g);
    const C = (id, title, group, keys, run, extra = {}) => Object.assign({ id: 'ai.' + id, title, group: G(group), keys, run }, extra);
    return [
      C('newChat', T('ai.cmd.new_chat'), 'chat', ['Shift+Mod+O'], () => AI.newChat(), { keywords: ['conversation', 'clear'] }),
      C('stop', T('ai.cmd.stop'), 'chat', ['Escape'], () => { AI.chat.stop(); AI.builder.stop(); }, { when: () => AI.chat.busy || AI.builder.busy }),
      C('regenerate', T('ai.cmd.regenerate'), 'chat', [], () => AI.chat.regenerate(), { when: () => !!(AI.chat.conv && AI.chat.conv.messages.length) && !AI.chat.busy }),
      C('rename', T('ai.cmd.rename'), 'chat', [], () => AI.renameConv(), { when: () => !!(AI.chat.conv && AI.chat.conv.messages.length) }),
      C('delete', T('ai.cmd.delete'), 'chat', [], () => AI.deleteConv(), { when: () => !!(AI.chat.conv && AI.chat.conv.messages.length) }),
      C('settings', T('ai.cmd.settings'), 'chat', [], () => AI.settingsDialog(AI.chat.conv), { keywords: ['system prompt', 'temperature', 'max tokens'] }),
      C('tools', T('ai.cmd.tools'), 'chat', [], () => AI.$('btnTools').click(), { checked: () => !!(AI.chat.conv ? AI.chat.conv.tools : AI.prefs.tools), keywords: ['agent', 'tools'] }),
      C('attach', T('ai.cmd.attach'), 'chat', [], () => AI.chat.attachMenu()),
      C('exportMd', T('ai.cmd.export_md'), 'chat', [], () => AI.exportItems()[0].act(), { when: () => !!(AI.chat.conv && AI.chat.conv.messages.length) }),
      C('exportJson', T('ai.cmd.export_json'), 'chat', [], () => AI.exportItems()[1].act(), { when: () => !!(AI.chat.conv && AI.chat.conv.messages.length) }),
      C('import', T('ai.cmd.import'), 'chat', [], () => AI.importConv()),
      C('save', T('ai.cmd.save'), 'chat', ['Mod+S'], () => AI.saveChatToDrive(), { when: () => !!(AI.chat.conv && AI.chat.conv.messages.length) && !!window.SlopHub }),
      C('openDrive', T('ai.cmd.open_drive'), 'chat', [], () => AI.openChatFromDrive(), { when: () => !!window.SlopHub }),
      C('newBuild', T('ai.cmd.new_build'), 'build', [], () => { AI.setTab('build'); AI.newBuild(); }),
      ...AI.TEMPLATES.map((t) => C('tpl.' + t.id, T('ai.cmd.template', { name: AI.tplName(t) }), 'build', [], () => { AI.setTab('build'); document.querySelector(`[data-tpl="${t.id}"]`) ? document.querySelector(`[data-tpl="${t.id}"]`).click() : AI.newBuild(); })),
      ...AI.TABS.map(([id], i) => C('tab.' + id, T('ai.cmd.go_to', { name: AI.tabLabel(id) }), 'go', ['Alt+' + (i + 1)], () => AI.setTab(id), { checked: () => AI.tab === id })),
      C('unload', T('ai.cmd.unload'), 'model', [], () => E.unload(), { when: () => !!(E.engine && E.engine.loaded) }),
      C('pause', T('ai.cmd.pause'), 'model', [], () => E.pause(), { when: () => E.state === 'loading' }),
      C('cancel', T('ai.cmd.cancel'), 'model', [], () => E.cancel(), { when: () => E.state === 'loading' || E.state === 'paused' }),
      C('disk', T('ai.cmd.disk'), 'model', [], () => AI.importModelFolder(), { when: () => !E.isFake() }),
      C('engine', T('ai.cmd.engine'), 'model', [], () => AI.switchEngine(E.isFake() ? 'webllm' : 'fake'), { keywords: ['fake', 'webllm'] }),
      C('check', T('ai.cmd.check'), 'model', [], () => { AI.setTab('sys'); AI.runCheck({ bench: true }); }, { keywords: ['benchmark', 'gpu', 'webgpu'] }),
      C('specCard', T('ai.cmd.spec_card'), 'model', [], () => AI.specCardDialog(AI.sys), { when: () => !!AI.sys }),
      C('sloppo', T('ai.cmd.sloppo'), 'help', [], () => AI.askSloppo(), { keywords: ['mascot', 'buddy'] }),
      ...AI.THEMES.map(([t]) => C('theme.' + t, T('ai.cmd.theme', { name: AI.themeLabel(t) }), 'view', [], () => AI.setTheme(t), { checked: () => document.documentElement.getAttribute('data-theme') === t })),
      C('palette', T('ai.cmd.palette'), 'help', [], () => AI.openPalette()),
      C('shortcuts', T('ai.cmd.shortcuts'), 'help', [], () => window.SlopCmd && SlopCmd.openKeymap && SlopCmd.openKeymap()),
    ];
  };

  /** Register with SlopCmd when it exists; returns true when it did. */
  AI.wireCommands = function () {
    const S = window.SlopCmd;
    if (!S || !S.register) { fallbackKeys(); return false; }
    try { if (S.init) S.init({ app: 'ai' }); S.register(AI.commands()); } catch (e) { console.warn('SlopCmd', e); fallbackKeys(); return false; }
    // the assistant's commands with arguments (ai-commands.js: new_chat, send_message, export_chat…), loaded when first asked
    if (S.provide) S.provide({ prepare: () => new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
      { src: new URL('ai-commands.js', HERE).href, onload: res, onerror: () => rej(new Error('Could not load ai-commands.js')) }))) });
    AI.$('btnCmd').hidden = false;
    AI.onLang(() => { try { S.register(AI.commands()); } catch (e) { console.warn('SlopCmd', e); } });   // the palette follows a switch
    return true;
  };
  function fallbackKeys() {
    if (AI._keys) return; AI._keys = true;
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (AI.chat.busy || AI.builder.busy)) { AI.chat.stop(); AI.builder.stop(); }
      if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); AI.setTab(AI.TABS[+e.key - 1][0]); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); AI.newChat(); }
    });
  }
})(window.AI);
