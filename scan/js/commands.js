/* Slop Scan: SlopCmd commands (Ctrl+K, the shortcut editor, macros) for the page's own actions, and the assistant's
 * commands with arguments (ai-commands.js), loaded by SlopCmd.prepare() when the AI panel (or WebMCP, a macro) first asks,
 * after shared/commands/sources.js. Ctrl+Enter downloads the PDF; the brackets turn the page. Classic script, after main.js. */
(function (g) {
  'use strict';
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const load = (src) => new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: new URL(src, HERE).href });
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
  });
  function init() {
    const C = g.SlopCmd, S = g.SlopScan;
    if (!C || !S || !S.pages) return;
    C.init({ app: 'scan' });
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    const has = () => S.pages.size() > 0, cur = () => S.pages.current();
    const turn = (by) => () => { const p = cur(); if (p) S.pages.set(p.id, { turn: p.turn + by, auto: false }); };
    const list = () => [
      { id: 'scan.camera', title: t('scan.cmd.camera'), group: t('menu.file'), keywords: ['photo', 'camera', 'scan', 'capture'], run: () => S.io.camera() },
      { id: 'scan.add', title: t('scan.cmd.add'), group: t('menu.file'), keywords: ['open', 'import', 'heic', 'jpg'], run: () => S.io.pick() },
      { id: 'scan.pdf', title: t('scan.cmd.pdf'), group: t('menu.file'), keys: ['Ctrl+Enter'], keywords: ['export', 'download', 'save'], when: has, run: () => S.panel.run((say) => S.io.downloadPdf(say), true) },
      { id: 'scan.to-pdf', title: t('scan.cmd.to_pdf'), group: t('menu.file'), keywords: ['edit', 'sign', 'merge'], when: has, run: () => S.panel.run((say) => S.io.toPdfEditor(say), true) },
      { id: 'scan.drive', title: t('scan.cmd.drive'), group: t('menu.file'), when: has, run: () => S.panel.run((say) => S.io.saveToDrive(say), true) },
      { id: 'scan.jpg', title: t('scan.cmd.jpg'), group: t('menu.file'), keywords: ['image', 'picture', 'export'], when: has, run: () => S.panel.run(() => S.io.downloadImages('image/jpeg')) },
      { id: 'scan.png', title: t('scan.cmd.png'), group: t('menu.file'), keywords: ['image', 'picture', 'export'], when: has, run: () => S.panel.run(() => S.io.downloadImages('image/png')) },
      { id: 'scan.corners', title: t('scan.cmd.corners'), group: t('menu.edit'), keywords: ['crop', 'edges', 'perspective'], when: has, run: () => S.view.mode(S.view.mode() === 'corners' ? 'result' : 'corners') },
      { id: 'scan.turn-left', title: t('scan.cmd.turn_left'), group: t('menu.edit'), keys: ['['], keywords: ['rotate'], when: has, run: turn(-1) },
      { id: 'scan.turn-right', title: t('scan.cmd.turn_right'), group: t('menu.edit'), keys: [']'], keywords: ['rotate'], when: has, run: turn(1) },
      { id: 'scan.remove', title: t('scan.cmd.remove'), group: t('menu.edit'), keywords: ['delete'], when: has, run: () => S.pages.remove(cur().id) },
      ...S.filters.STYLES.map((s) => ({ id: 'scan.style.' + s, title: t('scan.cmd.style', { style: t('scan.style.' + s) }), group: t('scan.panel.style'), keywords: ['filter', 'look', s], when: has, run: () => S.pages.set(cur().id, { style: s }) })),
    ];
    C.register(list());
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => C.register(list()));
    if (C.provide) C.provide({ prepare: () => (g.SlopCmdSources ? Promise.resolve() : load('../../shared/commands/sources.js')).then(() => load('ai-commands.js')) });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
