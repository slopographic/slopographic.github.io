// Slop Expenses: Mileage… records a mileage claim as an expense: the date, the route (there and back or one way), the
// distance in kilometres or miles at a rate per unit, and why. The amount is worked out as it is typed (core/mileage.js);
// the rate and the unit are remembered for next time (localStorage, through try/catch). Paid by: other (claimed back).
(function (g) {
  'use strict';
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  const KEY = 'slop-expenses.mileage';
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  const remember = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* not kept: the defaults come back */ } };

  /** The category to start with: one named for travel or mileage, else the first expense account. */
  async function categories() {
    const accts = await B.expenseAccounts();
    const pick = accts.find((a) => /mileage|travel|car|vehicle|resor|bil/i.test(a.name)) || accts[0];
    return { accts, pick: pick ? pick.code : '5000' };
  }

  async function open() {
    const s = await B.settings(), last = saved(), { accts, pick } = await categories();
    const unit = UI.select([['km', t('expenses.mi.km')], ['mi', t('expenses.mi.mi')]], last.unit || (/^en-(US|GB)$/i.test(s.locale) ? 'mi' : 'km'));
    const f = {
      date: el('input', { type: 'date', value: S.ledger.today() }), from: el('input', { maxlength: 100, placeholder: t('expenses.mi.office') }),
      to: el('input', { maxlength: 100, placeholder: t('expenses.mi.client') }), back: el('input', { type: 'checkbox', checked: !!last.roundTrip }),
      distance: el('input', { inputmode: 'decimal', placeholder: '42' }), rate: el('input', { inputmode: 'decimal', value: S.money.typedPlain(last.rate || '0.45') }),
      purpose: el('input', { maxlength: 120, placeholder: t('expenses.mi.visit') }), cat: UI.select(accts.map((a) => [a.code, `${a.code} ${a.name}`]), pick),
    };
    const total = el('p', { class: 'sheet-total' }, el('span', null, t('expenses.mi.to_claim')), el('b', null, '—'));
    const msg = el('p', { class: 'msg bad', role: 'status' });   // i18n-ignore: CSS class names
    /** The distance as entered (doubled for there and back), the rate per unit and the amount; null parts while not valid. */
    const figures = () => {
      const one = NS.mileage.parseDistance(f.distance.value), rate = NS.mileage.typedNumber(f.rate.value);   // the page's language
      const distance = one === null ? null : f.back.checked ? one * 2 : one;
      const rateMinor = Number.isFinite(rate) && rate > 0 && rate < 100 ? rate * 100 : null;
      return { distance, rateMinor, amount: distance !== null && rateMinor !== null ? NS.mileage.amount(distance, rateMinor) : null };
    };
    const update = () => { const x = figures(); total.querySelector('b').textContent = x.amount !== null ? B.money(x.amount, s.currency, s.locale) : '—'; };
    for (const k of ['distance', 'rate', 'back']) f[k].addEventListener('input', update);
    f.back.addEventListener('change', update);
    unit.addEventListener('change', update);
    const body = el('div', { class: 'mileage-dialog' }, UI.field(t('expenses.mi.date'), f.date), UI.field(t('expenses.mi.from'), f.from), UI.field(t('expenses.mi.to'), f.to),
      el('label', { class: 'check' }, f.back, ' ' + t('expenses.mi.back')),
      UI.field(t('expenses.mi.distance'), f.distance), UI.field(t('expenses.mi.unit'), unit), UI.field(t('expenses.mi.rate', { cur: s.currency }), f.rate),
      UI.field(t('expenses.mi.purpose'), f.purpose), UI.field(t('expenses.mi.category'), f.cat), total, msg);
    update();
    UI.dialog({
      title: t('expenses.mi.title'), body,
      buttons: [{ label: t('expenses.mi.cancel') }, { label: t('expenses.mi.record'), primary: true, act: async () => {
        const x = figures();
        if (x.distance === null) { msg.textContent = t('expenses.mi.bad_distance'); return false; }
        if (x.rateMinor === null) { msg.textContent = t('expenses.mi.bad_rate'); return false; }
        const u = unit.value;
        const r = await S.expenses.record({ date: f.date.value, supplier: 'Mileage', account: f.cat.value, amount: x.amount, tax: 0, currency: s.currency, method: 'other',   // i18n-ignore: CSV columns and the claim text stored on the expense (records stay as written)
          description: NS.mileage.describe({ from: f.from.value.trim(), to: f.to.value.trim(), roundTrip: f.back.checked, distance: x.distance, unit: u, rateText: f.rate.value.trim(), purpose: f.purpose.value.trim() }) });
        if (!r.ok) { msg.textContent = B.refusal(r); return false; }
        remember({ rate: S.money.plainFromTyped(f.rate.value) || f.rate.value.trim(), unit: u, roundTrip: f.back.checked });   // kept as plain "0.45"
        UI.toast(t('expenses.mi.done', { amount: B.money(x.amount, s.currency, s.locale) }));
        NS.app.go(`e/${r.value.id}`);
        return undefined;
      } }],
    });
    setTimeout(() => f.from.focus(), 30);
  }

  function mount() { document.getElementById('xMileage').addEventListener('click', open); }

  NS.mileageDialog = { open, mount };
})(typeof window !== 'undefined' ? window : globalThis);
