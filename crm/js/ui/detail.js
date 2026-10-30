// The customer detail panel: photo and name, contact details (every phone, email and address with its label), tags and
// groups, pipeline stage and follow-up, categories, dated notes, and the orders and invoices of this customer (read from
// the shared collections). Re-drawn whenever the store changes.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)
  const $ = (id) => document.getElementById(id);
  const money = (minor, cur, loc) => NS.util.money(minor, cur, loc);
  const sect = (title, ...kids) => el('section', { class: 'd-sec' }, el('h3', { class: 'h3' }, title), ...kids);
  const kv = (k, v) => el('div', { class: 'kv' }, el('dt', null, k), el('dd', null, v));
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const webHref = (w) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

  function header(c) {
    return el('div', { class: 'd-head' }, NS.parts.avatar(c, 'av av-lg'),
      el('div', { class: 'd-title' }, el('h2', { class: 'h2' }, c.name), el('span', { class: `stage s-${c.stage}` }, NS.stageLabel(c.stage))),
      el('button', { type: 'button', class: 'd-close', 'aria-label': tr('crm.dt.close'), title: tr('crm.dt.close_tip'), onclick: () => NS.app.close() }, '×'));
  }

  /** Every phone, email and address with its label, then the company facts and the website. */
  function contact(c) {
    const F = NS.fields;
    const lines = (kind, link) => F.rowsOf(c, kind).filter((r) => r.value).map((r) => kv(cap(NS.labelWord(r.label)),
      link ? el('a', { href: `${link}:${r.value}` }, r.value) : r.value));
    const phones = lines('phone', 'tel'), emails = lines('email', 'mailto'), addresses = lines('address', null);
    const facts = [[tr('crm.dt.company'), c.company], [tr('crm.dt.dept'), c.department], [tr('crm.dt.job'), c.title]].filter(([, v]) => v).map(([k, v]) => kv(k, v));
    const web = c.website ? [kv(tr('crm.dt.website'), el('a', { href: webHref(c.website), rel: 'noopener' }, c.website))] : [];
    const any = phones.length || emails.length || addresses.length || facts.length || web.length;
    return sect(tr('crm.dt.contact'),
      el('dl', { class: 'kvs' }, phones, emails, addresses, facts, web,
        c.contactId ? kv(tr('crm.dt.source'), tr('crm.dt.imported')) : null),
        any ? null : el('p', { class: 'note' }, tr('crm.dt.no_details')));
  }

  /** Tags and groups: each change is saved at once. */
  function tagsAndGroups(c) {
    const save = (field) => async (ids) => {
      const r = await NS.customers.save(c.id, { [field]: ids });
      if (!r.ok) UI.toast(NS.util.refusal(r));
    };
    return sect(tr('crm.dt.tags_groups'),
    el('p', { class: 'note' }, tr('crm.dt.tg_note')),
    el('h4', { class: 'sub-t' }, tr('crm.dt.tags')), NS.parts.labelPicker('tag', c.tagIds, save('tagIds')),
    el('h4', { class: 'sub-t' }, tr('crm.dt.groups')), NS.parts.labelPicker('group', c.groupIds, save('groupIds')));
  }

  function pipeline(c) {
    const stage = el('select', { id: 'dStage', 'aria-label': tr('crm.dt.stage_aria'), onchange: (e) => NS.menu.moveTo(c.id, e.target.value) },
      NS.STAGES.map((s) => el('option', { value: s, selected: s === c.stage }, NS.stageLabel(s))));
    const follow = el('input', { type: 'date', id: 'dFollow', value: c.followUp || '', 'aria-label': tr('crm.dt.follow_aria'),
      onchange: async (e) => {
        const v = e.target.value;
        if (v && !NS.util.isDate(v)) { UI.toast(tr('crm.dt.bad_date')); return; }
        const r = await NS.customers.setFollowUp(c.id, v);
        if (!r.ok) UI.toast(NS.util.refusal(r));
      } });
    return sect(tr('crm.dt.pipeline'),
    el('label', { class: 'field' }, el('span', null, tr('crm.dt.stage')), stage),
    el('label', { class: 'field' }, el('span', null, tr('crm.dt.follow_aria')), follow),
    c.followUp ? el('button', { type: 'button', class: 'btn small', onclick: () => NS.customers.setFollowUp(c.id, null) }, tr('crm.dt.clear_follow')) : null);   // i18n-ignore: class names
  }

  function categories(c) {
    const input = el('input', { type: 'text', id: 'dCats', value: (c.categories || []).join(', '), maxlength: 400, 'aria-label': tr('crm.dt.cats_aria') });
    return sect(tr('crm.dt.cats'),
    el('p', { class: 'note' }, tr('crm.dt.cats_note')),
      el('div', { class: 'inline' }, input, el('button', { type: 'button', class: 'btn', onclick: async () => {
        const r = await NS.customers.save(c.id, { categories: NS.util.tags(input.value) });
        UI.toast(r.ok ? tr('crm.dt.cats_saved') : NS.util.refusal(r));
        } }, tr('crm.dt.save'))));
  }

  function notes(c, loc) {
    const date = el('input', { type: 'date', id: 'dNoteDate', value: NS.util.today(), 'aria-label': tr('crm.dt.note_date') });
    const text = el('textarea', { id: 'dNoteText', rows: 3, maxlength: 2000, 'aria-label': tr('crm.dt.note_text'), placeholder: tr('crm.dt.note_ph') });
    const add = async () => {
      if (!NS.util.isDate(date.value)) { UI.toast(tr('crm.dt.note_need_date')); return; }
      const r = await NS.customers.addNote(c.id, text.value, date.value);
      UI.toast(r.ok ? tr('crm.dt.note_added') : NS.util.refusal(r));
    };
    const list = NS.notes.newestFirst(NS.notes.parse(c.notes));
    return sect(tr('crm.dt.notes'),
    el('div', { class: 'note-form' }, date, text, el('button', { type: 'button', class: 'btn primary', onclick: add }, tr('crm.dt.add_note'))),   // i18n-ignore: class names
    list.length ? el('ul', { class: 'notes', 'aria-label': tr('crm.dt.notes') }, list.map((n) => el('li', null,
      el('span', { class: 'note-date' }, n.date ? NS.util.date(n.date, loc) : tr('crm.dt.earlier')), el('span', { class: 'note-text' }, n.text)))) :
      el('p', { class: 'empty' }, tr('crm.dt.no_notes')));
  }

  function docList(rows, cur, loc, title, empty) {
    if (!rows.length) return el('p', { class: 'empty' }, empty);
    return el('ul', { class: 'docs', 'aria-label': title }, rows.map((d) => el('li', null,
      el('b', null, d.number || tr('crm.dt.draft')), el('span', { class: 'row-sub' }, `${NS.util.date(d.date, loc)} · ${g.SlopBiz.statusText ? g.SlopBiz.statusText(d.status) : d.status}`),
      el('span', { class: 'amt' }, money(d.total || 0, d.currency || cur.currency, loc)))));
  }

  /** Schedules a call or meeting with this customer: an event in Slop Calendar that links to the customer. */
  function schedule(c) {
    const day = el('input', { type: 'date', id: 'dSchedDay', value: NS.util.today(), 'aria-label': tr('crm.dt.day') });
    const time = el('input', { type: 'time', id: 'dSchedTime', value: '10:00', 'aria-label': tr('crm.dt.start') });
    const kind = el('select', { id: 'dSchedKind', 'aria-label': tr('crm.dt.kind') }, el('option', { value: 'call' }, tr('crm.dt.call')), el('option', { value: 'meeting' }, tr('crm.dt.meeting')));
    const go = async () => {
      if (!NS.util.isDate(day.value) || !/^\d{2}:\d{2}$/.test(time.value)) { UI.toast(tr('crm.dt.need_time')); return; }
      const T = g.SlopTime, tz = T.deviceZone(), start = T.dayTimeToUtc(day.value, time.value, tz);
      const word = kind.value === 'meeting' ? 'Meeting' : 'Call';   // i18n-ignore: the event's own title, saved in the user's calendar
      const r = await g.SlopData.store.put('events', { title: `${word} ${c.name}`, allDay: false, start, end: start + 30 * 60000, tz,
        kind: kind.value, customerId: c.id, color: 'teal', freq: 'none' });
      UI.toast(r.ok ? tr(kind.value === 'meeting' ? 'crm.dt.scheduled_meeting' : 'crm.dt.scheduled_call') : NS.util.refusal(r));
    };
    return sect(tr('crm.dt.schedule'),
    el('p', { class: 'note' }, tr('crm.dt.sched_note')),
    el('div', { class: 'inline' }, day, time, kind, el('button', { type: 'button', class: 'btn', onclick: go }, tr('crm.dt.schedule'))));
  }

  // The record's main buttons (Edit details, Delete customer) at the foot of the detail panel, the suite rule
  // (shared/frame/HANDOFF.md; the shared footer, shared/frame/panel.js): in reach however long the record is.
  let fp = null;
  function foot(list) {
    if (!fp && g.SlopFramePanel) fp = g.SlopFramePanel.create($('view-customer'), { bare: true });
    if (fp) fp.footer(list);
  }

  async function render() {
    const body = $('dBody');
    const id = NS.state.current;
    foot([]);
    if (!id) { body.replaceChildren(el('p', { class: 'empty' }, tr('crm.dt.pick'))); return; }
    const r = await NS.customers.get(id);
    if (!r.ok) { body.replaceChildren(el('p', { class: 'msg', role: 'alert' }, NS.util.refusal(r))); return; }
    if (!r.value) { body.replaceChildren(el('p', { class: 'empty' }, tr('crm.dt.gone'))); return; }
    const c = r.value, cur = NS.state.settings;
    const h = await NS.history.of(id);
    if (!h.ok) { body.replaceChildren(el('p', { class: 'msg', role: 'alert' }, NS.util.refusal(h))); return; }
    body.replaceChildren(header(c), contact(c), tagsAndGroups(c), pipeline(c), categories(c), notes(c, cur.locale), schedule(c),
      sect(tr('crm.dt.orders'), docList(h.value.orders, cur, cur.locale, tr('crm.dt.orders'), tr('crm.dt.no_orders'))),
      sect(tr('crm.dt.invoices'), docList(h.value.invoices, cur, cur.locale, tr('crm.dt.invoices'), tr('crm.dt.no_invoices'))));
      foot([{ el: el('button', { type: 'button', class: 'btn primary', onclick: () => NS.form.open(c.id) }, tr('crm.dt.edit')) },   // i18n-ignore: class names
      { el: el('button', { type: 'button', class: 'btn danger', onclick: () => NS.menu.removeCustomer(c) }, tr('crm.dt.delete')) }]);   // i18n-ignore: class names
  }

  NS.views = NS.views || {};
  NS.views.customer = { render };
})(typeof window !== 'undefined' ? window : globalThis);
