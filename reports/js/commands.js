/* Slop Reports: the page's commands, registered with SlopCmd (the Ctrl+K palette and the shortcut editor): pick a built-in
 * or saved report, export the rows as CSV, write a new report. The assistant's commands with arguments (js/ai-commands.js)
 * load when the AI panel first asks (SlopCmd.prepare). Classic script, after app.js. */
(function (g) {
  'use strict';
  const C = g.SlopCmd, R = g.SlopReports;
  if (!C || !R || !R.app) return;
  const HERE = (g.document.currentScript && g.document.currentScript.src) || new URL('js/commands.js', g.location.href).href;
  C.init({ app: 'reports' });
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const reg = () => C.register([
    { id: 'reports.csv', title: t('reports.cmd.csv'), group: t('reports.cmd.g_file'), keys: [], keywords: ['download', 'spreadsheet'], run: () => R.app.exportCsv() },
    { id: 'reports.new', title: t('reports.cmd.new'), group: t('reports.cmd.g_file'), keys: [], keywords: ['create', 'custom'], run: () => g.document.getElementById('new').click() },
    ...R.BUILTIN.map((d) => ({ id: 'reports.open.' + d.id, title: t('reports.cmd.open', { title: (R.localDef ? R.localDef(d) : d).title }), group: t('reports.cmd.g_reports'), keys: [], run: () => R.app.choose(d.id) })),
  ]);
  reg();
  if (g.SlopI18n) g.SlopI18n.on(reg);   // the palette in the new language
  if (C.provide) C.provide({ prepare: () => (C.get('reports.ai.create-report') ? null : new Promise((res, rej) => {
    const s = Object.assign(g.document.createElement('script'), { src: new URL('ai-commands.js', HERE).href, async: false });
    s.onload = res; s.onerror = () => rej(new Error('Could not load ai-commands.js')); g.document.head.append(s);
  })) });
})(window);
