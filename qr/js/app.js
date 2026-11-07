/* QR SLOP: the page. Wires the header, the tabs, the panels, the preview and the exports to the state in state.js.
 * Exposes window.QRApp, which the batch view, the commands and the tests use. Classic script. */
(function () {
  'use strict';
  if (window.QRApp) return;
  const $ = (id) => document.getElementById(id);
  const toast = (m) => window.SlopUI.toast(m);
  const Q = () => window.QRState;
  const S = () => window.QRState.S;
  const TABS = ['templates', 'content', 'design', 'logo', 'raw', 'batch'];
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const TAB_KEYS = { templates: 'qr.app.tab_templates', content: 'qr.app.tab_content', design: 'qr.app.tab_design', logo: 'qr.app.tab_logo', raw: 'qr.app.tab_raw', batch: 'qr.app.tab_batch' };
  const tabName = (k) => t(TAB_KEYS[k]);

  let last = null;      // { text, svg } for the code on screen, or null
  let touched = false;  // after the first edit, errors show; before it the form only says what to do
  let dirty = false;    // changed since the last save or open
  let tab = 'content', tabs = null;
  let barKey = '';
  let bar = null;

  const opts = () => Q().renderOpts();
  const px = () => opts().size;
  const base = () => window.QRSave.baseName(S());

  /** The header's actions and the ⋯ menu. They follow whether there is a code to act on. */
  function actions() {
    const has = !!last;
    return [
      { id: 'save', label: t('qr.app.save_drive'), icon: 'save', primary: true, disabled: !has, onClick: saveDrive },
      { id: 'open', label: t('qr.app.open_drive'), icon: 'open', onClick: openDrive },
      { id: 'buffer', label: t('qr.app.buffer'), icon: 'copy', disabled: !has, onClick: toBuffer },
    ];
  }
  function menu() {
    const has = !!last;
    return [
      { id: 'dl-svg', label: t('qr.app.dl_svg'), icon: 'download', disabled: !has, onClick: downloadSvg },
      { id: 'dl-png', label: t('qr.app.dl_png'), icon: 'download', disabled: !has, onClick: downloadPng },
      { id: 'dl-pdf', label: t('qr.app.dl_pdf'), icon: 'print', disabled: !has, onClick: downloadPdf },
      { separator: true },
      { id: 'cmd', label: t('qr.app.commands'), onClick: () => { if (window.SlopCmd && SlopCmd.open) SlopCmd.open(); } },
    ];
  }
  function syncBar() {
    if (!bar) return;
    bar.setDirty(dirty);
    const key = (last ? '1' : '0');
    if (key === barKey) return;
    barKey = key;
    bar.setActions(actions());
    bar.setMenu(menu());
  }

  function meta(text) {
    // numbers as strings: a pixel size and a byte count read best without grouping (1024 px)
    const v = { px: String(px()), ec: opts().ec, bytes: String(window.QRPayload.byteLength(text)), pct: S().logo.href ? String(Math.round(opts().logo.frac * 100)) : '' };
    return t(S().logo.href ? 'qr.app.meta_logo' : 'qr.app.meta', v);
  }

  /** Redraws the preview, the message, the buttons and the header from the state. Cheap enough to run on every key. */
  function refresh() {
    const r = Q().encodedText();
    let err = r.ok || !touched ? '' : r.error;
    let svg = null;
    last = null;
    if (r.ok) {
      try { svg = window.QRExport.svgFor(r.text, opts()); last = { text: r.text, svg }; }
      catch (e) { err = e.message; }
    }
    window.QRPreview.show(svg);
    if (svg) window.QRPreview.prepare(svg, px());
    $('qr-off').hidden = !!svg || !!err;
    $('qr-err').textContent = err;
    $('qr-meta').textContent = svg ? meta(r.text) : '';
    for (const id of ['qr-dl-svg', 'qr-dl-png', 'qr-dl-pdf', 'qr-copy']) $(id).disabled = !last;
    syncBar();
    return last;
  }
  /** An edit: the form, raw text, design or logo changed. */
  function edit() { touched = true; dirty = true; refresh(); }

  /* ---------- tabs and panels ---------- */
  function setTab(k) {
    if (!TABS.includes(k)) return;
    tab = k;
    tabs.show(k);   // SlopTabs (shared/ui/tabs.js): the panel, the selected tab and the arrow keys
    drawTab(k);
  }
  function drawTab(k = tab) {
    if (k === 'content') drawContent();
    else if (k === 'design') window.QRPanelDesign.drawDesign($('qr-design'), S().style, designChange);
    else if (k === 'logo') window.QRPanelDesign.drawLogo($('qr-logo'), S().logo, logoActs);
    else if (k === 'raw') drawRaw();
    else if (k === 'batch' && window.QRBatch) window.QRBatch.refresh();
  }
  function drawContent() {
    $('qr-name').value = S().label;
    window.QRPanelContent.drawKinds($('qr-kinds'), S().kind, (k) => { Q().setKind(k); drawContent(); edit(); });
    window.QRPanelContent.drawForm($('qr-form'), S().kind, Q().vals(), (k, v) => { Q().setValue(k, v); edit(); });
  }
  function drawRaw() {
    const r = Q().encodedText();
    const typed = S().raw !== null;
    if (!typed) $('qr-raw').value = r.ok ? r.text : '';
    $('qr-raw-note').textContent = typed
      ? t('qr.app.raw_typed')
      : t('qr.app.raw_built');
    $('qr-raw-reset').disabled = !typed;
  }
  function designChange(k, v) { S().style[k] = v; edit(); }
  const logoActs = {
    async file(f) {
      try { S().logo.href = await window.QRLogo.fromFile(f); S().logo.name = f.name; S().logo.mark = ''; logoDone(); }
      catch (e) { toast(e.message); }
    },
    async mark(id) {
      try { S().logo.href = await window.QRLogo.fromMark(id); S().logo.mark = id; S().logo.name = ''; logoDone(); }
      catch (e) { toast(e.message); }
    },
    remove() { S().logo.href = null; S().logo.name = ''; S().logo.mark = ''; logoDone(); },
    width(f) { S().logo.frac = window.QRRender.clampLogo(f); edit(); },
  };
  // The logo is the page's one way in for files (shared/intake, spec 'qr'): the logo tab's box (a click or a drop) and a
  // pasted picture.
  window.SlopIntake.register({ id: 'qr', limit: 1, accept: { types: ['image/*'], exts: ['.svg'], noun: 'qr.app.noun_picture' }, process: async (f) => { await logoActs.file(f); return f.name; } });
  function logoDone() { edit(); drawTab('logo'); }

  function applyTemplate(id) {
    const tpl = window.QRTemplates.get(id);
    if (!tpl || !Q().applyTemplate(id)) return;
    const name = window.QRPanelContent.templateName(id);
    Q().setLabel(name);
    touched = true; dirty = true;
    setTab('content');
    refresh();
    toast(t('qr.app.filled', { name }));
  }

  /* ---------- exports ---------- */
  function downloadSvg() { if (last) window.SlopUI.download(new Blob([last.svg], { type: 'image/svg+xml' }), base() + '.svg'); }
  async function downloadPng() {
    if (!last) return;
    try { window.SlopUI.download(await window.QRPreview.pngFor(last.svg, px()), base() + '.png'); }
    catch (e) { toast(e.message); }
  }
  async function downloadPdf() {
    if (!last) return;
    try {
      const png = await window.QRPreview.pngFor(last.svg, px());
      const pdf = await window.QRExport.toPdf(png, { title: S().label || 'QR code', line: last.text }); // i18n-ignore: the title stamped into the user's PDF
      window.SlopUI.download(pdf, base() + '-print.pdf');
    } catch (e) { toast(t('qr.app.pdf_failed', { error: e.message })); }
  }
  async function copyText() {
    if (!last) return;
    try { await navigator.clipboard.writeText(last.text); toast(t('qr.app.copied_text')); }
    catch (e) { toast(t('qr.app.copy_failed')); }
  }

  /* ---------- Slop Drive and the buffer ---------- */
  async function saveDrive() {
    if (!last) return;
    try {
      const folder = await window.QRSave.chooseFolder();
      if (folder === undefined) return;
      const png = await window.QRPreview.pngFor(last.svg, px());
      const name = base();
      await window.QRSave.saveTo(folder, png, Q().snapshot(), name);
      dirty = false; syncBar();
      toast(t('qr.app.saved_drive', { name }));
    } catch (e) { toast(t('qr.app.save_failed', { error: e.message })); }
  }
  async function openDrive() {
    try {
      const r = await window.QRSave.openPicked();
      if (!r) return;
      if (!r.snapshot || !Q().restore(r.snapshot)) { toast(t('qr.app.no_settings')); return; }
      touched = true; dirty = false;
      redrawAll();
      toast(t('qr.app.opened', { name: r.name }));
    } catch (e) { toast(t('qr.app.open_failed', { error: e.message })); }
  }
  function redrawAll() {
    $('qr-name').value = S().label;
    drawTab(tab);
    refresh();
  }
  async function toBuffer() {
    if (!last) return;
    try {
      await window.QRSave.toBuffer(await window.QRPreview.pngFor(last.svg, px()));
      toast(t('qr.app.buffered'));
    } catch (e) { toast(t('qr.app.buffer_failed', { error: e.message })); }
  }

  /** Batch cards: the same options, one code per text. */
  function svgFor(text) { return window.QRExport.svgFor(text, opts()); }
  function saveSvg(svg, name) { window.SlopUI.download(new Blob([svg], { type: 'image/svg+xml' }), 'qr-' + name + '.svg'); }
  async function savePng(svg, name) {
    try { window.SlopUI.download(await window.QRExport.toPng(svg, px()), 'qr-' + name + '.png'); }
    catch (e) { toast(e.message); }
  }

  function init() {
    bar = window.SlopAppBar.mount($('qr-bar'), {
      home: '../', title: 'QR SLOP', subtitle: t('qr.app.subtitle'), actions: [], menu: [],
    });
    window.QRPreview.init();
    drawWords();
    tabs = window.SlopTabs.mount($('qr-tabs'), { select: setTab, panel: (k) => $('qr-panel-' + k) });
    $('qr-name').addEventListener('input', () => { Q().setLabel($('qr-name').value); dirty = true; syncBar(); });
    $('qr-raw').addEventListener('input', () => { Q().setRaw($('qr-raw').value); edit(); drawRaw(); });
    $('qr-raw-reset').addEventListener('click', () => { Q().clearRaw(); drawRaw(); edit(); });
    $('qr-dl-svg').addEventListener('click', downloadSvg);
    $('qr-dl-png').addEventListener('click', downloadPng);
    $('qr-dl-pdf').addEventListener('click', downloadPdf);
    $('qr-copy').addEventListener('click', copyText);
    const preset = Q().presetOf(location.search);
    if (preset.kind) Q().setKind(preset.kind);
    setTab(preset.tab || tab);
    refresh();
    // a language change: the words drawn by script again (the marked HTML follows by itself); the code is kept
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { bar.setSubtitle(t('qr.app.subtitle')); barKey = ''; drawWords(); drawTab(tab); refresh(); });
  }
  /** The tab names and the template gallery, in the current language. */
  function drawWords() {
    window.QRPanelContent.drawTemplates($('qr-templates'), applyTemplate);
    for (const k of TABS) $('qr-tab-' + k).textContent = tabName(k);
  }

  window.QRApp = {
    init, refresh, edit, setTab, tabName, tab: () => tab, last: () => last, state: S, svgFor, saveSvg, savePng,
    downloadSvg, downloadPng, downloadPdf, copyText, toBuffer, saveDrive, openDrive, applyTemplate, redrawAll,
  };
})();
