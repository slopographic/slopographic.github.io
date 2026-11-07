/* SlopIsolate — what can be done to the selected pictures, besides the settings (the panel edits those, ui/edit.js):
 * clear brush edits (one undo step for all), export as one ZIP, save to Slop Drive, Open in…, Run a workflow… (the
 * selected pictures go in), Add to a workflow… (with the settings they share), remove. Plus Copy settings, Paste
 * settings and Apply these settings to all. One list of actions feeds the settings panel's menu (panel-head.js), the
 * queue's right-click menu and the SlopCmd commands (so the palette and macros can run them).
 * CO.bulk.act(name, arg) · menuItems() · commands() */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, H = CO.history, B = CO.bulk, E = CO.edit, t = U.t;
  const toast = (m) => CO.emit('toast', m);
  const pics = () => B.items().filter((it) => it.kind !== 'video');
  const ready = () => pics().filter((it) => it.status === 'done');
  const word = (n) => t('cutout.act.pictures_n', { n });
  const hub = () => (document.documentElement.dataset.offline ? null : window.SlopHub || null);

  /** A brush-edit reset as an undo entry (the same one Edit ▸ Clear brush edits pushes). */
  function clearEntry(it, group) {
    if (!CO.brush.hasEdits(it)) return false;
    const old = it.edit.slice();
    it.edit.fill(128);
    const e = { kind: 'stroke', label: 'cutout.menu.clear_edits', tiles: [{ x0: 0, y0: 0, w: it.w, h: it.h, bytes: old }], rect: { x: 0, y: 0, x1: it.w, y1: it.h } };
    if (group) e.group = group;
    H.push(it, e);
    return true;
  }
  B.clearEntry = clearEntry;

  const ACTIONS = {
    copy() { if (E.copy()) toast(t('cutout.act.copied')); },
    paste() {
      const items = S.targets();
      if (!E.clip()) return toast(t('cutout.act.copy_first'));
      E.paste(items);
      toast(t('cutout.act.pasted', { what: word(items.length) }));
    },
    applyAll() {
      if (!S.current()) return toast(t('cutout.act.open_picture'));
      E.applyToAll();
      toast(t('cutout.act.applied_all', { what: word(S.items.filter((it) => it.kind !== 'video').length) }));
    },
    selectAll: () => B.selectAll(),
    selectNone: () => B.clear(),
    clear() {
      const g = H.group();
      const n = pics().filter((it) => clearEntry(it, g)).length;
      toast(n ? t('cutout.act.cleared', { what: word(n) }) : t('cutout.menu.no_edits'));
    },
    export() {
      const items = ready();
      if (!items.length) return toast(t('cutout.act.none_ready'));
      return CO.export.all(items);
    },
    drive() {
      if (!CO.drive || !CO.drive.ready()) return toast(t('cutout.act.no_drive'));
      return B.run(t('cutout.act.saving_drive'), ready(), async (it) => {
        const { blob, ext } = await CO.export.encode(it);
        await CO.drive.saveResult(it, blob, U.baseName(it.name) + '-cutout.' + ext);
      });
    },
    /** Run a workflow… on the finished pictures of the selection (as exported: background, shadow, crop). */
    async workflow() {
      if (!window.SlopWorkflowEntry) return toast(t('cutout.act.no_workflows'));
      return window.SlopWorkflowEntry.open({ files: await B.files(), ask: false });
    },
    addToWorkflow: () => CO.menus.act.workflow(),
    remove() {
      const items = B.items();
      if (!items.length || !window.confirm || !window.confirm(t('cutout.act.remove_ask', { what: word(items.length) }))) return;
      B.clear();
      return B.run(t('cutout.act.removing'), items, (it) => CO.process.remove(it));
    },
  };
  B.act = (name, arg) => {
    const fn = ACTIONS[name];
    return fn ? Promise.resolve().then(() => fn(arg)).catch((e) => toast(e.message || String(e))) : undefined;
  };

  /** The settings panel's menu (and the queue's right-click menu on a selected picture). */
  B.menuItems = function () {
    const cur = S.current(), clip = E.clip(), many = S.bulk(), n = S.targets().length;
    const all = S.items.filter((it) => it.kind !== 'video').length;
    const out = [
      { label: t('cutout.act.copy'), act: () => B.act('copy'), disabled: !cur || cur.kind === 'video' },
      { label: many ? t('cutout.act.paste_on', { what: word(n) }) : t('cutout.act.paste'), act: () => B.act('paste'), disabled: !clip || !n },
      { label: t('cutout.act.apply_all_n', { what: word(all) }), act: () => B.act('applyAll'), disabled: !cur || all < 2 },
    ];
    if (!many) return out.concat('-', { label: t('cutout.act.select_all'), key: 'Ctrl+A', act: () => B.act('selectAll'), disabled: S.items.length < 2 });
    const r = ready().length, openIn = CO.openIn.bulkItems();
    out.push('-',
      { label: t('cutout.act.export_n', { what: word(r) }), act: () => B.act('export'), disabled: !r },
      { label: t('cutout.menu.open_in'), sub: openIn, disabled: !openIn.length });
    if (hub()) out.push({ label: t('cutout.act.save_n', { what: word(r) }), act: () => B.act('drive'), disabled: !r });
    if (window.SlopWorkflowEntry) out.push({ label: t('cutout.act.run_workflow'), act: () => B.act('workflow') });
    if (window.SlopFlowDoc) out.push({ label: t('cutout.menu.add_workflow'), act: () => B.act('addToWorkflow') });
    out.push('-',
      { label: t('cutout.menu.clear_edits'), act: () => B.act('clear'), disabled: !pics().some((it) => CO.brush.hasEdits(it)) },
      { label: t('cutout.act.remove_n', { what: word(B.items().length) }), act: () => B.act('remove') },
      { label: t('cutout.act.select_none'), key: 'Esc', act: () => B.act('selectNone') });
    return out;
  };

  /** SlopCmd rows (ui/commands.js registers them with the rest). */
  B.commands = function () {
    const sel = () => S.bulk();
    const row = (id, title, name, when, keywords) => ({ id, title, group: t('menu.edit'), keys: [], run: () => B.act(name), when, keywords });
    return [
      row('co.copy-settings', t('cutout.act.copy'), 'copy', () => !!S.current(), ['copy', 'look', 'settings']),
      row('co.paste-settings', t('cutout.act.paste'), 'paste', () => !!E.clip() && S.targets().length > 0, ['paste', 'look', 'settings', 'bulk']),
      row('co.apply-all', t('cutout.act.apply_all'), 'applyAll', () => !!S.current() && S.items.length > 1, ['bulk', 'batch', 'all', 'look']),
      row('co.select-all', t('cutout.act.select_all'), 'selectAll', () => S.items.length > 0, ['bulk', 'batch', 'selection']),
      row('co.select-none', t('cutout.act.select_none'), 'selectNone', () => S.sel.size > 0, ['deselect', 'selection']),
      row('co.bulk-clear-edits', t('cutout.act.bulk_clear'), 'clear', sel, ['bulk', 'reset', 'brush']),
      row('co.bulk-export', t('cutout.act.bulk_export'), 'export', sel, ['bulk', 'zip', 'download']),
      row('co.bulk-drive', t('cutout.act.bulk_drive'), 'drive', () => sel() && !!hub(), ['bulk', 'drive', 'save']),
      row('co.bulk-workflow', t('cutout.act.bulk_workflow'), 'workflow', () => sel() && !!window.SlopWorkflowEntry, ['bulk', 'workflow', 'batch']),
      row('co.bulk-remove', t('cutout.act.bulk_remove'), 'remove', sel, ['bulk', 'delete']),
    ];
  };

  /** The finished pictures of the selection (or the one on screen) as PNG files, as exported. */
  B.files = async function () {
    const items = (S.bulk() ? pics() : [S.current()]).filter((it) => it && it.kind !== 'video' && it.status === 'done');
    const out = [];
    for (const it of items) out.push(new File([(await CO.export.encode(it, 'png')).blob], U.baseName(it.name) + '-cutout.png', { type: 'image/png' }));
    return out;
  };
  // Run a workflow… (the shared command and dialog) asks the page for its files: the selected pictures, or the one on screen.
  window.addEventListener('slop:convert-files', (e) => e.detail.provide(() => B.files(), { app: 'SlopIsolate' }));
})();
