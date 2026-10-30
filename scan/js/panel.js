/* Slop Scan: the right panel (shared/frame/panel.js, the suite's rule; a bottom sheet on phones whose foot always shows).
 * The page shown: its look (five styles), brightness and contrast, Apply to all pages. The PDF: its name, the page size
 * (Auto, A4, Letter), the margins, the JPEG quality with the size to expect, turning pages upright by themselves, and
 * searchable text (OCR). At its foot: Download PDF (the main button), Open in Slop PDF, Save pages as pictures, Open in…
 * (with Save to Slop Drive). Classic script; window.SlopScan.panel: mount(el), paint(), redraw(). */
(function (g) {
  'use strict';
  const S = g.SlopScan, F = () => S.filters, P = () => S.page;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  let side = null, parts = null, busy = null, estTimer = 0, estSeq = 0;

  function field(label, control, note) {
    const l = el('label', { class: 'sf-field' }, el('span', { class: 'sf-lab' }, label), control);
    if (note) l.append(note);
    return l;
  }
  function check(id, label) { const i = el('input', { type: 'checkbox', id }); return el('label', { class: 'sc-check' }, i, el('span', {}, label)); }
  function options(sel, list) { const v = sel.value; sel.replaceChildren(...list.map(([id, txt]) => el('option', { value: id }, txt))); if (v) sel.value = v; }
  function build() {
    if (!parts) {
      parts = {
        styles: el('div', { class: 'sf-seg sc-styles', role: 'group', id: 'sc-styles' }),
        bright: el('input', { type: 'range', id: 'sc-bright', min: '-100', max: '100', step: '1' }),
        contrast: el('input', { type: 'range', id: 'sc-contrast', min: '-100', max: '100', step: '1' }),
        reset: el('button', { type: 'button', class: 'sui-btn', id: 'sc-reset' }), all: el('button', { type: 'button', class: 'sui-btn', id: 'sc-apply-all' }),
        name: el('input', { type: 'text', id: 'sc-name', maxlength: '120', autocomplete: 'off' }),
        size: el('select', { id: 'sc-size' }), margin: el('select', { id: 'sc-margin' }),
        quality: el('input', { type: 'range', id: 'sc-quality', min: '30', max: '95', step: '5' }),
        qval: el('span', { class: 'sc-val', id: 'sc-quality-val' }), est: el('p', { class: 'sf-note', id: 'sc-estimate', 'aria-live': 'polite' }),
        auto: check('sc-autoturn', ''), ocr: check('sc-ocr', ''), lang: el('button', { type: 'button', class: 'sui-btn', id: 'sc-ocr-lang' }),
      };
      parts.styles.append(...F().STYLES.map((s) => el('button', { type: 'button', class: 'sui-btn', id: 'sc-style-' + s, 'data-style': s, 'aria-pressed': 'false' })));
      wire();
    }
    const X = parts;
    X.styles.setAttribute('aria-label', t('scan.panel.style'));
    for (const b of X.styles.children) b.textContent = t('scan.style.' + b.dataset.style);
    X.reset.textContent = t('scan.panel.reset'); X.all.textContent = t('scan.panel.apply_all');
    X.auto.lastChild.textContent = t('scan.panel.auto_turn'); X.ocr.lastChild.textContent = t('scan.panel.ocr');
    X.lang.textContent = t('scan.panel.ocr_lang');
    X.name.placeholder = P().fileName('').replace(/\.pdf$/, '');
    options(X.size, [['auto', t('scan.panel.size_auto')], ['a4', 'A4'], ['letter', 'Letter']]);
    options(X.margin, Object.keys(P().MARGINS).map((m) => [m, t('scan.panel.margin_' + m)]));
    return [
      { title: t('scan.panel.page'), key: 'page', settings: [X.styles, field(t('scan.panel.brightness'), X.bright), field(t('scan.panel.contrast'), X.contrast), el('div', { class: 'sc-btns' }, X.reset, X.all)] },
      { title: t('scan.panel.pdf'), key: 'pdf', settings: [field(t('scan.panel.name'), X.name), field(t('scan.panel.size'), X.size), field(t('scan.panel.margin'), X.margin),
        field(el('span', {}, t('scan.panel.quality') + ' ', X.qval), X.quality, X.est), X.auto, X.ocr, X.lang] },
    ];
  }
  function cur() { return S.pages.current(); }
  function wire() {
    const X = parts, L = S.pages;
    X.styles.addEventListener('click', (e) => { const b = e.target.closest('[data-style]'); if (b && cur()) L.set(cur().id, { style: b.dataset.style }); });
    let slide = 0;
    const look = () => { clearTimeout(slide); slide = setTimeout(() => { if (cur()) L.set(cur().id, { brightness: X.bright.value, contrast: X.contrast.value }); }, 120); };
    X.bright.addEventListener('input', look); X.contrast.addEventListener('input', look);
    X.reset.addEventListener('click', () => { if (cur()) L.set(cur().id, { brightness: 0, contrast: 0 }); });
    X.all.addEventListener('click', () => { if (!cur()) return; const n = L.applyAll(cur().id); g.SlopUI.toast(t('scan.panel.applied', { n })); });
    X.name.addEventListener('input', () => L.setDoc({ name: X.name.value }));
    X.size.addEventListener('change', () => L.setDoc({ size: X.size.value }));
    X.margin.addEventListener('change', () => L.setDoc({ margin: X.margin.value }));
    X.quality.addEventListener('input', () => { X.qval.textContent = X.quality.value + '%'; L.setDoc({ quality: X.quality.value / 100 }); });
    X.auto.firstChild.addEventListener('change', () => L.setDoc({ autoTurn: X.auto.firstChild.checked }));
    X.ocr.firstChild.addEventListener('change', () => L.setDoc({ ocr: X.ocr.firstChild.checked }));
    X.lang.addEventListener('click', () => S.ocr.choose().catch((e) => g.SlopUI.toast(e.message)));
  }
  /** The controls from the state, except the one being typed in; then the foot. */
  function paint() {
    if (!parts) return;
    const X = parts, p = cur(), d = S.pages.doc;
    for (const b of X.styles.children) { b.setAttribute('aria-pressed', String(!!p && p.style === b.dataset.style)); b.disabled = !p; }
    for (const n of [X.bright, X.contrast, X.reset, X.all]) n.disabled = !p;
    if (p && document.activeElement !== X.bright) X.bright.value = p.brightness;
    if (p && document.activeElement !== X.contrast) X.contrast.value = p.contrast;
    X.all.disabled = !p || S.pages.size() < 2;
    if (document.activeElement !== X.name) X.name.value = d.name;
    X.size.value = d.size; X.margin.value = d.margin;
    X.quality.value = Math.round(d.quality * 100); X.qval.textContent = X.quality.value + '%';
    X.auto.firstChild.checked = d.autoTurn !== false; X.ocr.firstChild.checked = !!d.ocr; X.lang.hidden = !d.ocr;
    footer();
    estimate();
  }
  /** The size to expect, worked out a moment after the last change (it encodes each page's preview). */
  function estimate() {
    clearTimeout(estTimer);
    const n = S.pages.size(), me = ++estSeq;
    if (!n) { parts.est.textContent = ''; return; }
    parts.est.textContent = t('scan.panel.estimating');
    estTimer = setTimeout(() => S.io.estimate().then((b) => { if (me === estSeq) parts.est.textContent = t('scan.panel.estimate', { size: g.SlopHub ? g.SlopHub.fmtSize(b) : Math.round(b / 1024) + ' KB' }); }).catch(() => {}), 400);
  }
  /** Runs one of the outputs with the foot showing its progress; one at a time. */
  async function run(what, pdf) {
    if (busy) return;
    const say = (i, n, step) => { busy = step === 'save' ? t('scan.run.saving') : step === 'ocr' ? t('scan.run.reading', { n: i + 1, total: n }) : t('scan.run.page', { n: i + 1, total: n }); footer(); };
    busy = t('scan.run.starting'); footer();
    try {
      if (pdf && S.pages.doc.ocr) await S.ocr.ready();
      return await what(say);
    } catch (e) {
      if (!e.needsModel) console.error(e);
      g.SlopUI.toast(e.needsModel ? t('scan.ocr.model_missing') : t('scan.run.failed', { msg: e.message }));
      return null;
    } finally { busy = null; footer(); }
  }
  /** The outputs besides Download PDF: Slop PDF, the pictures, then every app that opens a PDF and Save to Slop Drive. */
  function more(IO) {
    return [
      { label: t('scan.panel.to_pdf', { app: g.slopAppName ? g.slopAppName('pdf') : 'Slop PDF' }), act: () => run((say) => IO.toPdfEditor(say), true) },
      { label: t('scan.panel.jpg_all'), act: () => run(() => IO.downloadImages('image/jpeg')) },
      { label: t('scan.panel.png_all'), act: () => run(() => IO.downloadImages('image/png')) },
      { label: t('scan.panel.jpg_one'), act: () => run(() => IO.downloadImages('image/jpeg', cur())) },
      { heading: t('scan.panel.open_in') },
      ...IO.openInItems(),
    ];
  }
  /** The foot: on a wide screen every output as a button; on a phone (the sheet's foot stays on screen) only Download
   *  PDF and More, so the page keeps the room. */
  function footer() {
    if (!side) return;
    const IO = S.io, n = S.pages.size(), none = !n || !!busy, fr = S.app && S.app.frame(), phone = !!(fr && fr.isPhone());
    const make = { id: 'sc-make', label: n && !phone ? t('scan.panel.make', { n }) : t('scan.panel.make_none'), primary: true, disabled: none, run: () => run((say) => IO.downloadPdf(say), true) };
    const acts = phone ? [make, { id: 'sc-more', label: t('scan.panel.more'), disabled: none, menu: () => more(IO) }] : [make,
      { id: 'sc-to-pdf', label: t('scan.panel.to_pdf', { app: g.slopAppName ? g.slopAppName('pdf') : 'Slop PDF' }), disabled: none, run: () => run((say) => IO.toPdfEditor(say), true) },
      { id: 'sc-images', label: t('scan.panel.images'), disabled: none, menu: () => more(IO).slice(1, 4) },
      { id: 'sc-openin', label: t('scan.panel.open_in'), disabled: none, menu: () => IO.openInItems() }];
    side.footer(acts, { stack: !phone, more: t('ui.settings'), note: busy || (n ? t('scan.panel.count', { n }) : t('scan.panel.empty')) });
  }
  function mount(panelEl) {
    side = g.SlopFrame.panel(panelEl, { title: t('ui.settings') });
    side.render(build());
    return side;
  }
  function redraw() { if (!side) return; side.setTitle(t('ui.settings')); side.render(build()); paint(); }
  S.panel = { mount, paint, redraw, run, footer, parts: () => parts };
})(window);
