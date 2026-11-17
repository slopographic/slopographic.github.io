// Slop Expenses editor: a new expense (or a copy of one) is a form; Record posts it (SlopData.expenses.record), paid or as a
// bill to pay by a due date. A recorded expense is read only, as the books are: a bill owed can be marked as paid, and any
// can be voided (its entries reversed) or copied into a new one.
(function (g) {
  'use strict';
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI, el = g.SlopUI.el;
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // field names for refusals and the payment methods, in the chosen language (getters, read when shown)
  const FIELDS = { get supplier() { return t('expenses.f.supplier'); }, get date() { return t('expenses.f.date'); }, get amount() { return t('expenses.f.amount'); },
    get tax() { return t('expenses.f.tax'); }, get account() { return t('expenses.f.category'); }, get currency() { return t('expenses.f.currency'); } };
  const METHOD = () => ({ bank: t('expenses.m.bank'), card: t('expenses.m.card'), cash: t('expenses.m.cash'), other: t('expenses.m.other') });
  let taxTouched = false, cur = null;

  const today = () => S.ledger.today();
  // amounts and the tax rate are typed in the page's language ("24,00" in sv): SlopData.money.parseTyped and typedMinor
  const decimal = (minor, currency) => S.money.typedMinor(minor, currency);
  const typed = (text, currency) => S.money.parseTyped(text, currency);
  const say = (text, bad) => { $('eMsg').textContent = text || ''; $('eMsg').className = 'msg' + (bad ? ' bad' : text ? ' ok' : ''); };

  async function fillAccounts(selected) {
    const accts = await B.expenseAccounts();
    $('eAccount').replaceChildren(...accts.map((a) => el('option', { value: a.code, selected: a.code === selected }, `${a.code} ${a.name}`)),
      el('option', { value: '+' }, t('expenses.ed.new_cat')));
  }
  async function suppliers() {
    const r = await S.store.list('expenses');
    const names = [...new Set((r.ok ? r.value : []).map((e) => e.supplier))].sort();
    $('eSuppliers').replaceChildren(...names.map((n) => el('option', { value: n })));
  }
  /** Adds an expense account (the next free 5xxx code) named by the person, and selects it. */
  async function newCategory() {
    const name = await UI.prompt(t('expenses.ed.new_cat_q'), t('expenses.ed.new_cat_name'), '', { ok: t('expenses.ed.add'), placeholder: t('expenses.ed.travel') });
    if (!name || !name.trim()) { await fillAccounts(cur && cur.account); return; }
    const r = await S.store.list('accounts');
    const used = new Set((r.ok ? r.value : []).map((a) => a.code));
    let code = 5010; while (used.has(String(code)) && code < 5999) code += 10;
    const w = await S.store.put('accounts', { code: String(code), name: name.trim(), type: 'expense' });
    if (!w.ok) { UI.alert(t('expenses.ed.cat_not'), B.refusal(w)); await fillAccounts(); return; }
    await fillAccounts(String(code));
  }
  /** The tax from the amount and rate, until the person types a tax of their own. */
  function autoTax() {
    if (taxTouched) return;
    const amount = typed($('eAmount').value, $('eCurrency').value || 'USD');
    const rate = S.money.parsePercent($('eRate').value.trim() || '0', { typed: true });
    $('eTax').value = amount == null || rate == null ? '' : decimal(NS.core.taxIn(amount, rate), $('eCurrency').value || 'USD');
  }

  function setForm(on) { $('eForm').hidden = !on; $('eView').hidden = on; $('eRecord').hidden = !on; $('eVoid').hidden = true; $('ePay').hidden = true; $('eCopy').hidden = on; }
  /** "Not paid yet" asks for the due date (the payment terms from the bill's date to start with). */
  async function dueRow() {
    const later = $('eMethod').value === 'later';
    $('eDueRow').hidden = !later;
    if (later && !$('eDue').value) $('eDue').value = S.ledger.addDays($('eDate').value || today(), (await B.settings()).paymentTermsDays);
  }

  /** A new expense: today, the settings' currency and tax rate, or the details of the expense being copied. */
  async function showNew(copyOf) {
    const s = await B.settings();
    let src = null;
    if (copyOf) { const r = await S.store.get('expenses', copyOf); src = r.ok ? r.value : null; }
    cur = null; taxTouched = !!src; setForm(true); say('');
    if (NS.receiptScan) NS.receiptScan.clear();
    $('eTitle').textContent = src ? t('expenses.ed.copy_of', { name: src.supplier }) : t('expenses.ed.new');
    $('eDate').value = today();
    $('eSupplier').value = src ? src.supplier : '';
    $('eDescription').value = src ? src.description || '' : '';
    $('eCurrency').value = src ? src.currency || s.currency : s.currency;
    $('eAmount').value = src ? decimal(src.amount, $('eCurrency').value) : '';
    $('eRate').value = S.money.typedPlain(String((s.defaultTaxRate || 0) / 100));
    $('eTax').value = src ? decimal(src.tax || 0, $('eCurrency').value) : '';
    $('eMethod').value = src ? src.method : 'bank';
    $('eDue').value = ''; await dueRow();
    $('eNotes').value = src ? src.notes || '' : '';
    await Promise.all([fillAccounts(src ? src.account : undefined), suppliers()]);
    $('eSupplier').focus();
  }

  /** A recorded expense, read only. */
  async function showOne(id) {
    const [r, s, accts] = await Promise.all([S.store.get('expenses', id), B.settings(), B.expenseAccounts()]);
    if (!r.ok || !r.value) { setForm(false); $('eView').replaceChildren(el('p', { class: 'note' }, t('expenses.ed.gone'))); return; }
    cur = r.value; setForm(false); say('');
    const e = cur, c = e.currency || s.currency, m = (v) => B.money(v, c, s.locale), acct = accts.find((a) => a.code === e.account);
    $('eTitle').textContent = `${e.supplier} · ${e.date}`;
    const row = (k, v) => [el('dt', null, k), el('dd', null, v)];
    $('eView').replaceChildren(el('dl', { class: 'facts' }, ...row(t('expenses.f.supplier'), e.supplier), ...row(t('expenses.ed.description'), e.description || '—'),
      ...row(t('expenses.f.category'), acct ? `${acct.code} ${acct.name}` : e.account), ...row(t('expenses.f.amount'), m(e.amount)), ...row(t('expenses.f.tax'), m(e.tax || 0)),
      ...row(t('expenses.ed.without_tax'), m(e.amount - (e.tax || 0))), ...row(t('expenses.ed.paid_by'), METHOD()[e.method] || e.method),
      ...row(t('expenses.ed.status'), e.status === 'void' ? t('expenses.ed.void') : e.status === 'owed' ? (e.dueDate ? t('expenses.ed.owed_due', { date: e.dueDate }) : t('expenses.ed.owed')) : (e.paidDate && e.paidDate !== e.date ? t('expenses.ed.recorded_paid', { date: e.paidDate }) : t('expenses.ed.recorded'))),
      ...row(t('expenses.ed.notes'), e.notes || '—'),
      ...(e.receiptId ? row(t('expenses.ed.receipt'), el('button', { type: 'button', class: 'btn small', onclick: () => viewReceipt(e.receiptId) }, t('expenses.ed.view_receipt'))) : [])));   // i18n-ignore: CSS class names
    $('eVoid').hidden = e.status !== 'posted' && e.status !== 'owed';
    $('ePay').hidden = e.status !== 'owed';
  }

  /** The receipt photo kept in Slop Drive, in a new tab. */
  async function viewReceipt(id) {
    const f = g.SlopHub ? await g.SlopHub.get(id).catch(() => null) : null;
    if (!f || !f.blob) { UI.alert(t('expenses.ed.no_receipt'), t('expenses.ed.no_receipt_body')); return; }
    g.open(URL.createObjectURL(f.blob), '_blank', 'noopener');
  }

  async function record() {
    const currency = ($('eCurrency').value || '').trim().toUpperCase();
    const amount = typed($('eAmount').value, currency), tax = $('eTax').value.trim() ? typed($('eTax').value, currency) : 0;
    if (amount == null || amount < 1) { say(t('expenses.ed.bad_amount'), true); $('eAmount').focus(); return; }
    if (tax == null) { say(t('expenses.ed.bad_tax'), true); $('eTax').focus(); return; }
    const later = $('eMethod').value === 'later';
    const r = await S.expenses.record({ date: $('eDate').value, supplier: $('eSupplier').value.trim(), description: $('eDescription').value.trim() || undefined,
      account: $('eAccount').value, amount, tax, currency, method: later ? 'bank' : $('eMethod').value, notes: $('eNotes').value.trim() || undefined,
      payLater: later || undefined, dueDate: later ? $('eDue').value || undefined : undefined,
      receiptId: (NS.receiptScan && NS.receiptScan.current()) || undefined });
    if (!r.ok) { say(B.refusal(r, { fields: FIELDS }), true); return; }
    if (NS.receiptScan) NS.receiptScan.clear();
    UI.toast(t('expenses.ed.recorded_toast', { name: r.value.supplier }));
    NS.app.go(`e/${r.value.id}`);
  }

  /** The examples in the page language's decimal mark ("24,00" in sv). */
  const examples = () => { $('eAmount').placeholder = S.money.typedPlain('24.00'); $('eTax').placeholder = S.money.typedPlain('0.00'); };

  function mount() {
    examples();
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(examples);
    $('eRecord').addEventListener('click', record);
    $('eForm').addEventListener('submit', (ev) => { ev.preventDefault(); record(); });
    $('eVoid').addEventListener('click', async () => { if (cur) { await NS.listView.voidOne(cur); showOne(cur.id); } });
    $('ePay').addEventListener('click', () => cur && NS.payDialog.open(cur, () => showOne(cur.id)));
    $('eMethod').addEventListener('change', dueRow);
    $('eCopy').addEventListener('click', () => cur && NS.app.go(`new/${cur.id}`));
    $('eBack').addEventListener('click', () => NS.app.go('list'));
    $('eAccount').addEventListener('change', () => { if ($('eAccount').value === '+') newCategory(); });
    for (const id of ['eAmount', 'eRate', 'eCurrency']) $(id).addEventListener('input', autoTax);
    $('eTax').addEventListener('input', () => { taxTouched = $('eTax').value.trim() !== ''; });
    if (NS.receiptScan) NS.receiptScan.mount(say);   // From a receipt… (ui/receipt.js)
  }

  NS.editor = { record, current: () => cur };
  NS.views = NS.views || {};
  NS.views.edit = { mount, show: (id, opts) => (id ? showOne(id) : showNew(opts && opts.copyOf)) };
})(typeof window !== 'undefined' ? window : globalThis);
