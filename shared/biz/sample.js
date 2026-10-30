/* SlopBiz.sample: "Fill with a sample" for every business app, in one place. A seeded sample record (shared/sample's
 * SlopSample.record: a quote with its customer and lines, a contact, a product, an expense, time, a task, an event) is
 * saved through the store and the app's own posting call (SlopDataAI.APPS[app].post, shared/data/ai-records-apps.js), so
 * every rule of the data layer applies. Which records an app has comes from SlopDataAI.APPS too (the one list).
 * Loaded on demand by shared/biz/biz.js (the biz.sample command and the assistant). Classic script.
 *   make({ app, collection, seed, count, locale, remember }) -> { seed, collection, made: [{ id, number, name, customer }] }
 *   dialog(app)          the SlopUI dialog: what, how many, the seed (shown, typed, or a new one), the language
 *   command(add, cfg, app)  the assistant's make_sample (shared/data/ai-records.js install calls it)
 *   kinds(app)           [[collection, label]] the app can make samples of */
(function (g) {
  'use strict';
  const B = (g.SlopBiz = g.SlopBiz || {});
  if (B.sample) return;
  const D = () => g.SlopData;
  const HERE = g.document && g.document.currentScript ? g.document.currentScript.src : '';
  const LABEL = { quotes: 'Quote', invoices: 'Invoice (draft)', orders: 'Order', purchases: 'Purchase order', customers: 'Customer', products: 'Product',   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
    expenses: 'Expense', timeEntries: 'Time entry', tasks: 'Task', events: 'Event' };   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
  const FILES = ['rng', 'en', 'sv', 'people', 'goods', 'records'];
  // LABEL names the records in the assistant's words (English: API); the page reads biz.kind.<collection>.
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let lastSeed = '';

  /** shared/sample's scripts, when the page does not have them yet. */
  function load() {
    if (g.SlopSample && g.SlopSample.record) return Promise.resolve();
    return FILES.reduce((p, f) => p.then(() => new Promise((res, rej) => {
      const s = Object.assign(g.document.createElement('script'), { src: new URL(`../sample/${f}.js`, HERE || g.location.href).href, async: false });
      s.onload = res; s.onerror = () => rej(new Error(`Could not load shared/sample/${f}.js`)); g.document.head.append(s);
    })), Promise.resolve());
  }
  const cfgOf = (app) => (g.SlopDataAI && g.SlopDataAI.APPS && g.SlopDataAI.APPS[app]) || null;
  /** [[collection, label]] of the records this app keeps that a sample can be made of. */
  function kinds(app) {
    const cfg = cfgOf(app), all = (g.SlopSample && g.SlopSample.COLLECTIONS) || Object.keys(LABEL);
    return (cfg ? cfg.collections : []).filter((c) => all.includes(c)).map((c) => [c, LABEL[c] ? t('biz.kind.' + c) : c]);
  }
  const unwrap = (r, what) => { if (!r || !r.ok) throw new Error(`${what}: ${(r && (r.message || (r.errors || []).map((e) => `${e.field} ${e.message}`).join('; '))) || 'refused'}`); return r.value; };

  /** What a sample is made with: the app's currency, language, terms, expense accounts and SKUs in use, and today. */
  async function context(locale) {
    const s = await B.settings(), S = D();
    const accounts = B.expenseAccounts ? (await B.expenseAccounts()).map((a) => a.code) : [];
    const ps = await S.store.list('products');
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
    return { locale: locale || String(s.locale || (g.document && g.document.documentElement.lang) || 'en').split('-')[0], currency: s.currency,
      digits: S.money.digits ? S.money.digits(s.currency) : 2, terms: s.paymentTermsDays, today: S.ledger.today(), accounts,
      skus: new Set(ps.ok ? ps.value.map((p) => p.sku) : []), tz };
  }
  /** The customer a document is for: the one with that name, else saved now (a sample, so Delete all samples finds it). */
  async function customerFor(rec, remember) {
    const S = D().store, list = unwrap(await S.list('customers'), 'Customers');   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
    const hit = list.find((c) => c.name === rec.name);
    if (hit) return hit;
    const made = unwrap(await S.put('customers', rec), 'New customer');   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
    if (remember) remember({ kind: 'created', collection: 'customers', id: made.id });
    return made;
  }

  async function make(o) {
    await load();
    const X = g.SlopSample, cfg = cfgOf(o.app) || { collections: [o.collection] };
    const collection = o.collection || kinds(o.app).map((k) => k[0])[0];
    if (!collection || !X.COLLECTIONS.includes(collection)) throw new Error(`No samples for ${collection || 'this app'}; there are samples for ${X.COLLECTIONS.join(', ')}`);
    const seed = X.normSeed(o.seed), count = Math.max(1, Math.min(20, Math.round(Number(o.count) || 1)));
    const ctx = await context(o.locale), made = [];
    for (let i = 0; i < count; i++) {
      const out = X.record(collection, count > 1 ? `${seed}#${i + 1}` : seed, ctx), rec = out.record;
      let who = null;
      if (out.customer) { who = await customerFor(out.customer, o.remember); rec.customerId = who.id; }
      const post = cfg.post && cfg.post[collection];
      const saved = unwrap(post ? await post(rec) : await D().store.put(collection, rec), `New ${LABEL[collection] || collection}`);   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
      if (o.remember) o.remember({ kind: 'created', collection, id: saved.id });
      made.push({ id: saved.id, number: saved.number || '', name: saved.name || saved.title || saved.description || saved.supplier || '', customer: who ? who.name : '' });
    }
    lastSeed = seed;
    return { seed, collection, made };
  }
  /** The toast after the dialog, in the chosen language: "Skapade ett exempel: Offert Q-0012 (frö 4821)…". */
  function saidHere(r) {
    const one = r.made[0] || {}, ref = [one.number || (one.name ? `(${one.name})` : ''), one.customer ? `· ${one.customer}` : ''].filter(Boolean).join(' ');
    const what = t('biz.kind.' + r.collection), seed = String(r.seed);
    return r.made.length === 1 ? t('biz.sample.made_one', { what, ref, seed }) : t('biz.sample.made_n', { n: r.made.length, what, seed });
  }
  /** The assistant's words (English: API): "Made a sample quote Q-0012 for Harbour Studio Ltd (seed 4821)." */
  function said(r) {
    const noun = (LABEL[r.collection] || r.collection).toLowerCase().replace(/ \(draft\)$/, ''), one = r.made[0] || {};
    const what = r.made.length === 1 ? `a sample ${noun}${one.number ? ' ' + one.number : one.name ? ` (${one.name})` : ''}${one.customer ? ` for ${one.customer}` : ''}`
      : `${r.made.length} sample ${noun === 'time entry' ? 'time entries' : noun + 's'}`;
    return `Made ${what} (seed ${r.seed}). The same seed makes the same sample again.`;   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
  }

  async function dialog(app) {
    const UI = g.SlopUI;
    await load();
    const list = kinds(app);
    if (!list.length) { UI.toast(t('biz.sample.none')); return; }
    const what = UI.select(list, list[0][0]);
    const seed = UI.el('input', { class: 'sui-input biz-seed', type: 'text', maxlength: '40', value: g.SlopSample.newSeed(), autocomplete: 'off', spellcheck: 'false', 'aria-label': t('biz.sample.seed'), style: 'flex:1;min-width:0' });
    const again = UI.el('button', { type: 'button', class: 'sui-btn', onclick: () => { seed.value = g.SlopSample.newSeed(); seed.focus(); } }, t('biz.sample.new_seed'));
    const count = UI.number(1, 1, 20, 1);
    const lang = UI.select(g.SlopSample.LOCALES, String((g.document.documentElement.lang || 'en')).split('-')[0] === 'sv' ? 'sv' : 'en');
    const note = UI.el('p', { class: 'sui-p', role: 'status' }, lastSeed ? t('biz.sample.last', { seed: lastSeed }) : t('biz.sample.type_seed'));
    const body = UI.el('div', { class: 'biz-sample' }, UI.field(t('biz.sample.make'), what), UI.el('label', { class: 'sui-field' }, UI.el('span', { class: 'sui-label' }, t('biz.sample.seed')),
    UI.el('span', { class: 'biz-seed-row', style: 'display:flex;gap:8px;align-items:center' }, seed, again)), UI.field(t('biz.sample.how_many'), count), UI.field(t('biz.sample.language'), lang), note);
    UI.dialog({ title: t('biz.sample.title'), body, buttons: [{ label: t('menu.cancel') }, { label: t('biz.sample.make'), primary: true, act: async () => {
    try { const r = await make({ app, collection: what.value, seed: seed.value, count: count.value, locale: lang.value }); UI.toast(saidHere(r), 6000); return true; } catch (e) { note.textContent = e.message; return false; }
    } }] });
  }

  /** The assistant's make_sample, for the apps whose records have samples. */
  function command(add, cfg, app) {
    const list = kinds(app);
    if (!list.length) return;
    add('make_sample', 'Make a sample record', [{ name: 'collection', type: 'enum', values: list.map((k) => k[0]), default: list[0][0], description: 'which records' },   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
      { name: 'seed', type: 'string', maxLength: 40, description: 'the same seed makes the same sample; empty for a new one' },
      { name: 'count', type: 'number', min: 1, max: 20, integer: true, default: 1 }, { name: 'locale', type: 'enum', values: ['en', 'sv'], description: 'the language of names and goods' }],   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
    async (a) => { const r = await make({ app, collection: a.collection, seed: a.seed, count: a.count, locale: a.locale, remember: g.SlopDataAI.remember }); return Object.assign({ done: said(r) }, r); },
    { description: `Fill ${cfg.label} with realistic sample records (a ${list[0][1].toLowerCase()} with a customer and lines, say), from a seed you can give again.` });   // i18n-ignore: the assistant's words and the record errors (English: API); the page reads biz.kind.<collection>
  }

  B.sample = { make, dialog, command, kinds, load, said, LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
