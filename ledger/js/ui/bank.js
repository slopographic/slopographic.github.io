// The Bank tab: reconcile a bank (or cash) account with its statement. Import the bank's CSV, OFX or QFX, QIF, camt.053 or
// MT940 file (the last four through the shared readers in shared/finance): each line is kept once
// (bankLines; a second import of the same statement adds nothing) and matched to the journal entry that moved the account
// by the same amount within 5 days (core/bank.js). What is left is for the person: money in that equals an open invoice's
// balance can be recorded as its payment; money out that equals a bill owed can pay it, or be recorded as an expense;
// anything else can be set aside. The
// statement's totals and the difference still to explain are at the top.
(function (g) {
  'use strict';
  const S = g.SlopData, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const STATUS = () => ({ open: t('ledger.bk.open'), matched: t('ledger.bk.matched'), ignored: t('ledger.bk.ignored') });
  let cache = null;   // { lines, moves, invoices, settings } of the last render

  const account = () => $('bkAccount').value;
  const list = async (name, o) => { const r = await S.store.list(name, o); return r.ok ? r.value : []; };

  /** Reads the statement file and stores its new lines, then matches. Says how many were new. */
  async function importFile(file) {
    const s = await NS.util.settings();
    const parsed = await readLines(file, s);
    if (!parsed) return;
    if (!parsed.columns) { UI.alert(t('ledger.bk.not_stmt'), t('ledger.bk.not_stmt_body')); return; }
    const have = new Set((await list('bankLines')).map((l) => l.key)), acct = account();
    let added = 0;
    for (const l of parsed.lines) {
      const key = `${acct}|${l.key}`;
      if (have.has(key)) continue;
      const w = await S.store.put('bankLines', { key, account: acct, date: l.date, description: l.description, amount: l.amount, currency: s.base, status: 'open', source: file.name, importedAt: Date.now() });
      if (w.ok) added++;
    }
    const matched = await autoMatch();
    UI.toast(t('ledger.bk.new_lines', { n: added, file: file.name }) + (matched ? t('ledger.bk.and_matched', { n: matched }) : '') + (parsed.skipped ? t(typeof parsed.columns === 'string' ? 'ledger.bk.skipped_booked' : 'ledger.bk.skipped', { n: parsed.skipped }) : ''));
    await render();
  }

  /** The statement's lines: OFX, QFX, QIF, camt.053 and MT940 through the shared readers (shared/finance, ES modules loaded
   *  on first use), anything else as CSV with the site's one CSV parser (convert/js/core/csv.js). null when refused. */
  async function readLines(file, s) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fin = await import(new URL('../shared/finance/index.js', document.baseURI).href);
    const format = fin.formatOf(file.name, bytes.subarray(0, 4096));
    if (format === 'sie') { UI.alert(t('ledger.bk.sie'), t('ledger.bk.sie_body')); return null; }
    if (format) {
      let model;
      try { model = fin.readStatement(bytes, file.name); } catch (e) { UI.alert(t('ledger.bk.not_read'), (e && e.message) || String(e)); return null; }
      if (model.currency && model.currency !== s.base) { UI.alert(t('ledger.bk.other_cur'), t('ledger.bk.other_cur_body', { cur: model.currency, base: s.base })); return null; }
      return { ...NS.bank.linesFromStatement(model, { digits: S.money.digits(s.base) }), columns: format };
    }
    const { parseCsv } = await import(new URL('../convert/js/core/csv.js', document.baseURI).href);
    const { decodeBytes } = await import(new URL('../shared/finance/text.js', document.baseURI).href);
    return NS.bank.linesOf(parseCsv(decodeBytes(bytes, { legacy: 'windows-1252' }).text), { dayFirst: !/^en-US$/i.test(s.locale) });
  }

  /** Matches every open line of the account it can; returns how many it matched. */
  async function autoMatch() {
    const acct = account(), lines = (await list('bankLines')).filter((l) => l.account === acct);
    const pairs = NS.bank.match(lines, NS.bank.moves(await list('journal'), acct));
    for (const p of pairs) await S.store.put('bankLines', { ...p.line, status: 'matched', journalId: p.move.journalId });
    return pairs.length;
  }

  async function setStatus(line, status) {
    const r = await S.store.put('bankLines', { ...line, status, journalId: status === 'matched' ? line.journalId : undefined });
    if (!r.ok) UI.alert(t('ledger.bk.not_changed'), NS.util.refusal(r));
    await render();
  }

  /** Money in: the open invoices whose balance is exactly this line's amount. */
  function invoicesFor(line) {
    if (line.amount <= 0) return [];
    return cache.invoices.filter((x) => x.due === line.amount);
  }
  /** Money out: the bills owed whose amount is exactly this line's. */
  function billsFor(line) {
    if (line.amount >= 0) return [];
    return cache.bills.filter((b) => b.amount === -line.amount);
  }
  async function payBill(line, bill) {
    const r = await S.expenses.pay(bill.id, { date: line.date, method: line.account === '1000' ? 'cash' : 'bank' });
    if (!r.ok) { UI.alert(t('ledger.bk.bill_not_paid'), NS.util.refusal(r)); return; }
    await autoMatch();
    UI.toast(t('ledger.bk.bill_paid', { supplier: bill.supplier }));
    await render();
  }
  async function recordPayment(line, inv) {
    const r = await S.billing.recordPayment({ invoiceId: inv.id, amount: line.amount, date: line.date, method: line.account === '1000' ? 'cash' : 'bank', note: line.description.slice(0, 300) || undefined });
    if (!r.ok) { UI.alert(t('ledger.bk.pay_not'), NS.util.refusal(r)); return; }
    await autoMatch();
    UI.toast(t('ledger.bk.pay_done', { number: inv.number }));
    await render();
  }
  /** Money out as an expense: the supplier (the statement's text to start with) and the category; no tax to reclaim. */
  async function recordExpense(line) {
    const accts = (await list('accounts')).filter((a) => a.type === 'expense').sort((a, b) => a.code.localeCompare(b.code));
    const supplier = UI.field(t('ledger.bk.supplier'), el('input', { value: line.description.slice(0, 200), maxlength: 200 }));
    const cat = UI.select(accts.map((a) => [a.code, `${a.code} ${a.name}`]), accts[0] ? accts[0].code : '5000');
    UI.dialog({
      title: t('ledger.bk.exp_title'), body: el('div', null, el('p', { class: 'note' }, t(line.account === '1000' ? 'ledger.bk.exp_line_cash' : 'ledger.bk.exp_line_bank', { date: line.date, amount: NS.util.money(-line.amount, cache.settings.base, cache.settings.locale) })), supplier, UI.field(t('ledger.bk.category'), cat)),
      buttons: [{ label: t('ledger.bk.cancel') }, { label: t('ledger.bk.record'), primary: true, act: async () => {
        const r = await S.expenses.record({ date: line.date, supplier: supplier.querySelector('input').value.trim() || 'Bank', description: line.description.slice(0, 300) || undefined,   // i18n-ignore: CSS class names and the stored supplier fallback
          account: cat.value, amount: -line.amount, tax: 0, currency: cache.settings.base, method: line.account === '1000' ? 'cash' : 'bank' });
        if (!r.ok) { UI.alert(t('ledger.bk.exp_not'), NS.util.refusal(r)); return false; }
        await autoMatch(); await render();
        return undefined;
      } }],
    });
  }

  function row(line) {
    const s = cache.settings, m = (v) => NS.util.money(v, s.base, s.locale);
    const acts = [];
    if (line.status === 'open') {
      for (const inv of invoicesFor(line).slice(0, 2)) acts.push(el('button', { type: 'button', class: 'btn small primary', onclick: () => recordPayment(line, inv) }, t('ledger.bk.pay_for', { number: inv.number })));   // i18n-ignore: CSS class names and the stored supplier fallback
      for (const bill of billsFor(line).slice(0, 2)) acts.push(el('button', { type: 'button', class: 'btn small primary', onclick: () => payBill(line, bill) }, t('ledger.bk.pay_bill', { supplier: bill.supplier })));   // i18n-ignore: CSS class names and the stored supplier fallback
      if (line.amount < 0) acts.push(el('button', { type: 'button', class: 'btn small', onclick: () => recordExpense(line) }, t('ledger.bk.as_expense')));   // i18n-ignore: CSS class names and the stored supplier fallback
      acts.push(el('button', { type: 'button', class: 'btn small', onclick: () => setStatus(line, 'ignored') }, t('ledger.bk.set_aside')));   // i18n-ignore: CSS class names and the stored supplier fallback
      } else if (line.status === 'matched') acts.push(el('button', { type: 'button', class: 'btn small', onclick: () => setStatus(line, 'open') }, t('ledger.bk.unmatch')));   // i18n-ignore: CSS class names and the stored supplier fallback
      else acts.push(el('button', { type: 'button', class: 'btn small', onclick: () => setStatus(line, 'open') }, t('ledger.bk.bring_back')));   // i18n-ignore: CSS class names and the stored supplier fallback
    const move = line.journalId && cache.moves.find((x) => x.journalId === line.journalId);
    return el('tr', { class: `bk-${line.status}` }, el('td', null, line.date), el('td', null, line.description || '—', move ? el('div', { class: 'note' }, t('ledger.bk.matched_to', { what: move.memo || t('ledger.bk.journal_entry'), date: move.date })) : null),
    el('td', { class: 'num' }, m(line.amount)), el('td', null, el('span', { class: `chip ${line.status === 'matched' ? 'paid' : line.status === 'ignored' ? 'void' : 'issued'}` }, STATUS()[line.status])),
      el('td', null, el('div', { class: 'toolbar' }, acts)));
  }

  async function render() {
    const acct = account(), s = await NS.util.settings();
    const [lines, journal, invoices, payments, bills] = await Promise.all([list('bankLines'), list('journal'), list('invoices', { index: 'status', value: 'issued' }), list('payments'),
      list('expenses', { index: 'status', value: 'owed' })]);
    const mine = lines.filter((l) => l.account === acct).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const due = invoices.filter((x) => !x.deletedAt).map((x) => ({ id: x.id, number: x.number, due: S.billing.balanceDue(x, payments.filter((p) => p.invoiceId === x.id)) }));
    cache = { lines: mine, moves: NS.bank.moves(journal, acct), invoices: due, bills: bills.filter((b) => (b.amountBase !== undefined ? b.amountBase : b.amount) === b.amount), settings: s };
    const count = (st) => mine.filter((l) => l.status === st).length, m = (v) => NS.util.money(v, s.base, s.locale);
    const open = mine.filter((l) => l.status === 'open');
    $('bkStats').replaceChildren(...[[String(mine.length), t('ledger.bk.lines')], [String(count('matched')), t('ledger.bk.matched')], [String(open.length), t('ledger.bk.open')],
      [String(count('ignored')), t('ledger.bk.ignored')], [m(open.reduce((x, l) => x + l.amount, 0)), t('ledger.bk.to_explain')]].map(([v, k]) => el('div', { class: 'stat' }, el('b', null, v), el('span', null, k))));
    const shown = $('bkShowAll').checked ? mine : open;
    $('bkRows').replaceChildren(...shown.map(row));
    $('bkEmpty').hidden = shown.length > 0;
    $('bkEmpty').textContent = t(mine.length ? 'ledger.bk.all_done' : 'ledger.bk.none');
  }

  function mount() {
    // Import a statement…: a part of the one intake of its own ('ledger.bank', shared/intake)
    g.SlopIntake.register({ id: 'ledger.bank', main: false, paste: false, toast: false, limit: 1, accept: { any: true, noun: 'ledger.bk.noun' }, process: async (f) => { await importFile(f); return f.name; } });
    NS.bankPick = () => g.SlopIntake.pick({ to: 'ledger.bank', multiple: false, accept: '.csv,.txt,text/csv,.ofx,.qfx,.qif,.xml,.sta,.mt940,.940' });
    $('bkImport').addEventListener('click', NS.bankPick);
    $('bkAccount').addEventListener('change', render);
    $('bkShowAll').addEventListener('change', render);
    $('bkMatch').addEventListener('click', async () => { const n = await autoMatch(); UI.toast(n ? t('ledger.bk.matched_n', { n }) : t('ledger.bk.nothing_new')); await render(); });
  }

  NS.views = NS.views || {};
  NS.views.bank = { mount, render };
  NS.bankView = { importFile, autoMatch, render };
})(typeof window !== 'undefined' ? window : globalThis);
