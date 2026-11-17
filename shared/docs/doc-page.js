// The document on the page for the shared document editor (doc-editor.js): the paper view in the document's template (the
// same layout as the PDF), with the fields edited in place, and the PDF download. The state is the editor's (ns.editor.live()).
// A change gets the form's own check (ed.fieldError) and the editor repaints. A read-only document shows the page read only.
// The page's printed words are in the document's language (SlopBiz.docLang: the document's own, else the company's); its
// tables are fetched on first use and the page repaints when they are in. The editing controls speak the page's language.
// SlopDocs.docPage.create(cfg) returns { mount, paint, exportPdf }. cfg: { ns, kind: 'order', editable(st), pdf(id) -> Result
// of PDF bytes, view?(st) -> extra view fields (moreMeta, status), field?(st, name, value) -> true when it took a change to a
// field of its own }. Classic script.
(function (g) {
  'use strict';
  const D = (g.SlopDocs = g.SlopDocs || {});

  function create(cfg) {
    const NS = cfg.ns, S = g.SlopData, M = D.model, L = D.layouts;
    const st = () => NS.editor.live();
    const U = () => NS.util;
    let controller = null;

    /** The document for the paper view, from the editor's state. */
    function doc() {
      const s = st(), DL = g.SlopBiz.docLang, lang = DL.pick(s.docLang, s.company.docLang);
      if (!DL.ready(lang)) DL.load(lang).then(() => NS.editor.repaint());
      const w = DL.words(lang, s.locale);
      return {
        kind: cfg.kind, id: s.id, number: s.number, status: s.status, words: w,
        date: s.date, notes: s.notes, currency: s.currency, locale: s.locale, lines: s.lines,
        customer: s.customers.find((c) => c.id === s.customerId) || {}, customerId: s.customerId, company: s.company,
        totals: M.totals(s.lines), paid: 0, balance: null, money: (m) => U().money(m, s.currency, w.locale),
        pdfSeed: s.pdfSeed, pdfLayout: s.pdfLayout, ...(cfg.view ? cfg.view(s) : {}),
      };
    }

    /** The company name is the shared settings' company name (the one the settings page edits). */
    async function saveCompany(name) {
      const s = st();
      s.company = { ...s.company, name: name.trim() };
      NS.editor.repaint();
      const cur = await S.store.get('settings', 'main');
      const base = cur.ok && cur.value ? cur.value : S.schema.DEFAULT_SETTINGS;
      // settings saved for the first time keep the page's language as the documents' (SlopBiz.docLang's rule)
      const r = await S.store.put('settings', { ...base, companyName: s.company.name, docLang: base.docLang || g.SlopBiz.docLang.pick('', '') });
      if (!r.ok) NS.editor.note(U().refusal(r));
    }

    /** One change from the paper or the layout pick, into the state the form's inputs write. Editable documents only. */
    function field(name, idx, value) {
      if (name === 'company') return saveCompany(value);
      const s = st();
      if (!cfg.editable(s)) return undefined;
      if (name === 'layout') s.pdfLayout = value;
      else if (name === 'seed') s.pdfSeed = L.newSeed();
      else if (name === 'customer') s.customerId = value;
      else if (name === 'date') s.date = value;
      else if (name === 'notes') s.notes = value;
      else if (cfg.field && cfg.field(s, name, value)) { /* the app's own field, such as a quote's validUntil */ }
      else if (s.lines[idx]) s.lines[idx] = { ...s.lines[idx], [name]: D.lines.parseField(name, value, s.currency) };
      else return undefined;
      return NS.editor.edited(name === 'layout' || name === 'seed' ? '' : NS.editor.fieldError(name, idx));
    }

    /** Downloads the document's PDF as <number>.pdf. Resolves true when it was made; a refusal says why. */
    async function exportPdf(id) {
      const r = await cfg.pdf(id);
      if (!r.ok) { g.SlopUI.alert(D.tr('biz.doc.pdf_not_made'), D.tr('biz.doc.pdf_not_made_why', { why: r.message || U().refusal(r) })); return false; }
      g.SlopUI.download(new Blob([r.value], { type: 'application/pdf' }), `${(st().id === id && st().number) || cfg.kind}.pdf`);
      g.SlopUI.toast(D.tr('biz.doc.pdf_downloaded'));
      return true;
    }

    function mount() {
      const $ = (id) => document.getElementById(id);
      controller = D.page.mount({
        root: $('view-edit'), host: $('ePage'), modes: $('eModes'), layout: $('eLayout'),
        doc, canEdit: () => cfg.editable(st()), customers: () => st().customers, field,
      });
    }

    return { mount, paint: () => controller && controller.paint(), exportPdf, doc };
  }

  D.docPage = { create };
})(typeof window !== 'undefined' ? window : globalThis);
