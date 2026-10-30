// The document editor that Slop Orders and Slop Quotes share: one document on screen. Owns the form state (customer,
// date, notes, lines, the PDF template), loads the customers and products, checks the form, saves one save at a time,
// guards unsaved changes, and leaves. What is the app's own comes in cfg: its words, its statuses, the extra fields, the
// links it shows and the action buttons. The markup ids are the same in both apps (eTitle, eStatus, eMsg, eCustomer,
// eNewCustomer, eDate, eCurrency, eNotes, eLines, eAddLine, eTotals, eActions, eBack, eForm); the Document language pick
// (eDocLang: empty = the company's, SlopBiz.docLang) is added after the currency here. Classic script, loaded after
// shared/docs/model.js, lines.js, pdf-layouts.js, customer-dialog.js and product-dialog.js.
// SlopDocs.docEditor.create(cfg) returns the editor: { mount, open, reload, save, saveIfNeeded, back, setMsg, live, repaint,
// note, edited, isDirty, id, route, clean, state }. cfg:
//   ns                the app namespace (ns.app.go, ns.page.paint/mount/exportPdf, ns.util.settings/refusal)
//   noun, title       'order', 'New order'; route: 'o' (the hash is #o/<id>); list: the list route ('list')
//   data              { get(id), save(form), customers(), products() } resolving to Results
//   party?            'customer' (default) or 'supplier': the word for the other party (the picker, New …, its check)
//   statusLabel       status -> words; locked(st): true when the document is read only
//   dateError         the words for a missing date
//   extra?            { blank(st, settings), apply(st, rec), collect(st) -> fields or { error }, paint(st, ro), mount(st, edited),
//                     fieldError(name, st) -> words, null when fine, or undefined when the field is not its own }
//   heading?(st), statusText?(st), savedText?(created, st)   the title, the status chip and the save message, when they differ
//   actions(st, ed)   the buttons and notes for the current status (ed is the editor)
(function (g) {
  'use strict';
  const D = (g.SlopDocs = g.SlopDocs || {});
  const $ = (id) => document.getElementById(id);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  /** A word from the business tables (shared/biz/i18n), in the chosen language. */
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  /** The key part for a document noun ('purchase order' is po), for the sentences that name it. */
  const nounKey = (n) => ({ 'purchase order': 'po' })[n] || n;   // i18n-ignore: a noun id, not words
  const val = (x, ...a) => (typeof x === 'function' ? x(...a) : x);
  Object.assign(D, { tr, nounKey });

  function create(cfg) {
    const NS = cfg.ns, M = D.model, L = D.layouts, S = g.SlopData, UI = g.SlopUI, X = cfg.extra || {};
    const U = () => NS.util;
    const st = {
      id: null, number: '', status: 'draft', currency: 'USD', locale: 'en-US', defaultTaxRate: 0,
      customerId: '', date: '', notes: '', lines: [], customers: [], products: [], dirty: false,
      pdfSeed: 0, pdfLayout: '', docLang: '', company: { name: '', address: '', taxNumber: '', docLang: '' },
    };
    const isNew = () => !st.id;
    const locked = () => cfg.locked(st);
    const dirtyKey = `${cfg.noun}s-editor`, party = cfg.party || 'customer';

    function setMsg(text, bad) { const m = $('eMsg'); m.textContent = text || ''; m.className = `msg ${bad ? 'bad' : 'ok'}`; }
    let edits = 0;   // counts changes, so a save can tell that the person changed something while it was being written
    function setDirty(v) { if (v) edits++; st.dirty = v; if (g.SlopGuard) g.SlopGuard.setUnsaved(dirtyKey, v); }

    /** Copies a stored document into the form state (or into `to`, a copy of it). */
    async function applyRecord(rec, to = st) {
      Object.assign(to, {
        id: rec.id, number: rec.number || '', status: rec.status, currency: rec.currency, customerId: rec.customerId,
        date: rec.date, notes: rec.notes || '', pdfSeed: rec.pdfSeed ?? L.seedOf(rec), pdfLayout: rec.pdfLayout || '', docLang: rec.docLang || '',
      });
      to.lines = rec.lines.map((l) => ({ ...l }));
      if (X.apply) await X.apply(to, rec);
    }

    function blank(s) {
      Object.assign(st, { id: null, number: '', status: 'draft', currency: s.currency, customerId: '', date: S.ledger.today(), notes: '', pdfSeed: L.newSeed(), pdfLayout: '', docLang: '' });
      st.lines = [M.newLine(null, s.defaultTaxRate)];
      if (X.blank) X.blank(st, s);
    }

    /** Opens a document by id, or a new one for id null. Loads the customer and product lists first. */
    async function open(id) {
      const s = await U().settings();
      Object.assign(st, { locale: s.locale, defaultTaxRate: s.defaultTaxRate, company: { name: s.companyName, address: s.address, taxNumber: s.taxNumber, docLang: s.docLang } });
      const cs = await cfg.data.customers();
      const ps = await cfg.data.products();
      if (!cs.ok || !ps.ok) { setMsg(U().refusal(cs.ok ? ps : cs), true); return false; }
      st.customers = cs.value;
      st.products = ps.value;
      if (!id) blank(s);
      else {
        const r = await cfg.data.get(id);
        if (!r.ok || !r.value) { setMsg(r.ok ? tr('biz.doc.gone_' + nounKey(cfg.noun)) : U().refusal(r), true); return false; }
        await applyRecord(r.value);
      }
      setDirty(false);
      setMsg('');
      paint();
      return true;
    }

    /** Reloads the open document from the store (after an action changed it). */
    async function reload() {
      if (!st.id) return;
      const r = await cfg.data.get(st.id);
      if (r.ok && r.value) await applyRecord(r.value);
      setDirty(false);
      paint();
    }

    const lineOpts = () => ({
      products: st.products, currency: st.currency, locale: st.locale, readOnly: locked(),
      onEdit: (i, patch) => { st.lines[i] = { ...st.lines[i], ...patch }; setDirty(true); D.lines.drawTotals($('eTotals'), st.lines, lineOpts()); },
      onProduct: (i, p) => {
        const cur = st.lines[i];
        if (p) {
          const n = M.newLine(p, st.defaultTaxRate);
          st.lines[i] = { ...cur, productId: n.productId, sku: n.sku, description: n.description, unitPrice: n.unitPrice, taxRate: n.taxRate };
        } else st.lines[i] = { ...cur, productId: undefined, sku: undefined };
        setDirty(true);
        paint();
      },
      onNewProduct: (i) => D.productDialog.open(async (rec) => {
        const ps = await cfg.data.products();
        if (ps.ok) st.products = ps.value;
        lineOpts().onProduct(i, rec);
      }, { currency: st.currency }),
      onRemove: (i) => { st.lines.splice(i, 1); setDirty(true); paint(); },
    });

    function paintCustomers() {
      const sel = $('eCustomer'), h = U().h;
      sel.replaceChildren(h('option', { value: '', text: tr('biz.doc.choose_' + party) }), ...st.customers.map((c) => h('option', { value: c.id, text: c.name })));
      sel.value = st.customerId || '';
    }

    /** The Document language pick after the currency: empty is the company's language (named in it), then each choice. */
    function mountLang() {
      const at = $('eCurrency') && $('eCurrency').closest('label');
      if (!at || $('eDocLang')) return;
      const sel = U().h('select', { id: 'eDocLang' });
      at.after(U().h('label', null, U().h('span', { 'data-i18n': 'biz.dl.label', text: tr('biz.dl.label') }), ' ', sel));
      sel.addEventListener('change', () => { st.docLang = sel.value; setDirty(true); NS.page.paint(); });
      if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(paintLang);
    }
    function paintLang() {
      const sel = $('eDocLang'), DL = g.SlopBiz.docLang, h = U().h;
      if (!sel) return;
      const name = (c) => (g.SlopI18n && g.SlopI18n.lang(c) ? g.SlopI18n.lang(c).name : c);
      sel.replaceChildren(h('option', { value: '', text: tr('biz.dl.default', { lang: name(DL.pick('', st.company.docLang)) }) }),
        ...DL.langs().map((c) => h('option', { value: c, text: name(c) })));
      sel.value = st.docLang || '';
      sel.disabled = locked();
    }

    /** Fills every control from the state. Called after any change that redraws the form. */
    function paint() {
      $('eTitle').textContent = cfg.heading ? cfg.heading(st) : st.id ? st.number : val(cfg.title);
      const chip = $('eStatus');
      chip.textContent = cfg.statusText ? cfg.statusText(st) : val(cfg.statusLabel)[st.status] || st.status;
      chip.className = `chip ${st.status}`;
      paintCustomers();
      $('eDate').value = st.date;
      $('eCurrency').value = st.currency;
      $('eNotes').value = st.notes;
      paintLang();
      const ro = locked();
      for (const el of [$('eCustomer'), $('eNewCustomer'), $('eDate'), $('eNotes'), $('eAddLine')]) el.disabled = ro;
      D.lines.draw($('eLines'), st.lines, lineOpts());
      D.lines.drawTotals($('eTotals'), st.lines, lineOpts());
      if (X.paint) X.paint(st, ro);
      const acts = cfg.actions(st, api);   // the main ones go to the record panel's footer (shared/biz/panel.js)
      if (NS.recordPanel) NS.recordPanel.actions(acts, $('eActions')); else $('eActions').replaceChildren(...acts);
      NS.page.paint();
    }

    /** The first problem with one field, in the words the save gives (null when it is fine). */
    function fieldError(name, idx) {
      const own = X.fieldError ? X.fieldError(name, st) : undefined;
      if (own !== undefined) return own;
      if (name === 'customer') return st.customerId ? null : tr('biz.doc.need_' + party);
      if (name === 'date') return DATE.test(st.date) ? null : val(cfg.dateError);
      if (!st.lines[idx]) return null;
      const e = M.lineErrors(st.lines[idx]);
      return e.length ? tr('biz.doc.line_err', { n: String(idx + 1), errors: e.join('; ') }) : null;
    }

    /** Checks the form and returns the record to save, or the first problem in plain words. */
    function collect() {
      const first = fieldError('customer') || fieldError('date') || (st.lines.length ? null : tr('biz.doc.need_line'))
        || st.lines.map((l, i) => fieldError('line', i)).find(Boolean);
      if (first) return { error: first };
      const more = X.collect ? X.collect(st) : {};
      if (more.error) return { error: more.error };
      return { form: { id: st.id, customerId: st.customerId, date: st.date, notes: st.notes, currency: st.currency, lines: st.lines.map(M.cleanLine), pdfSeed: st.pdfSeed, pdfLayout: st.pdfLayout, docLang: st.docLang, ...more } };
    }

    /** The save in flight, if any. A second save waits for it, so two saves never race (a new document would get two numbers). */
    let inflight = null;
    function save() {
      if (inflight) return inflight.then(() => save());
      inflight = doSave().finally(() => { inflight = null; });
      return inflight;
    }
    async function doSave() {
      const c = collect();
      if (c.error) { setMsg(c.error, true); return false; }
      setMsg(tr('biz.doc.saving'));
      const gen = edits;
      const r = await cfg.data.save(c.form);
      if (!r.ok) { setMsg(U().refusal(r), true); return false; }
      const created = !st.id;
      // The record is read into a copy (an app's apply can wait on the store). A change made meanwhile, while this save was
      // written or read back (a layout picked, a field typed), stays on screen and unsaved, so the next save or step writes
      // it: only the stored identity is taken from the record then.
      const next = { ...st };
      await applyRecord(r.value, next);
      if (edits === gen) { Object.assign(st, next); setDirty(false); } else Object.assign(st, { id: r.value.id, number: r.value.number || '', status: r.value.status });
      if (created) history.replaceState(null, '', `#${cfg.route}/${r.value.id}`);
      paint();
      setMsg(cfg.savedText ? cfg.savedText(created, st) : tr(created ? 'biz.doc.created' : 'biz.doc.saved', { number: r.value.number }));
      return true;
    }

    /** Saves first when there are changes (or it is new), so an action always acts on what is on screen. Waits for a save in flight. */
    async function saveIfNeeded() {
      if (inflight) { setMsg(tr('biz.doc.waiting')); if (!(await inflight)) return false; }
      return !st.dirty && st.id ? true : save();
    }

    /** Saves first when needed, then downloads the PDF (the page's template and fields are what it shows). */
    async function exportPdf() {
      if (!(await saveIfNeeded())) return;
      setMsg(tr('biz.doc.making_pdf'));
      const done = await NS.page.exportPdf(st.id);
      setMsg(tr(done ? 'biz.doc.pdf_done' : 'biz.doc.pdf_failed'), !done);
    }

    /** Leaves the editor. Asks first when there are unsaved changes (unless force). */
    async function back(force) {
      if (!force && st.dirty) {
        const yes = await UI.confirm(tr('biz.doc.unsaved_title'), tr('biz.doc.unsaved_' + nounKey(cfg.noun)), tr('biz.doc.leave'), { danger: true });
        if (!yes) return;
      }
      setDirty(false);
      NS.app.go(cfg.list || 'list');
    }

    /** A change from outside the form (the paper view): mark it unsaved, redraw, and show the field's problem if any. */
    const edited = (msg) => { setDirty(true); paint(); setMsg(msg || '', true); };

    function mount() {
      $('eBack').addEventListener('click', () => back());
      $('eForm').addEventListener('submit', (e) => e.preventDefault());
      $('eDate').addEventListener('input', (e) => { st.date = e.target.value; setDirty(true); });
      $('eNotes').addEventListener('input', (e) => { st.notes = e.target.value; setDirty(true); });
      $('eCustomer').addEventListener('change', (e) => { st.customerId = e.target.value; setDirty(true); });
      $('eNewCustomer').addEventListener('click', () => D.customerDialog.open(async (rec) => {
        const cs = await cfg.data.customers();
        if (cs.ok) st.customers = cs.value;
        st.customerId = rec.id;
        setDirty(true);
        paint();
      }, { word: party }));
      $('eAddLine').addEventListener('click', () => { st.lines.push(M.newLine(null, st.defaultTaxRate)); setDirty(true); paint(); });
      if (X.mount) X.mount(st, () => setDirty(true));
      mountLang();
      NS.page.mount();
    }

    const api = {
      mount, open, reload, save, saveIfNeeded, back, exportPdf, setMsg, fieldError, isNew,
      live: () => st, repaint: () => paint(), note: (msg) => setMsg(msg, true), edited,
      isDirty: () => st.dirty, id: () => st.id, clean: () => setDirty(false),
      route: () => (st.id ? `${cfg.route}/${st.id}` : 'new'),
    };
    return api;
  }

  D.docEditor = { create };
})(typeof window !== 'undefined' ? window : globalThis);
