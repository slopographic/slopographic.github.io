/* SlopBackupUI: the "Backup & restore" dialog (export everything, import with merge or replace).
 * Opened through SlopBackup.openDialog(). Classic script, exposes window.SlopBackupUI. */
(function () {
  'use strict';
  if (window.SlopBackupUI) return;
  const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup.js
  const when = (d) => (window.SlopI18n && window.SlopI18n.date ? window.SlopI18n.date(d, { dateStyle: 'medium', timeStyle: 'short' }) : new Date(d).toLocaleString());
  const css = document.createElement('style');
  css.textContent = '.bk-sec{border:1px solid var(--s-line);border-radius:var(--s-radius);padding:12px;margin-bottom:10px;display:grid;gap:8px}.bk-sec h3{margin:0;font-size:13px}'
    + '.bk-sec .sui-p{margin:0}.bk-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bk-status{color:var(--s-faint);font-size:11.5px}.bk-sum{display:grid;gap:4px;padding:8px;border-radius:var(--s-radius);background:var(--s-input)}'
    + '.bk-modes{display:grid;gap:6px}.bk-modes label{display:flex;gap:7px;align-items:flex-start;color:var(--s-dim)}.bk-modes b{color:var(--s-fg)}.bk-modes input{accent-color:var(--s-accent);margin-top:2px}';
  document.head.append(css);

  function summary(el, m) {
    const c = m.counts || {};
    return el('div', { class: 'bk-sum' },
      el('div', null, m.origin && m.origin !== location.origin ? tr('ui.backup.made_on', { when: when(m.created), origin: m.origin }) : tr('ui.backup.made', { when: when(m.created) })),
      el('div', null, tr('ui.backup.sum_drive', { files: c.driveFiles || 0, folders: c.driveFolders || 0, size: fmtSize(m.bytes || 0) })),
      el('div', null, tr('ui.backup.sum_local', { saves: c.localStorage || 0, dbs: c.databases || 0 })));
  }

  function open(UI, { onRestored } = {}) {
    return new Promise((resolve) => {
      const el = UI.el, B = window.SlopBackup, last = B.lastExport();
      const status = el('div', { class: 'bk-status', role: 'status' }, last ? tr('ui.backup.last', { when: when(last) }) : tr('ui.backup.none_yet'));
      const exportBtn = el('button', { type: 'button', class: 'sui-btn sui-primary', 'data-act': 'export' }, tr('ui.backup.export_all'));
      exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        try { const r = await B.exportNow({ onProgress: (t) => { status.textContent = t; } }); status.textContent = tr('ui.backup.saved', { name: r.name, size: fmtSize(r.size) }); UI.toast(tr('ui.backup.downloaded')); }
        catch (e) { status.textContent = tr('ui.backup.export_failed', { err: e.message }); }
        finally { exportBtn.disabled = false; }
      });
      const exp = el('section', { class: 'bk-sec' }, el('h3', null, tr('menu.export')),
        el('p', { class: 'sui-p' }, tr('ui.backup.export_body')),
        el('div', { class: 'bk-row' }, exportBtn), status);

      const impBody = el('div', { class: 'bk-row' });
      const pickBtn = el('button', { type: 'button', class: 'sui-btn', 'data-act': 'import' }, tr('ui.backup.choose'));
      impBody.append(pickBtn);
      const imp = el('section', { class: 'bk-sec' }, el('h3', null, tr('ui.import')), el('p', { class: 'sui-p' }, tr('ui.backup.import_body', { ext: B.EXT })), impBody);
      pickBtn.addEventListener('click', async () => {
        const SI = window.SlopIntake; // the backup file is a part of the one intake ('backup.import') where the page has it
        if (SI && SI.part) { await SI.pick({ to: SI.part({ id: 'backup.import', limit: 1, accept: { any: true, noun: tr('ui.backup.noun_ext', { ext: B.EXT }) }, process: async (f) => { await choose(f); return f.name; } }), multiple: false, accept: `${B.EXT},.zip,application/zip` }); return; }
        const [f] = await UI.pickFiles({ accept: `${B.EXT},.zip,application/zip` }); // intake-ok: a page without shared/intake
        if (f) await choose(f);
      });
      async function choose(file) {
        let data;
        try { data = await window.SlopBackupCore.read(file); } catch (e) { UI.alert(tr('ui.backup.cannot_import'), e.message); return; }
        const merge = el('input', { type: 'radio', name: 'bk-mode', value: 'merge', checked: true }), repl = el('input', { type: 'radio', name: 'bk-mode', value: 'replace' });
        const modes = el('div', { class: 'bk-modes' },
          el('label', null, merge, el('span', null, el('b', null, tr('ui.backup.merge')), ' ', tr('ui.backup.merge_body'))),
          el('label', null, repl, el('span', null, el('b', null, tr('ui.backup.replace')), ' ', tr('ui.backup.replace_body'))));
        const go = el('button', { type: 'button', class: 'sui-btn sui-primary', 'data-act': 'restore' }, tr('ui.backup.restore'));
        const st = el('div', { class: 'bk-status', role: 'status' });
        impBody.replaceChildren(el('div', { style: 'display:grid;gap:8px;width:100%' }, el('b', null, file.name), summary(el, data.manifest), modes, el('div', { class: 'bk-row' }, go, pickBtn), st));
        go.addEventListener('click', async () => {
          const mode = repl.checked ? 'replace' : 'merge';
          if (mode === 'replace' && !(await UI.confirm(tr('ui.backup.replace_q'), tr('ui.backup.replace_warn'), tr('ui.backup.replace_ok'), { danger: true }))) return;
          go.disabled = true;
          try {
            const r = await B.importFile(data, { mode, onProgress: (t) => { st.textContent = t; } });
            st.textContent = [tr('ui.backup.restored', { records: r.records, dbs: r.databases, saves: r.localStorage }), r.errors.length ? tr('ui.backup.problems', { n: r.errors.length, list: r.errors.join('; ') }) : '', r.skipped.length ? tr('ui.backup.skipped', { list: r.skipped.join(', ') }) : ''].filter(Boolean).join(' ');
            UI.toast(tr('ui.backup.restored_toast'));
            if (onRestored) onRestored(r);
          } catch (e) { st.textContent = tr('ui.backup.import_failed', { err: e.message }); }
          finally { go.disabled = false; }
        });
      }
      const everything = el('section', { class: 'bk-sec' }, el('h3', null, tr('ui.backup.one_file')),
        el('p', { class: 'sui-p' }, tr('ui.backup.one_file_body', { ext: B.JSON_EXT })),
        el('div', { class: 'bk-row' }, el('button', { type: 'button', class: 'sui-btn', 'data-act': 'everything' }, tr('ui.backup.everything_btn'))));
      everything.querySelector('button').addEventListener('click', () => B.openEverything({ onRestored }));
      const d = UI.dialog({ title: tr('ui.backup.title'), cls: 'bk-dlg', body: el('div', null,
        el('p', { class: 'sui-p' }, tr('ui.backup.intro')), exp, everything, imp),
        buttons: [{ label: tr('ui.done'), primary: true }], onClose: () => resolve() });
      d.box.dataset.backup = '1';
      open.choose = choose; // for tests and drag-and-drop of backup files (SlopBackup.EXT)
    });
  }
  window.SlopBackupUI = { open };
})();
