// The Journal tab: a manual entry form (two or more lines, debits equal credits), the posted entries with their
// base amounts next to the original ones, reversing entries, and the journal CSV export.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);
  const money = (m, c, l) => NS.util.money(m, c, l);
  let accountsCache = [];
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** One line of the form: account, debit, credit, remove. */
  function lineRow() {
    const sel = el('select', { class: 'l-acct', 'aria-label': t('ledger.j.account'), 'data-i18n-attr': 'aria-label:ledger.j.account' }, [el('option', { value: '', 'data-i18n': 'ledger.j.choose' }, t('ledger.j.choose')),
      ...accountsCache.map((a) => el('option', { value: a.code }, `${a.code} ${a.name}`))]);
    const dr = el('input', { class: 'l-dr', type: 'text', inputmode: 'decimal', placeholder: t('ledger.j.debit'), 'aria-label': t('ledger.j.debit'), 'data-i18n-attr': 'placeholder:ledger.j.debit;aria-label:ledger.j.debit', oninput: updateTotals });
    const cr = el('input', { class: 'l-cr', type: 'text', inputmode: 'decimal', placeholder: t('ledger.j.credit'), 'aria-label': t('ledger.j.credit'), 'data-i18n-attr': 'placeholder:ledger.j.credit;aria-label:ledger.j.credit', oninput: updateTotals });
    return el('div', { class: 'line-row' }, sel, dr, cr,
      el('button', { type: 'button', class: 'btn small', 'aria-label': t('ledger.j.remove'), 'data-i18n-attr': 'aria-label:ledger.j.remove', onclick: (e) => { e.currentTarget.parentNode.remove(); updateTotals(); } }, '✕'));   // i18n-ignore: CSS class names and the stored supplier fallback
  }

  /** The typed rows as text, read from the form. */
  const formRows = () => [...$('jLines').querySelectorAll('.line-row')].map((r) => ({
    account: r.querySelector('.l-acct').value, debit: r.querySelector('.l-dr').value, credit: r.querySelector('.l-cr').value }));

  /** Live totals while typing: the same parse the posting uses, so the figures agree with what gets posted. */
  function updateTotals() {
    const cur = ($('jCur').value || 'USD').trim().toUpperCase();
    let dr = 0, cr = 0, bad = false;
    for (const r of formRows()) {
      const d = S.money.parseTyped(r.debit.trim() || '0', cur), c = S.money.parseTyped(r.credit.trim() || '0', cur);   // typed in the page's language
      if (d === null || c === null) { bad = true; continue; }
      dr += d; cr += c;
    }
    const f = (m) => money(m, cur, $('jLocale').value);
    $('jTotals').textContent = bad ? t('ledger.j.check')
      : t('ledger.j.totals', { dr: f(dr), cr: f(cr), state: t(dr === cr && dr > 0 ? 'ledger.j.balanced' : 'ledger.j.not_balanced') });
  }

  /** Fills the form's account choices, keeping each line's current choice. */
  function fillAccounts() {
    for (const sel of $('jLines').querySelectorAll('.l-acct')) {
      const keep = sel.value;
      sel.replaceChildren(el('option', { value: '' }, t('ledger.j.choose')), ...accountsCache.map((a) => el('option', { value: a.code }, `${a.code} ${a.name}`)));
      sel.value = keep;
    }
  }

  async function post() {
    const msg = $('jMsg');
    msg.textContent = '';
    const built = NS.journal.buildEntry({ date: $('jDate').value, memo: $('jMemo').value, currency: $('jCur').value, rows: formRows() },
      accountsCache.map((a) => a.code));
    if (!built.ok) { msg.textContent = t('ledger.j.not_posted', { why: built.message }); return false; }
    const r = await NS.journal.post(built.value);
    if (!r.ok) { msg.textContent = t('ledger.j.not_posted', { why: NS.util.refusal(r) }); return false; }
    UI.toast(t('ledger.j.posted'));
    $('jMemo').value = '';
    $('jLines').replaceChildren(lineRow(), lineRow());
    updateTotals();
    return true;
  }

  function reverseEntry(e) {
    UI.confirm(t('ledger.j.reverse_q'), t('ledger.j.reverse_body', { what: e.memo || e.source }), t('ledger.j.reverse_ok'), { danger: true })
      .then(async (yes) => {
        if (!yes) return;
        const r = await NS.journal.reverse(e.id);
        UI.toast(r.ok ? t('ledger.j.reversed_toast') : NS.util.refusal(r));
      });
  }

  /** The amount cell: the original and the base amount side by side when they differ. */
  function amountCell(base, orig, origCur, baseCur, loc) {
    if (orig === undefined || orig === null || !origCur || origCur === baseCur) return money(base, baseCur, loc);
    return el('span', { class: 'pair' }, el('span', { class: 'orig' }, money(orig, origCur, loc)), el('span', { class: 'arrow' }, ' = '), money(base, baseCur, loc));
  }

  function entryCard(e, names, reversed, base, loc) {
    const fx = !!e.rateId;
    const tags = [e.reverses ? t('ledger.j.reversal') : null, e.source.startsWith('manual:') || e.reverses ? null : t('ledger.j.from_module'), reversed.has(e.id) ? t('ledger.j.reversed') : null].filter(Boolean);
    const rows = e.lines.map((l) => el('tr', null,
      el('td', null, `${l.account} ${names.get(l.account) || ''}`),
      el('td', { class: 'num' }, l.debit ? amountCell(l.debit, fx ? l.origDebit : undefined, e.currency, base, loc) : ''),
      el('td', { class: 'num' }, l.credit ? amountCell(l.credit, fx ? l.origCredit : undefined, e.currency, base, loc) : '')));
    return el('article', { class: 'entry', 'data-id': e.id, 'data-reversed': reversed.has(e.id) ? '1' : '0', 'aria-label': t('ledger.j.entry', { date: e.date, memo: e.memo || '' }) },
      el('header', { class: 'e-head' }, el('b', null, S.locale.formatDate(e.date, loc)), el('span', { class: 'memo' }, e.memo || t('ledger.j.no_memo')),
        tags.map((x) => el('span', { class: 'tag' }, x))),
      el('table', { class: 'lines' }, el('thead', null, el('tr', null, el('th', null, t('ledger.j.account')), el('th', { class: 'num' }, t('ledger.j.debit_base', { cur: base })), el('th', { class: 'num' }, t('ledger.j.credit_base', { cur: base })))),
        el('tbody', null, rows)),
      fx ? el('p', { class: 'note' }, t('ledger.j.fx', { cur: e.currency, rate: (e.rate / 1e6).toFixed(6), date: e.date, amount: money(e.amount, e.currency, loc), base: money(e.amountBase, base, loc) })) : null,
      !reversed.has(e.id) ? el('div', { class: 'e-actions' }, el('button', { type: 'button', class: 'btn small', onclick: () => reverseEntry(e) }, t('ledger.j.reverse'))) : null);   // i18n-ignore: CSS class names and the stored supplier fallback
  }

  async function render() {
    const s = await NS.util.settings();
    $('jLocale').value = s.locale;
    $('jCur').value = $('jCur').value || s.base;
    const acc = await NS.util.accounts();
    if (acc.ok) accountsCache = acc.value;
    fillAccounts();
    if (!$('jLines').children.length) $('jLines').replaceChildren(lineRow(), lineRow());
    updateTotals();
    const list = await NS.journal.list();
    if (!list.ok) { $('jRows').replaceChildren(el('p', { class: 'msg', role: 'alert' }, NS.util.refusal(list))); return; }
    const names = new Map(accountsCache.map((a) => [a.code, a.name]));
    const reversed = NS.journal.reversedIds(list.value);
    $('jRows').replaceChildren(...list.value.map((e) => entryCard(e, names, reversed, s.base, s.locale)));
    $('jEmpty').hidden = list.value.length > 0;
    $('jCount').textContent = t('ledger.j.count', { n: list.value.length });
  }

  function mount() {
    $('jDate').value = NS.util.today();
    $('jCur').setAttribute('list', 'jCurList');
    $('jCurList').replaceChildren(...S.locale.currencies().map((c) => el('option', { value: c })));
    $('jAddLine').addEventListener('click', () => { $('jLines').append(lineRow()); fillAccounts(); updateTotals(); });
    $('jPost').addEventListener('click', post);
    $('jCur').addEventListener('input', updateTotals);
    $('jExport').addEventListener('click', async () => {
      const list = await NS.journal.list();
      const s = await NS.util.settings();
      if (!list.ok) { UI.toast(NS.util.refusal(list)); return; }
      const f = NS.csv.journalCsv(list.value, accountsCache, s.base, NS.util.today());
      UI.download(f.blob, f.name);
    });
    g.SlopCtx.bind($('jRows'), (target) => {
      const card = target && target.closest && target.closest('.entry');
      if (!card) return null;
      if (card.dataset.reversed === '1') return [{ label: t('ledger.j.already'), disabled: true }];
      return [{ label: t('ledger.j.reverse'), act: () => reverseEntry({ id: card.dataset.id, memo: card.querySelector('.memo').textContent }) }];
    });
  }

  NS.views = NS.views || {};
  NS.views.journal = { mount, render, updateTotals };
})(typeof window !== 'undefined' ? window : globalThis);
