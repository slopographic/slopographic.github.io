// Slop Timesheets editor: one time entry. A new one starts today, with the rate and project last used for the customer
// (or what the timer measured). Billed time is read only apart from its description, with a link to its invoice; time on a
// void or deleted invoice can be changed again (saving releases it).
(function (g) {
  'use strict';
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI;
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // field names for refusals, in the chosen language (getters, read when shown)
  const FIELDS = { get date() { return t('timesheets.f.date'); }, get customerId() { return t('timesheets.f.customer'); }, get description() { return t('timesheets.f.description'); },
    get minutes() { return t('timesheets.f.time'); }, get rate() { return t('timesheets.f.rate'); }, get currency() { return t('timesheets.f.currency'); } };
  const LOCKED = ['eDate', 'eCustomer', 'eDuration', 'eRate', 'eCurrency', 'eBillable'];
  let cur = null;

  const say = (text, bad) => { $('eMsg').textContent = text || ''; $('eMsg').className = 'msg' + (bad ? ' bad' : text ? ' ok' : ''); };

  async function fillCustomers(selected) {
    const r = await NS.entries.customers();
    $('eCustomer').replaceChildren(B.h('option', { value: '', text: t('timesheets.ed.no_customer') }),
      ...(r.ok ? r.value : []).map((c) => B.h('option', { value: c.id, text: c.name })));
    $('eCustomer').value = selected || '';
    $('eProjects').replaceChildren(...(await NS.entries.projects()).map((p) => B.h('option', { value: p })));
  }

  /** Puts the rate, currency and project last used for the chosen customer into a new entry. */
  async function useLast() {
    if (cur) return;
    const s = await B.settings(), last = await NS.entries.lastUsed($('eCustomer').value);
    $('eCurrency').value = (last && last.currency) || s.currency;
    $('eRate').value = S.money.typedMinor(last ? last.rate : 0, $('eCurrency').value);
    $('eProject').value = last ? last.project : '';
    $('eBillable').checked = !!$('eCustomer').value;
  }

  function lock(billed) {
    for (const id of LOCKED) $(id).disabled = billed;
    $('eDelete').hidden = !cur || billed;
    $('eCopy').hidden = !cur;
    $('eBilled').hidden = !billed;
  }

  /** A new entry (a copy of copyOf when given, dated today), or the stored one for id. */
  async function show(id, o = {}) {
    say('');
    cur = null;
    let src = null;
    if (id || o.copyOf) {
      const r = await NS.entries.rows();
      src = r.ok ? r.value.find((x) => x.id === (id || o.copyOf)) : null;
      if (!src) { say(t('timesheets.ed.gone'), true); return; }
      if (id) cur = src;
    }
    const pre = !src && NS.state.prefill ? NS.state.prefill : null;
    NS.state.prefill = null;
    await fillCustomers(src ? src.customerId : pre ? pre.customerId : $('tCustomer').value);
    $('eTitle').textContent = cur ? t('timesheets.ed.title', { date: cur.date, time: NS.core.hm(cur.minutes) }) : t('timesheets.ed.log');
    $('eDate').value = cur ? cur.date : S.ledger.today();
    $('eProject').value = src ? src.project || '' : '';
    $('eDescription').value = src ? src.description : pre ? pre.description : '';
    $('eDuration').value = src ? NS.core.hm(src.minutes) : pre ? NS.core.hm(pre.minutes) : '';
    if (src) {
      $('eCurrency').value = src.currency;
      $('eRate').value = S.money.typedMinor(src.rate || 0, src.currency);
      $('eBillable').checked = !!src.billable;
    } else await useLast();
    const billed = !!cur && cur.state === 'billed';
    lock(billed);
    if (billed) { const [a, b] = t('timesheets.ed.billed').split('{number}'); $('eBilled').replaceChildren(a, B.h('a', { href: `../invoices/#i/${cur.invoiceId}`, text: cur.invoiceNumber }), b || ''); }
    $('eDescription').focus();
  }

  /** The form as a record, or the first problem in plain words. */
  function collect() {
    const minutes = NS.core.parseDuration($('eDuration').value);
    if (minutes === null) return { error: t('timesheets.ed.bad_time') };
    const currency = $('eCurrency').value.trim().toUpperCase() || 'USD';
    const rate = S.money.parseTyped($('eRate').value || '0', currency);   // typed in the page's language
    if (rate === null || rate < 0) return { error: t('timesheets.ed.bad_rate') };
    if (!$('eDescription').value.trim()) return { error: t('timesheets.ed.no_desc') };
    return { form: { id: cur && cur.id, date: $('eDate').value, customerId: $('eCustomer').value, project: $('eProject').value.trim(),
      description: $('eDescription').value.trim(), minutes, rate, currency, billable: $('eBillable').checked } };
  }

  async function save() {
    const c = collect();
    if (c.error) { say(c.error, true); return false; }
    const r = await NS.entries.save(c.form);
    if (!r.ok) { say(B.refusal(r, { fields: FIELDS }), true); return false; }
    UI.toast(cur ? t('timesheets.ed.saved') : t('timesheets.ed.logged', { time: NS.core.hm(r.value.minutes) }));
    NS.app.go('list');
    return true;
  }

  async function remove() {
    if (!cur || !(await UI.confirm(t('timesheets.ed.del_q'), t('timesheets.ed.del_body', { time: NS.core.hm(cur.minutes), date: cur.date }), t('timesheets.ed.del_ok'), { danger: true }))) return;
    const r = await NS.entries.remove(cur.id);
    if (!r.ok) { say(B.refusal(r), true); return; }
    UI.toast(t('timesheets.ed.deleted'));
    NS.app.go('list');
  }

  /** The rate's example in the page language's decimal mark ("80,00" in sv). */
  const example = () => { $('eRate').placeholder = S.money.typedPlain('80.00'); };

  function mount() {
    example();
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(example);
    $('eForm').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    $('eSave').addEventListener('click', save);
    $('eBack').addEventListener('click', () => NS.app.go('list'));
    $('eDelete').addEventListener('click', remove);
    $('eCopy').addEventListener('click', () => cur && NS.app.go(`new/${cur.id}`));
    $('eCustomer').addEventListener('change', () => { if (!cur) $('eBillable').checked = !!$('eCustomer').value; useLast(); });
    $('eDuration').addEventListener('blur', () => { const m = NS.core.parseDuration($('eDuration').value); if (m !== null) $('eDuration').value = NS.core.hm(m); });
  }

  NS.views = NS.views || {};
  NS.views.edit = { mount, show };
  NS.editor = { save, remove, collect, current: () => cur };
})(typeof window !== 'undefined' ? window : globalThis);
