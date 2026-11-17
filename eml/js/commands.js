/* Slop EML: SlopCmd commands (the palette, the shortcuts and the menu bar's File, Edit and View menus, which list them
 * by id). Classic script; exposes window.EmlCommands. Shortcuts go through SlopCmd only. Mod+P is left to the palette and
 * the browser. The side panel's show/hide command ('eml.panel', Ctrl+Alt+B) is SlopFrame's own. */
(function () {
  'use strict';
  if (window.EmlCommands) return;
  const A = () => window.EmlApp;
  const X = () => window.EmlActions;
  const E = () => window.EmlExport;
  const has = () => !!A().current();
  const any = () => A().docs().length > 0;
  const hasHtml = () => has() && A().current().msg.html != null;
  const hasText = () => has() && A().current().msg.text != null;
  const hasCids = () => has() && window.EmlMime.cidRefs(A().current().msg.html) > 0;
  const many = () => A().docs().length > 1;
  const scope = () => E().scope('checked');
  const anyAtts = () => scope().some((d) => d.msg.attachments.length);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function list() {
    const FILE = t('menu.file'), VIEW = t('menu.view');   // titles in the page's language: relang() registers them again
    const C = (id, title, group, keys, extra = {}) => Object.assign({ id: 'eml.' + id, title, group, keys, run: () => {} }, extra);
    return [
      C('open', t('eml.cmd.open'), FILE, ['Mod+O'], { keywords: ['load', 'file', 'eml', 'mbox', 'mailbox', 'picker', 'computer'], run: () => X().pick() }),
      C('export', t('eml.cmd.export'), FILE, [], { keywords: ['save', 'download', 'pdf', 'text', 'html', 'markdown', 'csv', 'zip'], when: any, run: () => E().dialog() }),
      C('pdf', t('eml.cmd.pdf'), FILE, [], { keywords: ['pdf', 'save', 'export', 'document'], when: any, run: () => X().convertPdf() }),
      C('combine', t('eml.cmd.combine'), FILE, [], { keywords: ['merge', 'join', 'pdf', 'many', 'all', 'contents'], when: many, run: () => X().combine() }),
      C('pdfzip', t('eml.cmd.pdfzip'), FILE, [], { keywords: ['pdf', 'zip', 'each', 'separate'], when: any, run: () => E().run('pdfzip', scope()) }),
      C('attzip', t('eml.cmd.attzip'), FILE, [], { keywords: ['attachments', 'files', 'zip', 'download'], when: anyAtts, run: () => E().run('atts', scope()) }),
      C('csv', t('eml.cmd.csv'), FILE, [], { keywords: ['csv', 'list', 'spreadsheet', 'table', 'index'], when: any, run: () => E().run('csv', scope()) }),
      C('topdf', t('eml.cmd.topdf'), FILE, [], { keywords: ['sign', 'annotate', 'merge', 'pdf', 'send'], when: any, run: () => X().openInPdf() }),
      C('print', t('eml.cmd.print'), FILE, [], { keywords: ['printer', 'paper', 'pdf'], when: has, run: () => X().print() }),
      C('close', t('eml.cmd.close'), FILE, [], { keywords: ['tab', 'remove'], when: has, run: () => A().close(A().current().id) }),
      C('selectall', t('eml.cmd.selectall'), VIEW, [], { keywords: ['tick', 'check', 'every'], when: many, run: () => A().checkAll(true) }),
      C('selectnone', t('eml.cmd.selectnone'), VIEW, [], { keywords: ['untick', 'none', 'deselect'], when: () => A().checkedDocs().length > 0, run: () => A().checkAll(false) }),
      C('next', t('eml.cmd.next'), VIEW, ['Alt+ArrowDown'], { keywords: ['tab', 'forward', 'down'], when: many, run: () => A().step(1) }),
      C('prev', t('eml.cmd.prev'), VIEW, ['Alt+ArrowUp'], { keywords: ['tab', 'back', 'up'], when: many, run: () => A().step(-1) }),
      C('pin', t('eml.cmd.pin'), VIEW, [], { keywords: ['tab', 'keep'], when: has, run: () => A().togglePin() }),
      C('html', t('eml.cmd.html'), VIEW, [], { keywords: ['layout', 'rich'], when: () => hasHtml() && hasText(), run: () => A().setView('html') }),
      C('plain', t('eml.cmd.plain'), VIEW, [], { keywords: ['text', 'plain'], when: () => hasHtml() && hasText(), run: () => A().setView('text') }),
      C('images', t('eml.cmd.images'), VIEW, [], { keywords: ['cid', 'inline', 'pictures', 'logo'], when: hasCids, run: () => A().toggleCids() }),
    ];
  }

  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  function register() {
    if (!window.SlopCmd) return;
    SlopCmd.init({ app: 'eml' });
    SlopCmd.register(list());
    // the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
    if (SlopCmd.provide) SlopCmd.provide({ prepare: () => new Promise((res, rej) => {
      const s = Object.assign(document.createElement('script'), { src: new URL('ai-commands.js', HERE).href });
      s.onload = res; s.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(s);
    }) });
  }

  /** A language change: the same commands again, with their titles in the new language. */
  function relang() { if (window.SlopCmd) SlopCmd.register(list()); }

  window.EmlCommands = { list, register, relang };
})();
