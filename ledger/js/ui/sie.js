// Import SIE (the Journal tab's "Import SIE…" button and File menu): reads an SIE file with the shared reader
// (shared/finance/sie.js, loaded when it is first used), makes the plan (core/sie-import.js), shows it and asks first:
// the accounts that will be added, the ones that get another code (and the code can be changed), the names that differ
// (kept unless the box is ticked), the opening balances and the vouchers. Then it adds the accounts and posts the entries
// one by one through SlopData.ledger, and shows what was imported and what was skipped, with the reason for each.
(function (g) {
  'use strict';
  const S = g.SlopData, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const ACTION = () => ({ add: t('ledger.sie.new'), same: t('ledger.sie.same'), rename: t('ledger.sie.rename'), map: t('ledger.sie.map'), merge: t('ledger.sie.merge'), conflict: t('ledger.sie.conflict') });
  // The plan (core/sie-import.js) names what it skips and why in English, and the opening balances' memo is stored with the
  // entries; the report shows those words in the page's language (say).
  const WHY = () => ({ 'already imported': t('ledger.sie.y_already'), 'the file gives no date for the start of the year': t('ledger.sie.y_no_start'),   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
    'they come to nothing on the accounts here (sub-accounts joined to their parent cancel out)': t('ledger.sie.y_nothing'), 'it has no date': t('ledger.sie.y_no_date'),   // i18n-ignore: the plan's words, looked up
    'it has fewer than two lines with an amount': t('ledger.sie.y_two'), 'one of its accounts has no free code here': t('ledger.sie.y_no_code'), 'not chosen': t('ledger.sie.y_not_chosen') });   // i18n-ignore: the plan's words, looked up
  function say(x) {
    const off = /^(they|it) do(?:es)? not balance \(off by (.+)\)$/.exec(x.why || ''), v = /^Voucher (.+)$/.exec(x.what || ''), a = /^Account (\S+)( name)?$/.exec(x.what || '');
    const what = x.what === 'Opening balances' ? t('ledger.sie.w_opening') : v ? t('ledger.sie.w_voucher', { ref: v[1] }) : a ? t(a[2] ? 'ledger.sie.w_account_name' : 'ledger.sie.w_account', { sie: a[1] }) : x.what;   // i18n-ignore: the plan's words, looked up
    const why = off ? t(off[1] === 'they' ? 'ledger.sie.y_off' : 'ledger.sie.y_v_off', { n: off[2] }) : WHY()[x.why] || x.why;
    return `${what}: ${why}`;
  }
  let reader = null;

  const list = async (name) => { const r = await S.store.list(name, { includeDeleted: true }); return r.ok ? r.value : []; };
  const N = { 'new account': 'ledger.sie.n_new_accounts', account: 'ledger.sie.n_accounts', voucher: 'ledger.sie.n_vouchers', item: 'ledger.sie.n_items' };   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
  const plural = (n, w) => t(N[w], { n });

  /** The plan for a file: the model, the plan and what the person can change. */
  async function prepare(file) {
    reader = reader || await import(new URL('../shared/finance/sie.js', document.baseURI).href);
    const model = reader.readSie(new Uint8Array(await file.arrayBuffer()));
    if (!model.accounts.length && !model.vouchers.length) throw new Error(model.warnings[0] || t('ledger.sie.no_data'));
    const [chart, journal, s] = await Promise.all([list('accounts'), list('journal'), NS.util.settings()]);
    const ctx = { chart, sources: new Set(journal.map((j) => j.source)), digits: S.money.digits(model.currency), mapping: {} };
    return { model, ctx, base: s.base, plan: NS.sieImport.plan(model, ctx) };
  }

  /** The ask-first dialog. Resolves to { renames, opening, vouchers } or null when cancelled. */
  function ask(job, file) {
    const { model } = job;
    return new Promise((resolve) => {
      const body = el('div', { class: 'sie-plan' });
      const opts = { renames: false, opening: true, vouchers: true };
      const draw = () => {
        const p = job.plan = NS.sieImport.plan(model, job.ctx);
        const by = (a) => p.accounts.filter((x) => x.action === a);
        const ib = p.entries.filter((e) => e.what === 'Opening balances'), vs = p.entries.filter((e) => e.what !== 'Opening balances');   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
        const remap = p.accounts.filter((a) => a.action === 'map' || a.action === 'merge' || a.action === 'conflict');
        const head = t('ledger.sie.head', { name: `${model.company || file.name}${model.orgNo ? ` (${model.orgNo})` : ''}`, type: model.type, cur: model.currency });
        const box = (key, label) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: opts[key], 'data-opt': key, onchange: (e) => { opts[key] = e.target.checked; } }), ` ${label}`);
        body.replaceChildren(...[
          el('p', { class: 'note' }, head),
          model.currency !== job.base ? el('p', { class: 'msg', role: 'note' }, t('ledger.sie.fx', { cur: model.currency, base: job.base })) : null,
          el('p', null, t('ledger.sie.accounts', { added: plural(by('add').length + by('map').length, 'new account'), here: plural(by('same').length + by('rename').length, 'account') })),   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
          remap.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'grid-t' }, el('thead', null, el('tr', null, el('th', null, 'SIE'), el('th', null, t('ledger.sie.col_name')), el('th', null, t('ledger.sie.col_code')), el('th', null, t('ledger.sie.col_why')))),
            el('tbody', null, remap.map((a) => el('tr', { class: a.action === 'conflict' ? 'bk-open' : '' }, el('td', null, a.sie), el('td', null, a.name),
              el('td', null, el('input', { value: a.code || '', size: 5, maxlength: 4, inputmode: 'numeric', 'aria-label': t('ledger.sie.code_for', { sie: a.sie }), 'data-sie': a.sie,
                onchange: (e) => { job.ctx.mapping[a.sie] = e.target.value.trim(); draw(); } })),
              el('td', null, `${ACTION()[a.action]}. ${a.note || ''}`)))))) : null,
              by('rename').length ? box('renames', t('ledger.sie.use_names', { accounts: plural(by('rename').length, 'account'), list: by('rename').slice(0, 3).map((a) => `${a.code} ${a.here} → ${a.name}`).join('; ') + (by('rename').length > 3 ? '; …' : '') })) : null,
              ib.length ? box('opening', t('ledger.sie.post_ib', { accounts: plural(ib[0].input.lines.length, 'account'), date: ib[0].input.date })) : null,
              vs.length ? box('vouchers', t('ledger.sie.post_v', { vouchers: plural(vs.length, 'voucher'), from: vs[0].input.date, to: vs[vs.length - 1].input.date })) : el('p', null, t('ledger.sie.no_v')),
              p.skipped.length ? el('p', { class: 'note' }, t('ledger.sie.skipped', { items: plural(p.skipped.length, 'item'), list: p.skipped.slice(0, 3).map(say).join('; ') + (p.skipped.length > 3 ? '; …' : '') })) : null,
              model.warnings.length ? el('p', { class: 'note' }, t('ledger.sie.notes', { notes: model.warnings.slice(0, 3).join(' ') })) : null,
              el('p', { class: 'note' }, t('ledger.sie.final'))].filter(Boolean));   // the DOM writes null as text
      };
      draw();
      UI.dialog({ title: t('ledger.sie.title', { file: file.name }), body, cls: 'sie-dlg', onClose: (okd) => { if (!okd) resolve(null); },
      buttons: [{ label: t('ledger.sie.cancel') }, { label: t('ledger.sie.import'), primary: true, act: () => {
          // codes typed but not yet committed (Enter presses Import straight away)
          for (const i of body.querySelectorAll('input[data-sie]')) job.ctx.mapping[i.dataset.sie] = i.value.trim();
          job.plan = NS.sieImport.plan(model, job.ctx);
          resolve({ ...opts });
          return undefined;
        } }] });
    });
  }

  /** Adds the accounts, renames when asked, posts the entries. Returns { added, renamed, posted, skipped }. */
  async function apply(job, opts) {
    const p = job.plan, skipped = p.skipped.slice();
    let added = 0, renamed = 0, posted = 0;
    const have = new Set((await list('accounts')).map((a) => a.code));
    for (const a of p.accounts) {
      if ((a.action === 'add' || a.action === 'map') && !have.has(a.code)) {
        const r = await NS.accounts.add({ code: a.code, name: a.name.slice(0, 200), type: a.type });
        if (r.ok) { added++; have.add(a.code); } else skipped.push({ what: `Account ${a.sie}`, why: NS.util.refusal(r) });   // i18n-ignore: the plan's words, shown through say
      } else if (a.action === 'rename' && opts.renames) {
        const r = await NS.accounts.rename(a.code, a.name.slice(0, 200));
        if (r.ok) renamed++; else skipped.push({ what: `Account ${a.sie} name`, why: NS.util.refusal(r) });   // i18n-ignore: the plan's words, shown through say
      }
    }
    for (const e of p.entries) {
      const isIb = e.what === 'Opening balances';   // i18n-ignore: the plan's name for the opening balances
      if ((isIb && !opts.opening) || (!isIb && !opts.vouchers)) { skipped.push({ what: e.what, why: 'not chosen' }); continue; }   // i18n-ignore: the plan's words, shown through say
      const r = await S.ledger.postJournal(e.input);
      if (r.ok) posted++; else skipped.push({ what: e.what, why: NS.util.refusal(r) });
    }
    return { added, renamed, posted, skipped };
  }

  function report(res, file) {
    const lines = res.skipped.map((x) => el('li', null, say(x)));
    UI.dialog({ title: t('ledger.sie.done_title'), cls: 'sie-dlg', buttons: [{ label: t('ledger.sie.done'), primary: true }],
      body: el('div', { class: 'sie-report', role: 'status' },
        el('p', null, t('ledger.sie.result', { file: file.name, added: plural(res.added, 'account'), renamed: plural(res.renamed, 'account'), n: res.posted })),
        res.skipped.length ? el('p', null, t('ledger.sie.skipped_n', { n: res.skipped.length })) : el('p', null, t('ledger.sie.none_skipped')),
        res.skipped.length ? el('ul', { class: 'sie-skipped' }, lines.slice(0, 100), res.skipped.length > 100 ? el('li', null, t('ledger.sie.more', { n: res.skipped.length - 100 })) : null) : null) });
  }

  /** The whole import of one file: read, ask, apply, report. Resolves to the result (or null when cancelled). */
  async function importFile(file) {
    let job;
    try { job = await prepare(file); } catch (e) { UI.alert(t('ledger.sie.not_imported'), (e && e.message) || String(e)); return null; }
    const opts = await ask(job, file);
    if (!opts) return null;
    const res = await apply(job, opts);
    report(res, file);
    if (NS.app && NS.app.render) await NS.app.render();
    return res;
  }

  /** Import SIE…: a part of the one intake of its own ('ledger.sie', shared/intake). */
  const pickSie = () => g.SlopIntake.pick({ to: 'ledger.sie', multiple: false, accept: '.se,.si,.sie,.txt' });
  function mount() {
    if (!$('jImportSie')) return;
    g.SlopIntake.register({ id: 'ledger.sie', main: false, paste: false, toast: false, limit: 1, accept: { any: true, noun: 'ledger.sie.noun' }, process: async (f) => { await importFile(f); return f.name; } });
    $('jImportSie').addEventListener('click', pickSie);
  }

  NS.views = NS.views || {};
  NS.views.sie = { mount };
  NS.sieView = { importFile, prepare, apply, pick: pickSie };
})(typeof window !== 'undefined' ? window : globalThis);
