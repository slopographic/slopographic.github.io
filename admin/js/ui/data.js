// The Data tab: record counts per collection, the full backup download, a validated restore (the whole file is
// checked before anything is written; a bad file changes nothing), and the reset (typed word RESET; the backup is
// offered as a download before anything is erased).
(function (g) {
  'use strict';
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function render() {
    const r = await NS.overview.counts();
    if (!r.ok) { $('dCounts').replaceChildren(el('tr', null, el('td', { colspan: 3, class: 'msg' }, NS.util.refusal(r)))); return; }
    $('dCounts').replaceChildren(...Object.entries(r.value).map(([name, c]) => el('tr', { 'data-collection': name },
      el('td', null, name), el('td', { class: 'num' }, String(c.live)), el('td', { class: 'num' }, String(c.deleted)))));   // i18n-ignore: collection names are ids
  }

  async function backup() {
    const f = await NS.restore.exportFile();
    if (!f.ok) { UI.toast(NS.util.refusal(f)); return; }
    UI.download(f.value.blob, f.value.name);
    UI.toast(t('admin.da.downloaded'));
  }

  /** Reads the chosen file, checks it whole, then asks before replacing everything. */
  async function restoreFrom(file) {
    const msg = $('dRestoreMsg');
    msg.textContent = '';
    if (!file) return;
    const text = await file.text();
    const c = NS.restore.check(text);
    if (!c.ok) { msg.textContent = c.message; return; }
    const total = Object.values(c.value.counts).reduce((a, b) => a + b, 0);
    UI.confirm(t('admin.da.replace_q'), c.value.exportedAt ? t('admin.da.replace_body_at', { n: String(total), date: c.value.exportedAt.slice(0, 10) }) : t('admin.da.replace_body', { n: String(total) }),
      t('admin.da.restore'), { danger: true }).then(async (yes) => {
      if (!yes) return;
      const r = await NS.restore.restore(text);
      msg.textContent = r.ok ? t('admin.da.restored_n', { n: String(total) }) : r.message;
      if (r.ok) UI.toast(t('admin.da.restored'));
    });
  }

  /** The reset dialog: type RESET, and the full backup downloads before anything is erased. */
  function reset() {
    const input = el('input', { type: 'text', autocomplete: 'off', 'aria-label': t('admin.da.type_reset'), placeholder: 'RESET', id: 'rInput' });
    const msg = el('p', { class: 'msg', role: 'alert' });
    UI.dialog({
      title: t('admin.da.reset_title'), cls: 'danger-dlg',
      body: el('div', null, el('p', { class: 'sui-p' }, t('admin.da.reset_body')),
        UI.field(t('admin.da.type_caps'), input), msg),
      buttons: [{ label: t('menu.cancel') }, { label: t('admin.da.export_reset'), primary: true, danger: true, act: async () => {
        if (input.value.trim() !== 'RESET') { msg.textContent = t('admin.da.not_typed'); return false; }
        const r = await NS.overview.exportAndReset((blob, name) => UI.download(blob, name));
        if (!r.ok) { msg.textContent = t('admin.da.not_erased', { why: NS.util.refusal(r) }); return false; }
        UI.toast(t('admin.da.reset_done'));
        await NS.app.render();
        return true;
      } }],
    });
    setTimeout(() => input.focus(), 30);
  }

  function mount() {
    $('dBackup').addEventListener('click', backup);
    $('dEverything').addEventListener('click', () => g.SlopBackup.openEverything());
    // a backup file comes in one way: the intake's part 'admin.backup' (shared/intake)
    g.SlopIntake.register({ id: 'admin.backup', main: false, paste: false, toast: false, limit: 1, accept: { any: true, noun: 'admin.da.noun' }, process: async (f) => { await restoreFrom(f); return f.name; } });
    $('dRestore').addEventListener('click', () => g.SlopIntake.pick({ to: 'admin.backup', multiple: false, accept: 'application/json,.json' }));
    $('dReset').addEventListener('click', reset);
  }

  NS.views = NS.views || {};
  NS.views.data = { mount, render, reset, restoreFrom };
})(typeof window !== 'undefined' ? window : globalThis);
