/* SlopCentral dialog: "Everything in one file". Export everything (with or without open-app state), or choose a backup
 * file, read what it holds (imported, left alone, skipped, excluded) and confirm. Uses SlopCentral.exportEverything,
 * plan and apply only. Opened through SlopBackup.openEverything(). Classic script; part of central.js. */
(function () {
  'use strict';
  const C = window.SlopCentral, B = window.SlopBackup;
  const fmt = (n) => (window.SlopI18n && window.SlopI18n.num ? window.SlopI18n.num(Number(n || 0)) : Number(n || 0).toLocaleString());
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup.js
  const when = (d) => (window.SlopI18n && window.SlopI18n.date ? window.SlopI18n.date(d, { dateStyle: 'medium', timeStyle: 'short' }) : new Date(d).toLocaleString());

  const css = document.createElement('style');
  css.textContent = '.ev-sec{border:1px solid var(--s-line);border-radius:var(--s-radius);padding:12px;margin-bottom:10px;display:grid;gap:8px}'
    + '.ev-sec h3{margin:0;font-size:13px}.ev-sec .sui-p{margin:0}.ev-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}'
    + '.ev-status{color:var(--s-faint);font-size:11.5px}.ev-list{display:grid;gap:5px;padding:8px;border-radius:var(--s-radius);background:var(--s-input)}'
    + '.ev-list div{display:grid;grid-template-columns:minmax(120px,1fr) 2fr;gap:8px;font-size:12.5px}.ev-list b{color:var(--s-fg)}'
    + '.ev-warn{color:var(--s-fg);font-size:12px}.ev-bad{color:var(--s-danger, #c0392b);font-size:12.5px;display:grid;gap:3px}'
    + '.ev-ex{font-size:11.5px;color:var(--s-dim)}.ev-ex li{margin:2px 0}';
  document.head.append(css);

  /** What one app line says: how many items come in, or why it is not imported. */
  function rowText(r) {
    if (r.action === 'import') {
      const parts = Object.entries(r.counts.parts || {}).filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${k}`).join(', ');   // store names: data, as they are
      const n = r.counts.records;
      const items = parts ? tr('ui.backup.row_items_parts', { n, parts }) : tr('ui.backup.row_items', { n });
      const up = r.from !== r.version ? tr('ui.backup.row_upgraded', { v: String(r.from) }) : '';
      return [items + up + '.', tr(r.mode === 'replace' ? 'ui.backup.row_replaces' : 'ui.backup.row_adds')].join(' ');
    }
    if (r.action === 'left-alone') return tr('ui.backup.row_left');
    return tr('ui.backup.row_unknown');
  }

  /** The plan as a list: one row per app, then what is excluded. */
  function planEl(el, p) {
    const made = when(p.created);
    const list = el('div', { class: 'ev-list' },
      el('div', null, el('b', null, tr('ui.backup.made_label')), el('span', null, `${made} · ${p.source}`)),
      ...p.rows.map((r) => el('div', { 'data-app': r.id, 'data-action': r.action }, el('b', null, r.label), el('span', null, rowText(r)))));
    const replaces = p.rows.some((r) => r.action === 'import' && r.mode === 'replace');
    return el('div', { style: 'display:grid;gap:8px;width:100%' }, list,
      replaces ? el('p', { class: 'ev-warn' }, tr('ui.backup.data_replaced')) : null,
      el('details', null, el('summary', null, tr('ui.backup.not_included', { n: p.excluded.length })),
        el('ul', { class: 'ev-ex' }, ...p.excluded.map((x) => el('li', null, el('b', null, x.source + '.'), ' ', x.reason)))));
  }

  async function open(opts = {}) {
    const UI = await B.kit(), el = UI.el;
    let current = null;
    const status = el('div', { class: 'ev-status', role: 'status' }, tr('ui.backup.ev_status', { ext: B.JSON_EXT }));
    const session = el('input', { type: 'checkbox', checked: true });
    const exportBtn = el('button', { type: 'button', class: 'sui-btn sui-primary', 'data-act': 'export-all' }, tr('ui.backup.export_all'));
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      try {
        const r = await C.exportEverything({ includeSession: session.checked, onProgress: (t) => { status.textContent = t; } });
        UI.download(r.blob, r.name);
        const got = r.rows.map((x) => `${x.label} (${fmt(x.counts.records)})`).join(', ');
        status.textContent = tr('ui.backup.ev_saved', { name: r.name, got: got || tr('ui.backup.nothing'), n: r.excluded.length });
        UI.toast(tr('ui.backup.downloaded'));
      } catch (e) { status.textContent = tr('ui.backup.export_failed', { err: e && e.message ? e.message : String(e) }); }
      finally { exportBtn.disabled = false; }
    });
    const exp = el('section', { class: 'ev-sec' }, el('h3', null, tr('menu.export')),
      el('p', { class: 'sui-p' }, tr('ui.backup.ev_export_body')),
      el('label', { class: 'ev-row' }, session, el('span', null, tr('ui.backup.ev_session'))),
      el('div', { class: 'ev-row' }, exportBtn), status);

    const planArea = el('div', { class: 'ev-row', style: 'width:100%' });
    const pickBtn = el('button', { type: 'button', class: 'sui-btn', 'data-act': 'import-all' }, tr('ui.backup.choose'));
    const confirmBtn = el('button', { type: 'button', class: 'sui-btn sui-primary', 'data-act': 'confirm-import' }, tr('ui.backup.confirm_import'));
    const imp = el('section', { class: 'ev-sec' }, el('h3', null, tr('ui.import')),
      el('p', { class: 'sui-p' }, tr('ui.backup.ev_import_body', { ext: B.JSON_EXT })),
      el('div', { class: 'ev-row' }, pickBtn), planArea);

    async function choose(file) {
      planArea.replaceChildren(el('span', { class: 'ev-status' }, tr('ui.backup.checking')));
      const p = await C.plan(file);
      current = p;
      if (!p.ok) {
        planArea.replaceChildren(el('div', { class: 'ev-bad', role: 'alert' }, el('b', null, tr('ui.backup.not_imported')), ...p.errors.map((m) => el('span', null, m))));
        return;
      }
      confirmBtn.disabled = false;
      planArea.replaceChildren(el('div', { style: 'display:grid;gap:8px;width:100%' }, el('b', null, file.name), planEl(el, p),
        el('div', { class: 'ev-row' }, confirmBtn, pickBtn)));
    }
    confirmBtn.disabled = true;
    const ACCEPT = `.json,${B.EXT},.zip,application/json,application/zip`;
    pickBtn.addEventListener('click', async () => {
      const SI = window.SlopIntake; // the backup file is a part of the one intake ('backup.everything') where the page has it
      if (SI && SI.part) { await SI.pick({ to: SI.part({ id: 'backup.everything', limit: 1, accept: { any: true, noun: tr('ui.backup.noun') }, process: async (f) => { await choose(f); return f.name; } }), multiple: false, accept: ACCEPT }); return; }
      const [f] = await UI.pickFiles({ accept: ACCEPT }); // intake-ok: a page without shared/intake
      if (f) await choose(f);
    });
    confirmBtn.addEventListener('click', async () => {
      if (!current || !current.ok) return;
      confirmBtn.disabled = true;
      status.textContent = tr('ui.backup.importing');
      const r = await C.apply(current, { onProgress: (t) => { status.textContent = t; } });
      if (!r.ok) { status.textContent = r.errors.join(' '); confirmBtn.disabled = false; return; }
      const done = r.applied.map((a) => `${a.label} (${fmt(a.counts.records)})`).join(', ');
      const left = r.skipped.map((s) => tr(s.action === 'unknown' ? 'ui.backup.app_skipped' : 'ui.backup.app_left', { app: s.label || s.id })).join(', ');
      status.textContent = tr('ui.backup.ev_imported', { list: done || tr('ui.backup.nothing') }) + (left ? ' ' + tr('ui.backup.ev_not_imported', { list: left }) : '');
      UI.toast(tr('ui.backup.imported_toast'));
      current = null;
      if (opts.onRestored) opts.onRestored(r);
    });

    return new Promise((resolve) => {
      UI.dialog({ title: tr('ui.backup.ev_title'), cls: 'ev-dlg',
        body: el('div', null, el('p', { class: 'sui-p' }, tr('ui.backup.ev_intro')), exp, imp),
        buttons: [{ label: tr('ui.done'), primary: true }], onClose: () => resolve() });
    });
  }

  C.ui = { open };
})();
