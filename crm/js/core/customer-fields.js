// Customer fields: how the form maps to the stored record, and the checks the form shows next to each field.
// The first phone, email and address stay in phone, email and address (with phoneLabel, emailLabel, addressLabel), and
// the rest are in phones, emails and addresses as { label, value }. Pure: no storage, no DOM.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const LABELS = { phone: ['mobile', 'work', 'home', 'fax', 'other'], email: ['work', 'personal', 'other'], address: ['work', 'home', 'other'] };
  const DEFAULT_LABEL = { phone: 'mobile', email: 'work', address: 'work' };
  const PLURAL = { phone: 'phones', email: 'emails', address: 'addresses' };
  const LIMIT = { name: 200, text: 200, website: 300, notes: 5000, phone: 60, email: 200, address: 1000 };
  const MAX_ROWS = 10;
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RX = /^\+?[\d\s().-]+$/;
  const WEB_RX = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
  const trim = (s) => String(s == null ? '' : s).trim();
  const digits = (s) => (String(s).match(/\d/g) || []).length;

  /** True for a real calendar date written YYYY-MM-DD. */
  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  /** A saved customer's phones, emails or addresses as form rows, first first: [{ label, value }]. */
  function rowsOf(c, kind) {
    const main = c[kind] ? [{ label: c[`${kind}Label`] || DEFAULT_LABEL[kind], value: c[kind] }] : [];
    return [...main, ...(c[PLURAL[kind]] || []).map((e) => ({ label: e.label || DEFAULT_LABEL[kind], value: e.value }))];
  }

  /** Form rows to the stored fields. Blank rows are dropped; the first row goes to the main field and its label. */
  function fieldsOf(rows, kind) {
    const kept = (rows || []).map((r) => ({ label: trim(r.label) || DEFAULT_LABEL[kind], value: trim(r.value) })).filter((r) => r.value);
    const [first, ...rest] = kept;
    return { [kind]: first ? first.value : '', [`${kind}Label`]: first ? first.label : '', [PLURAL[kind]]: rest };
  }

  /** The form values for a customer record (or a new one: pass {}). */
  function toForm(c) {
    return {
      name: c.name || '', company: c.company || '', department: c.department || '', title: c.title || '', website: c.website || '',
      phones: rowsOf(c, 'phone'), emails: rowsOf(c, 'email'), addresses: rowsOf(c, 'address'), photo: c.photo || '',
      categories: (c.categories || []).slice(), tagIds: (c.tagIds || []).slice(), groupIds: (c.groupIds || []).slice(),
      notes: c.notes || '', stage: c.stage || 'lead', followUp: c.followUp || '',
    };
  }

  /** The changes for customers.save from the form values. */
  function toChanges(v) {
    return {
      name: trim(v.name), company: trim(v.company), department: trim(v.department), title: trim(v.title), website: trim(v.website),
      ...fieldsOf(v.phones, 'phone'), ...fieldsOf(v.emails, 'email'), ...fieldsOf(v.addresses, 'address'),
      photo: v.photo || '', categories: v.categories || [], tagIds: v.tagIds || [], groupIds: v.groupIds || [],
      notes: String(v.notes || '').replace(/\r\n?/g, '\n').replace(/\s+$/, ''), stage: v.stage, followUp: trim(v.followUp) || null,
    };
  }

  /** Messages for rows of one kind, keyed 'phone:0', 'email:1' ... */
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  function rowErrors(rows, kind, e) {
    (rows || []).forEach((r, i) => {
      const x = trim(r.value);
      if (!x) return;
      const key = `${kind}:${i}`;
      if (x.length > LIMIT[kind]) e[key] = tr('crm.core.keep_n', { n: String(LIMIT[kind]) });
      else if (kind === 'email' && !EMAIL_RX.test(x)) e[key] = tr('crm.core.bad_email');
      else if (kind === 'phone' && (!PHONE_RX.test(x) || digits(x) < 6 || digits(x) > 20)) e[key] = tr('crm.core.bad_phone');
    });
  }

  /**
   * The fields that are wrong, keyed by field name ('name', 'website', 'followUp', 'phone:0' ...). An empty object
   * means the form can be saved. The store checks again on save, so a server refusal is still shown.
   */
  function validate(v) {
    const e = {};
    const name = trim(v.name);
    if (!name) e.name = tr('crm.core.need_name');
    else if (name.length > LIMIT.name) e.name = tr('crm.core.name_n', { n: String(LIMIT.name) });
    rowErrors(v.phones, 'phone', e);
    rowErrors(v.emails, 'email', e);
    rowErrors(v.addresses, 'address', e);
    const web = trim(v.website);
    if (web && (web.length > LIMIT.website || !WEB_RX.test(web))) e.website = tr('crm.core.bad_web');
    for (const k of ['company', 'department', 'title']) if (trim(v[k]).length > LIMIT.text) e[k] = tr('crm.core.keep_n', { n: String(LIMIT.text) });
    if (trim(v.followUp) && !isDate(trim(v.followUp))) e.followUp = tr('crm.core.bad_date');
    if (String(v.notes || '').length > LIMIT.notes) e.notes = tr('crm.core.notes_n', { n: String(LIMIT.notes) });
    return e;
  }

  NS.fields = { LABELS, DEFAULT_LABEL, PLURAL, LIMIT, MAX_ROWS, isDate, rowsOf, fieldsOf, toForm, toChanges, validate };
})(typeof window !== 'undefined' ? window : globalThis);
