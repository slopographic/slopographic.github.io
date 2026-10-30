// Stock view: one product at a time. Levels per location, the movement history, and four forms (receive, sell,
// adjust, transfer) in the view's right panel, one at a time: the chosen form shows and the panel's one main button
// (#sApply, at its foot) submits it. Every form calls the stock rules through NS.stockOps; a refusal is shown in plain words.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const U = NS.util;
  const { h } = U;
  const $ = (id) => document.getElementById(id);
  let productId = null;
  let products = [];
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const REASON = () => ({ receipt: t('inventory.st.r_receipt'), sale: t('inventory.st.r_sale'), adjustment: t('inventory.st.r_adjustment'), transfer: t('inventory.st.r_transfer'), count: t('inventory.st.r_count'), return: t('inventory.st.r_return') });

  const onHandAt = async (id, loc) => { const r = await S.stock.onHand(id, loc); return r.ok ? r.value : '?'; };

  function say(text, bad) {
    const m = $('sMsg');
    m.textContent = text;
    m.className = `msg ${bad ? 'bad' : 'ok'}`;
  }

  /** Runs one stock action and reports it. ok(r) gives the success line; a refusal shows its plain reason. */
  async function act(promise, okText) {
    const r = await promise;
    if (!r.ok) { say(U.refusal(r), true); return false; }
    say(await okText(r));
    return true;
  }

  async function fillProducts() {
    const r = await S.store.list('products');
    products = r.ok ? r.value.slice().sort((a, b) => a.name.localeCompare(b.name)) : [];
    if (!products.some((p) => p.id === productId)) productId = products.length ? products[0].id : null;
    $('sProduct').replaceChildren(...products.map((p) => h('option', { value: p.id, selected: p.id === productId }, `${p.name} (${p.sku})`)));
    $('sProduct').disabled = !products.length;
  }

  /** Every location name in use, for the datalists. */
  async function fillLocations() {
    const m = await S.store.list('stockMovements');
    const names = new Set(['main', 'back']);
    if (m.ok) for (const x of m.value) names.add(x.location);
    $('locations').replaceChildren(...[...names].sort().map((n) => h('option', { value: n })));
  }

  async function draw() {
    const st = NS.state.settings || { currency: 'USD', locale: 'en-US' };
    const p = products.find((x) => x.id === productId);
    $('sTitle').textContent = p ? `${p.name} (${p.sku})` : t('inventory.st.no_products');
    if (!p) { $('sLevels').replaceChildren(h('li', { class: 'empty', text: t('inventory.st.add_first') })); $('sHistory').replaceChildren(); $('sTotal').textContent = ''; return; }
    const lv = await S.stock.levels(p.id);
    const levels = lv.ok ? Object.entries(lv.value).sort(([a], [b]) => a.localeCompare(b)) : [];
    const total = levels.reduce((s, [, q]) => s + q, 0);
    $('sLevels').replaceChildren(...(levels.length ? levels : [['main', 0]]).map(([loc, q]) =>
      h('li', null, h('span', { text: loc }), h('b', { class: 'num', text: `${q} ${p.unit || t('inventory.st.each')}` }))));
      $('sTotal').textContent = t('inventory.st.total', { n: total, unit: p.unit || t('inventory.st.each'), value: U.money(S.money.mulDiv(total, p.price, 1), st.currency, st.locale) });
    const hist = await S.store.list('stockMovements', { index: 'productId', value: p.id });
    const moves = hist.ok ? hist.value.slice().sort((a, b) => b.createdAt - a.createdAt) : [];
    $('sHistory').replaceChildren(...(moves.length ? moves : []).map((m) => h('li', { class: m.qty < 0 ? 'out' : 'in' },
      h('span', { class: 'mono', text: m.date }),
      h('span', { text: `${REASON()[m.reason] || m.reason} · ${m.location}` }),
      h('b', { class: 'num', text: m.qty > 0 ? `+${m.qty}` : String(m.qty) }),
      m.ref ? h('span', { class: 'sub mono', text: m.ref.length > 28 ? `${m.ref.slice(0, 26)}…` : m.ref } ) : null)));   // i18n-ignore: CSS class names
    if (!moves.length) $('sHistory').replaceChildren(h('li', { class: 'empty', text: t('inventory.st.no_moves') }));
  }

  async function refresh() {
    await fillProducts();
    await fillLocations();
    await draw();
  }

  function mount() {
    $('sProduct').addEventListener('change', (e) => { productId = e.target.value; say(''); draw(); });
    $('sKinds').addEventListener('click', (e) => { const b = e.target.closest('[data-form]'); if (b) { choose(b.dataset.form); say(''); } });
    $('fReceive').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!productId) return say(t('inventory.st.choose'), true);
      const loc = U.cleanLocation($('rLoc').value);
      const qty = U.wholeOf($('rQty').value);
      const note = $('rNote').value.trim() || undefined;
      if (await act(NS.stockOps.receive({ productId, location: loc, qty, note }), async () => t('inventory.st.received', { qty, loc, n: await onHandAt(productId, loc) }))) $('rQty').value = '';
    });
    $('fSell').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!productId) return say(t('inventory.st.choose'), true);
      const loc = U.cleanLocation($('sellLoc').value);
      const qty = U.wholeOf($('sellQty').value);
      const allowNegative = $('sellNeg').checked;
      if (await act(NS.stockOps.sell({ productId, location: loc, qty, allowNegative }), async () => t('inventory.st.sold', { qty, loc, n: await onHandAt(productId, loc) }))) $('sellQty').value = '';
    });
    $('fAdjust').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!productId) return say(t('inventory.st.choose'), true);
      const loc = U.cleanLocation($('adjLoc').value);
      const qty = U.wholeOf($('adjQty').value);
      const allowNegative = $('adjNeg').checked;
      if (await act(NS.stockOps.adjust({ productId, location: loc, qty, allowNegative }), async () => t('inventory.st.adjusted', { qty: `${qty > 0 ? '+' : ''}${qty}`, loc, n: await onHandAt(productId, loc) }))) $('adjQty').value = '';
    });
    $('fTransfer').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!productId) return say(t('inventory.st.choose'), true);
      const from = U.cleanLocation($('trFrom').value);
      const to = U.cleanLocation($('trTo').value);
      const qty = U.wholeOf($('trQty').value);
      await act(NS.stockOps.transfer({ productId, from, to, qty }), async () => t('inventory.st.moved', { qty, from, to }));
    });
  }

  const FORMS = { receive: 'fReceive', sell: 'fSell', adjust: 'fAdjust', transfer: 'fTransfer' };
  const FIRST = { fReceive: 'rQty', fSell: 'sellQty', fAdjust: 'adjQty', fTransfer: 'trQty' };
  /** Shows one form (its id) and makes the footer's main button submit it, with the form's name. */
  function choose(id) {
    for (const b of $('sKinds').querySelectorAll('[data-form]')) {
      const on = b.dataset.form === id;
      b.setAttribute('aria-pressed', String(on));
      $(b.dataset.form).hidden = !on;
      if (on) $('sApply').textContent = b.textContent.trim();
    }
    $('sApply').setAttribute('form', id);
  }

  /** The palette's Stock commands: the stock view with that form chosen (on a phone its sheet opens), its quantity focused. */
  async function open(kind) {
    const id = FORMS[kind] || FORMS.receive;
    if (NS.state.view !== 'stock') await NS.app.show('stock');
    choose(id);
    say('');
    const rp = NS.stockPanel;
    if (rp && rp.frame && rp.frame.isPhone()) rp.frame.openSheet();
    setTimeout(() => $(FIRST[id]).focus(), 40);
  }

  NS.stockView = { select: (id) => { productId = id; }, open, choose };
  NS.views = NS.views || {};
  NS.views.stock = { mount, refresh, onShow: (arg) => { if (arg) productId = arg; return refresh(); } };
})(typeof window !== 'undefined' ? window : globalThis);
