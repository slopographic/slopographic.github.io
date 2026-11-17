// Bulk actions on the Customers list. The selection is a Set of customer ids on SlopCrm (NS.selection); the bar shows
// while it is not empty. Each action calls the NS.customers functions once per selected customer and reports the result.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const $ = (id) => document.getElementById(id);
  const plural = (n) => tr('crm.bk.n_customers', { n });
  NS.selection = new Set();
  let shown = []; // the customers the list shows now (after the search and filters)

  /** Paints the bar, its count, the select-all box and the row boxes from the selection. */
  function refresh() {
    const n = NS.selection.size;
    $('cBulk').hidden = n === 0;
    $('bCount').textContent = tr('crm.bk.n_selected', { n: String(n) });
    const picked = shown.filter((c) => NS.selection.has(c.id)).length;
    const all = $('cSelAll');
    all.checked = shown.length > 0 && picked === shown.length;
    all.indeterminate = picked > 0 && picked < shown.length;
    all.disabled = shown.length === 0;
    for (const cb of document.querySelectorAll('#cRows .row-check')) cb.checked = NS.selection.has(cb.dataset.id);
  }

  /** Called by the list after each render: drops selected ids that no longer exist, then repaints. */
  function update(all, visible) {
    shown = visible;
    const live = new Set(all.map((c) => c.id));
    for (const id of [...NS.selection]) if (!live.has(id)) NS.selection.delete(id);
    refresh();
  }

  /** One row's box changed. */
  function toggle(id, on) {
    if (on) NS.selection.add(id); else NS.selection.delete(id);
    refresh();
  }

  /** The select-all box: every shown customer in or out of the selection. */
  function setShown(on) {
    for (const c of shown) { if (on) NS.selection.add(c.id); else NS.selection.delete(c.id); }
    refresh();
  }

  /** Runs one NS.customers call per selected customer. Returns how many worked and the first refusal. */
  async function each(fn, drop = false) {
    const ids = [...NS.selection];
    let done = 0, why = '';
    for (const id of ids) {
      const r = await fn(id);
      if (r && r.ok) { done++; if (drop) NS.selection.delete(id); }
      else if (!why) why = NS.util.refusal(r);
    }
    return { done, total: ids.length, why };
  }

  function report(msg, res) {
    UI.toast(res.why ? tr('crm.bk.partly', { msg, done: String(res.done), total: String(res.total), why: res.why }) : tr('crm.bk.done', { msg, what: plural(res.done) }));
  }

  /** Changes one customer from its current record. A customer that is gone is a refusal, not a crash. */
  async function patch(id, change) {
    const r = await NS.customers.get(id);
    if (!r.ok) return r;
    if (!r.value) return { ok: false, message: tr('crm.fm.gone') };
    return NS.customers.save(id, change(r.value));
  }

  async function setStage(stage) {
    report(tr('crm.bk.moved', { stage: NS.stageLabel(stage) }), await each((id) => NS.customers.moveStage(id, stage)));
  }

  async function addCategory() {
    const add = NS.util.tags(await UI.prompt(tr('crm.bk.add_cat'), tr('crm.bk.cat_name'), '', { ok: tr('crm.bk.add'), placeholder: tr('crm.bk.cat_ph') }));
    if (!add.length) return;
    report(tr('crm.bk.added', { names: add.join(', ') }), await each((id) => patch(id, (c) => ({ categories: NS.util.tags([...(c.categories || []), ...add].join(', ')) }))));
  }

  async function removeCategory() {
    const drop = NS.util.tags(await UI.prompt(tr('crm.bk.remove_cat'), tr('crm.bk.cat_remove'), '', { ok: tr('crm.bk.remove') }));
    if (!drop.length) return;
    report(tr('crm.bk.removed', { names: drop.join(', ') }), await each((id) => patch(id, (c) => ({ categories: (c.categories || []).filter((x) => !drop.includes(x)) }))));
  }

  async function setFollowUp(date) {
    if (!NS.util.isDate(date)) { UI.toast(tr('crm.bk.real_date')); return; }
    report(tr('crm.bk.follow_set', { date }), await each((id) => NS.customers.setFollowUp(id, date)));
  }

  /** Adds the selected customers to one group, or removes them, after the group is picked in a dialog. */
  async function groupDialog(on) {
    const r = await NS.labels.load();
    if (!r.ok) { UI.toast(NS.util.refusal(r)); return; }
    const groups = r.value.groups;
    if (!groups.length) {
      UI.dialog({ title: tr('crm.bk.groups'), body: tr('crm.bk.no_groups'), buttons: [{ label: tr('menu.ok'), primary: true }] });
      return;
    }
    const sel = UI.select(groups.map((x) => [x.id, x.name]), groups[0].id);
    UI.dialog({ title: tr(on ? 'crm.bk.add_group' : 'crm.bk.remove_group'),
      body: el('div', null, UI.field(tr('crm.bk.group'), sel), el('p', { class: 'note' }, tr('crm.bk.selected', { what: plural(NS.selection.size) }))),
      buttons: [{ label: tr('menu.cancel') }, { label: tr(on ? 'crm.bk.add' : 'crm.bk.remove'), primary: true, act: async () => {
        const name = groups.find((x) => x.id === sel.value).name;
        const res = await NS.labels.setMembers([...NS.selection], 'group', sel.value, on);
        UI.toast(res.ok ? tr(on ? 'crm.bk.added_to' : 'crm.bk.removed_from', { name }) : NS.util.refusal(res));
        return res.ok;
      } }] });
  }

  /** The selected customers, read fresh from the store, as one CSV file (UTF-8 with a BOM so Excel reads accents). */
  async function exportCsv() {
    const r = await NS.customers.load();
    const lab = await NS.labels.load();
    if (!r.ok || !lab.ok) { UI.toast(NS.util.refusal(r.ok ? lab : r)); return; }
    const names = (ids, list) => (ids || []).map((id) => (list.find((x) => x.id === id) || {}).name).filter(Boolean);
    const rows = r.value.filter((c) => NS.selection.has(c.id));
    const cell = (v) => {
      const s = Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Name', 'Stage', 'Email', 'Phone', 'Address', 'Follow-up', 'Categories', 'Tags', 'Groups', 'Notes'];   // i18n-ignore: CSV column names (a file format)
    const lines = [head, ...rows.map((c) => [c.name, NS.stageLabel(c.stage), c.email, c.phone, c.address, c.followUp, c.categories,
      names(c.tagIds, lab.value.tags), names(c.groupIds, lab.value.groups), c.notes])];
    const text = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
    UI.download(new Blob([text], { type: 'text/csv;charset=utf-8' }), `slop-crm-customers-${NS.util.today()}.csv`);
    UI.toast(tr('crm.bk.exported', { what: plural(rows.length) }));
  }

  async function removeSelected() {
    const n = NS.selection.size;
    if (!n) return;
    const yes = await UI.confirm(tr('crm.bk.del_q', { what: plural(n) }), tr('crm.bk.del_body'), tr('ui.delete'), { danger: true });
    if (!yes) return;
    const openGone = !!NS.state.current && NS.selection.has(NS.state.current);
    const res = await each((id) => NS.customers.remove(id), true);
    report(tr('crm.bk.deleted'), res);
    if (openGone) NS.app.close();
  }

  /** Builds the bar, once, and wires the select-all box. Called when the Customers view mounts. */
  function mount() {
    const stage = el('select', { 'aria-label': tr('crm.bk.stage_aria'),
      onchange: (e) => { const s = e.target.value; e.target.value = ''; if (s) setStage(s); } },
      el('option', { value: '' }, tr('crm.bk.stage')), NS.STAGES.map((s) => el('option', { value: s }, NS.stageLabel(s))));
      const date = el('input', { type: 'date', 'aria-label': tr('crm.bk.date_aria') });
    const btn = (label, act, cls) => el('button', { type: 'button', class: cls ? `btn small ${cls}` : 'btn small', onclick: () => act() }, label);   // i18n-ignore: class names
    $('cBulk').replaceChildren(
      el('span', { class: 'bulk-count', id: 'bCount', role: 'status' }),
      stage,
      btn(tr('crm.bk.add_cat'), addCategory),
      btn(tr('crm.bk.remove_cat'), removeCategory),
      btn(tr('crm.bk.add_to_group'), () => groupDialog(true)),
      btn(tr('crm.bk.remove_from_group'), () => groupDialog(false)),
      el('span', { class: 'bulk-date' }, date, btn(tr('crm.bk.apply'), () => setFollowUp(date.value))),
      btn(tr('crm.bk.csv'), exportCsv),
      btn(tr('ui.delete'), removeSelected, 'danger'),
      btn(tr('crm.bk.clear'), () => { NS.selection.clear(); refresh(); }));
    $('cSelAll').addEventListener('change', (e) => setShown(e.target.checked));
  }

  NS.bulk = { mount, update, toggle };
})(typeof window !== 'undefined' ? window : globalThis);
