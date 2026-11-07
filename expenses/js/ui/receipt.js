// Slop Expenses: "From a receipt…". A photo of a receipt (the camera on a phone, or a picture chosen) is read on this device by
// the site's text reader (shared/ocr/engines.js with its quick model: PP-OCRv4, or Tesseract's English model where PaddleOCR is
// not offered; Get more offers it the first time, nothing downloads before), and what it says
// fills the new expense: supplier, date, amount and tax (SlopExpenses.receipt.parse). The photo is kept in Slop Drive and
// linked to the expense (receiptId) when it is recorded. Everything stays on the device. Exposes SlopExpenses.receiptScan.
(function (g) {
  'use strict';
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  const $ = (id) => document.getElementById(id);
  const MAX_SIDE = 2000;
  /** The reader's model: the quick one of the OCR engine chosen. */
  const model = () => (g.SlopOcrEngines ? g.SlopOcrEngines.quick() : 'ppocr-v4');
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let pending = null;   // the Drive id of the photo read for the form now shown, until it is recorded or the form changes

  /** True once the reader's model is on this device; the first time, the Get more dialog asks (and may be cancelled). */
  async function ensureModel() {
    const M = g.SlopAIManager;
    if (!M || !g.SlopAITools) throw new Error(t('expenses.rc.no_tool'));
    if ((await M.status(model())) !== 'needs-download') return true;
    return new Promise((resolve) => g.SlopAIGetMore.open(model(), { onInstalled: () => resolve(true), onClose: () => resolve(false) }));
  }

  /** Reads one photo: its lines of text, top to bottom. */
  async function readLines(file, onStatus) {
    const T = g.SlopAITools;
    const E = g.SlopOcrEngines;
    await E.load(model(), onStatus);
    onStatus(t('expenses.rc.reading'));
    const { bitmap, w, h } = await T.image(file, { maxSide: MAX_SIDE });
    const r = await E.run(model(), { bitmap, w, h });
    return r.lines.map((l) => l.text);
  }

  /** What was read goes into the form; the person checks it before Record. */
  function fill(got, settings) {
    const S = g.SlopData, cur = ($('eCurrency').value || settings.currency || 'USD').toUpperCase();
    if (got.supplier) $('eSupplier').value = got.supplier;
    if (got.date) $('eDate').value = got.date;
    if (got.currency && got.currency !== cur) $('eCurrency').value = got.currency;
    const c = $('eCurrency').value || cur;
    if (got.total !== null) $('eAmount').value = S.money.typedMinor(got.total, c);   // the form reads the page's language
    if (got.tax !== null) { $('eTax').value = S.money.typedMinor(got.tax, c); $('eTax').dispatchEvent(new Event('input')); }
  }

  /** The whole flow for one photo. say(text, bad) writes the editor's message line. */
  async function scan(file, say) {
    if (!file) return null;
    pending = null;
    try {
      if (!(await ensureModel())) { say(t('expenses.rc.no_reader'), true); return null; }
      const settings = await g.SlopBiz.settings();
      const lines = await readLines(file, (s) => say(s));
      const got = NS.receipt.parse(lines, { currency: settings.currency, dayFirst: !/^en-US$/i.test(settings.locale || '') });
      fill(got, settings);
      const T = g.SlopAITools;
      pending = await T.toDrive(file.name || 'Receipt.jpg', file, 'expenses', { kind: 'receipt' }).catch(() => null);
      const WORD = { supplier: t('expenses.rc.supplier'), date: t('expenses.rc.date'), total: t('expenses.rc.amount') };
      const missing = ['supplier', 'date', 'total'].filter((k) => !got.found.includes(k)).map((k) => WORD[k]);
      say(got.found.length ? (missing.length ? t('expenses.rc.read_missing', { list: missing.join(', ') }) : t('expenses.rc.read')) : t('expenses.rc.none'), !got.found.length);
      return got;
    } catch (e) {
      say(t('expenses.rc.failed', { why: (e && e.message) || e }), true);
      return null;
    }
  }

  /** The receipt photo comes in one way (shared/intake, spec 'expenses'): From a receipt… (the intake's picker) and a
   *  pasted photo while the editor is open. */
  function mount(say) {
    g.SlopIntake.register({
      id: 'expenses', limit: 1, toast: false, accept: { types: ['image/*'], noun: 'expenses.rc.noun' },
      gate: () => !$('view-edit').hidden,
      process: async (f) => { await scan(f, say); return f.name; },
    });
    $('eReceipt').addEventListener('click', () => g.SlopIntake.pick({ to: 'expenses', multiple: false, accept: 'image/*' }));
  }

  /** The photo's Drive id for the expense being recorded (the editor clears it once the expense is recorded or replaced). */
  NS.receiptScan = { mount, scan, current: () => pending, clear: () => { pending = null; } };
})(typeof window !== 'undefined' ? window : globalThis);
