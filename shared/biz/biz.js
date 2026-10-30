// SlopBiz: the helpers every business app needs on top of SlopData (shared/data): one readable line for a refused
// Result, the settings an app shows (currency, locale, tax, company), money in the person's currency and locale, and the
// expense accounts of the chart, the command wiring and a DOM builder. Every business app uses these (no copies).
// Classic script, loaded after shared/data. Exposes window.SlopBiz (and module.exports for the Node tests).
(function (g) {
  'use strict';
  // Plain words for each refusal code; the data layer's own message follows after a colon. Apps add or override words.
  const PLAIN = {
    // (each reads biz.err.<code> from the string tables, shared/biz/i18n, in the chosen language)
    invalid: 0, invalid_transition: 0, not_found: 0, conflict: 0, immutable: 0, posting_required: 0, deleted: 0, in_use: 0,
    insufficient_stock: 0, overpayment: 0, has_payments: 0, unbalanced: 0, quota: 0, blocked: 0, unavailable: 0,
  };

  /** One readable line for a failed Result: the field errors when there are any, else the plain words for its code and the
   *  data layer's message. opts.plain and opts.fields (field id -> label) let an app use its own words; opts.brackets puts the
   *  message in brackets after the words instead of after a colon. */
  function refusal(r, opts = {}) {
    if (!r) return t('biz.err.something');
    const fields = opts.fields || {};
    if (Array.isArray(r.errors) && r.errors.length) {
      return r.errors.map((e) => (e.field ? `${fields[e.field] || e.field} ${e.message}` : e.message)).join('. ');
    }
    const head = (opts.plain || {})[r.code] || (r.code in PLAIN ? t('biz.err.' + r.code) : '');
    if (head) return !r.message ? head : opts.brackets ? `${head} (${r.message})` : `${head}: ${r.message}`;
    return r.message || t('biz.err.something');
  }

  const data = () => g.SlopData;
  const STATUS = ['draft', 'issued', 'paid', 'void', 'credited', 'open', 'fulfilled', 'cancelled', 'sent', 'accepted', 'declined', 'ordered', 'received', 'posted', 'owed'];
  /** A record's status in words, in the chosen language ("open" is a confirmed order); an unknown one as it is. */
  const statusText = (s) => (STATUS.includes(s) ? t('biz.st.' + s) : String(s || ''));
  /** A word from the business tables (shared/biz/i18n), or the key when SlopI18n is absent; a function value is called. */
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const val = (x) => (typeof x === 'function' ? x() : x);

  /** The settings an app shows: currency, locale, default tax rate, payment terms and the company block. Defaults when nothing
   *  is stored. */
  async function settings() {
    const S = data(), r = await S.store.get('settings', 'main');
    const s = r.ok && r.value ? r.value : S.schema.DEFAULT_SETTINGS;
    return { currency: s.defaultCurrency || 'USD', locale: s.locale || 'en-US', defaultTaxRate: s.defaultTaxRate || 0,
      paymentTermsDays: s.paymentTermsDays ?? 30, companyName: s.companyName || '', address: s.address || '', taxNumber: s.taxNumber || '',
      docLang: s.docLang || '' };
  }

  /* ---- The document language: the words of printed, downloaded and emailed documents (biz.pr.* in shared/biz/i18n) are read
   * in it, not in the page's language. The choices are the languages the business tables ship (SlopI18n.shipped('biz')).
   * The rule: the document's own docLang, else the company's (settings.docLang, set in Slop Admin), else the page's language
   * when it is a choice, else English. Settings saved without one store the page's language of that moment (Admin's first
   * save, or a company name typed on a document), so a company keeps the language it was set up in. */
  const docLangs = () => { const l = g.SlopI18n && g.SlopI18n.shipped ? g.SlopI18n.shipped('biz') : []; return l.length ? l : ['en']; };
  const pageLang = () => (g.SlopI18n ? g.SlopI18n.get() : 'en');
  /** The document language for a document's own choice and the company's (either may be empty). */
  const pickLang = (own, company) => [own, company, pageLang()].find((c) => c && docLangs().includes(c)) || 'en';
  /** The Intl locale of a document: the company locale when it is of the document's language (en-GB for en), else the language. */
  const docLocale = (lang, locale) => (locale && String(locale).split('-')[0].toLowerCase() === String(lang).split('-')[0].toLowerCase() ? locale : lang);
  const DAY = { year: 'numeric', month: '2-digit', day: '2-digit' };
  /** The words of a document language: SlopI18n.at (t, num, date, money) plus day(iso) for a YYYY-MM-DD date in its numeric
   *  form (2026-10-26 in Swedish, 10/26/2026 in US English). A key whose tables are not in yet reads English. */
  function docWords(lang, locale) {
    const w = g.SlopI18n && g.SlopI18n.at ? g.SlopI18n.at(lang, docLocale(lang, locale)) : { code: 'en', t: (k) => k, date: () => '' };
    return Object.assign({}, w, { day: (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? w.date(`${iso}T12:00:00`, DAY) || iso : iso || '') });
  }
  const docLoaded = new Set();
  /** Fetches the business tables of a document language (once) and resolves to its words. */
  async function docLoad(lang, locale) {
    if (g.SlopI18n && g.SlopI18n.need && !docLoaded.has(lang)) { await g.SlopI18n.need(lang, false, 'biz'); docLoaded.add(lang); }
    return docWords(lang, locale);
  }
  const docLang = { langs: docLangs, pick: pickLang, locale: docLocale, words: docWords, load: docLoad,
    ready: (lang) => lang === 'en' || lang === pageLang() || docLoaded.has(lang) };

  /** Minor units as money text in a currency and locale ("€24.00"). */
  const money = (minor, currency, locale) => data().money.formatMinor(minor, currency, locale);

  /** The chart's expense accounts, by code: [{ code, name }]. */
  async function expenseAccounts() {
    const r = await data().store.list('accounts', { index: 'type', value: 'expense' });
    return r.ok ? r.value.map((a) => ({ code: a.code, name: a.name })).sort((a, b) => (a.code < b.code ? -1 : 1)) : [];
  }

  /** An app's commands: registered with SlopCmd (the palette, remappable keys) when the page loads it, and [data-cmd]
   *  elements run them on click. list: [{ id, title, group, keywords, when, run }]. Returns run(id) (true when it ran). */
  function commands(app, own) {
    // every app that keeps records has "Fill with a sample…" (shared/biz/sample.js, loaded when it is first used)
    const list = own.concat([{ id: 'biz.sample', title: () => t('biz.cmd.sample'), group: () => t('biz.cmd.g_data'), keywords: ['random', 'example', 'demo', 'seed', 'test data'],   // i18n-ignore: a palette keyword (API)
      when: () => !(g.SlopBiz.sample && g.SlopDataAI && g.SlopDataAI.APPS && !g.SlopBiz.sample.kinds(app).length), run: () => sample(app) }]);
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    const C = g.SlopCmd;
    // title, group and description may be functions (the words in the chosen language): read again on a language change
    const reg = () => C.register(list.map((c) => ({ id: c.id, title: val(c.title), group: val(c.group), description: val(c.description), keywords: c.keywords || [], keys: [], when: c.when, run: () => c.run() })));
    if (C) {
      C.init({ app });
      reg();
      if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(reg);
      if (C.provide) C.provide({ prepare: () => assistant(app) });
    }
    function run(id) {
      const c = byId[id];
      if (!c) return false;
      if (C && C.get(id)) return C.run(id);
      if (c.when && !c.when()) return false;
      try { c.run(); } catch (err) { console.error(err); if (g.SlopUI) g.SlopUI.toast(t('biz.toast.cmd_failed', { what: val(c.title), why: err.message })); }
      return true;
    }
    if (g.document) g.document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-cmd]');
      if (!el || el.disabled || !byId[el.dataset.cmd]) return;
      e.preventDefault();
      run(el.dataset.cmd);
    });
    return run;
  }

  /** The assistant's record commands (shared/data/ai-records.js, ai-records-apps.js) and the samples (sample.js), loaded
   *  when the AI panel first asks. */
  const HERE = g.document && g.document.currentScript ? g.document.currentScript.src : '';
  const one = (rel) => new Promise((res, rej) => {
    const s = Object.assign(g.document.createElement('script'), { src: new URL(rel, HERE || g.location.href).href, async: false });
    s.onload = res; s.onerror = () => rej(new Error('Could not load ' + rel)); g.document.head.append(s);
  });
  function records() {
    const need = g.SlopDataAI && g.SlopDataAI.APPS ? Promise.resolve() : one('../data/ai-records.js').then(() => one('../data/ai-records-apps.js'));
    return need.then(() => (g.SlopBiz.sample ? null : one('sample.js')));
  }
  function assistant(app) { return records().then(() => g.SlopDataAI.install(app)); }
  /** The "Fill with a sample" dialog (shared/biz/sample.js). */
  function sample(app) { return records().then(() => g.SlopBiz.sample.dialog(app)); }

  /** Small DOM builder: h('a', { class, href, text, dataset, onclick }, 'text', child). Text children are escaped by the DOM. */
  function h(tag, attrs, ...kids) {
    const e = g.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      e.append(c instanceof g.Node ? c : g.document.createTextNode(String(c)));
    }
    return e;
  }

  const api = { PLAIN, refusal, statusText, settings, money, docLang, expenseAccounts, commands, assistant, sampleDialog: sample, h };
  g.SlopBiz = Object.assign(g.SlopBiz || {}, api);   // merge: router.js, backup.js and setup.js may have loaded first
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
