/* SlopWorkflowEntry: the small way into Slop Workflows from any page. Classic script, no dependencies; the workflow tool
 * itself (shared/ops/dialog.js and the modules it imports) loads only when one of these is used.
 *   SlopWorkflowEntry.open({ files, workflow, ask })   the "Run a workflow…" dialog (see dialog.js); resolves with its control
 *   SlopWorkflowEntry.menuItems(getFiles, { app })      items for a file's menu, such as the shared Open in… menu:
 *       "Run a workflow…"     the dialog, with these files in
 *       "Add to a workflow…"  the Workflows page in a new tab, with these files in (through Slop Drive, ?drive=)
 *     getFiles() → File[] or a Promise of them (called only when an item is picked). Items: { label, act, keywords }.
 *   SlopWorkflowEntry.register(addItems)               for a menu that collects entries from apps and tools: calls
 *       addItems({ id: 'workflows', items: menuItems }) at once, so a menu can keep the provider and ask it per file
 * The same "Run a workflow…" is a SlopCmd command on every page that loads shared/commands (commands.js, cmd.workflow). */
(function (g) {
  'use strict';
  if (g.SlopWorkflowEntry) return;
  const SCRIPT = document.currentScript;
  // An offline copy inlines this script into a blob: page, where there is no site root: the entry then says Workflows
  // are online only (open() catches it) instead of failing as the page loads.
  let ROOT = '';
  try { ROOT = SCRIPT && SCRIPT.src ? new URL('../../', SCRIPT.src).href : new URL('/', location.href).href; } catch (e) { ROOT = ''; }
  const toast = (m) => { if (g.SlopUI && g.SlopUI.toast) g.SlopUI.toast(m); };
  // words: shared/i18n/ui/<code>/ops.js (read when a menu is built, so they follow the language)
  const tr = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);

  function open(o = {}) {
    return Promise.resolve().then(() => import(new URL('shared/ops/dialog.js', ROOT).href)).then((m) => m.open(o)).catch((e) => {
      console.warn(e);
      toast(tr('ui.ops.entry.offline'));
      return null;
    });
  }
  async function addTo(getFiles) {
    const files = [].concat((await getFiles()) || []);
    const H = g.SlopHub;
    if (!files.length || !H) { g.open(new URL('workflows/', ROOT).href, '_blank'); return; }
    // the one way out (shared/intake/outtake.js) where the page has it: the file goes through Slop Drive
    if (g.SlopOuttake) await g.SlopOuttake.send('workflows', { get: () => files[0], name: files[0].name || 'file', type: files[0].type || '' });
    else await H.sendTo('workflows', files[0], files[0].name || 'file');
  }
  function menuItems(getFiles) {
    return [
      { label: tr('ui.cmd.workflow_dots'), keywords: ['workflow', 'batch', 'pipeline'], act: async () => open({ files: [].concat((await getFiles()) || []), ask: false }) },
      { label: tr('ui.ops.entry.add_dots'), keywords: ['workflow', 'batch', 'pipeline'], act: () => addTo(getFiles) },
    ];
  }
  function register(addItems) { if (typeof addItems === 'function') addItems({ id: 'workflows', label: 'Slop Workflows', items: menuItems }); }   // i18n-ignore: a group id (search words), an app name

  g.SlopWorkflowEntry = { open, menuItems, register, ROOT };
})(window);
