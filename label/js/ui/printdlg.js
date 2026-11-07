/* SlopLabel — ui/printdlg: prompt values, the print dialog (records, quantity, copies, sheet start
 * position, page preview) and every output: browser print, PDF, ZPL, EPL, TSPL, PNG, ZPL preview. */
'use strict';

/** Ask for prompt variables. Resolves with the answers, or null when cancelled. */
function promptValuesDialog(doc = App.doc) {
  const ps = doc.vars.filter((v) => v.type === 'prompt');
  if (!ps.length) return Promise.resolve({});
  const inputs = {};
  const body = mk('div', { class: 'dlg-form' }, mk('p', { class: 'sui-p' }, LT('label.print.values_for_this_print_job')), ...ps.map((v) => {
    inputs[v.name] = dInp(App.prompts[v.name] != null ? App.prompts[v.name] : v.def, 'text', { placeholder: v.pattern ? LT('label.print.format', { p: v.pattern }) : '', maxlength: v.maxLen || null });
    return dRow(v.prompt || v.name, inputs[v.name]);
  }));
  SlopFormReset.snapshot(body);
  return new Promise((res) => {
    let out = null;
    SlopUI.dialog({ title: LT('label.print.print_values'), body, onClose: () => res(out), buttons: [{ label: LT('label.dlg.cancel') }, SlopFormReset.dialogButton(body), { label: LT('label.print.continue'), primary: true, act: () => {
      const vals = {}; for (const k in inputs) vals[k] = inputs[k].value;
      const errs = checkPrompts(doc, vals);
      if (errs.length) { SlopUI.toast(errs[0]); return false; }
      out = vals; Object.assign(App.prompts, vals);
    } }] });
  });
}
/** Draw page `pi` of a job (sheet with every slot, or one roll label) to a canvas about `maxPx` wide. */
function pagePreviewCanvas(doc, scenes, start, pi, maxPx = 520) {
  const { stock, pages } = layoutPages(doc, scenes.length, start), pg = pages[pi] || { slots: [] };
  const k = Math.min(maxPx / stock.pageW, (maxPx * 1.3) / stock.pageH, 12), dpr = Math.min(2, devicePixelRatio || 1);
  const c = document.createElement('canvas'); c.width = Math.round(stock.pageW * k * dpr); c.height = Math.round(stock.pageH * k * dpr);
  c.style.width = Math.round(stock.pageW * k) + 'px';
  const g = c.getContext('2d'); g.scale(k * dpr, k * dpr);
  g.fillStyle = '#fff'; g.fillRect(0, 0, stock.pageW, stock.pageH);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.25; g.setLineDash([1, 1]);
  for (const s of sheetPositions(stock)) { g.beginPath(); g.roundRect(s.x, s.y, doc.label.w, doc.label.h, doc.label.radius || 0); g.stroke(); }
  g.setLineDash([]);
  for (const s of pg.slots) { g.save(); g.translate(s.x, s.y); g.beginPath(); g.rect(0, 0, doc.label.w, doc.label.h); g.clip(); drawItems(g, scenes[s.label], { doc }); g.restore(); }
  return { canvas: c, pages: pages.length };
}

async function openPrintDialog() {
  const d = App.doc;
  if (!d.objects.length) { SlopUI.toast(LT('label.print.the_label_is_empty')); return; }
  const prompts = await promptValuesDialog(); if (!prompts) return;
  await preloadImages(d);
  const n = recordCount(d), st = stockOf(d), per = st.cols * st.rows;
  const S = { records: 'all', from: 1, to: n, qty: 1, copies: 1, start: 1, mode: 'vector', page: 0 };
  const recSel = dSel([['all', LT('label.print.all_n', { n })], ['current', LT('label.print.current', { n: App.rec + 1 })], ['range', LT('label.print.range')]], 'all');
  const from = dInp(1, 'number', { min: 1, max: n }), to = dInp(n, 'number', { min: 1, max: n });
  const qty = dInp(1, 'number', { min: 1, max: 10000 }), copies = dInp(1, 'number', { min: 1, max: 1000 });
  const start = dInp(1, 'number', { min: 1, max: per }), mode = dSel([['vector', LT('label.print.vector_sharpest')], ['bitmap', LT('label.print.bitmap', { dpi: String(d.dpi) })]], 'vector');
  const prevBox = mk('div', { class: 'pd-canvas' }), pageInfo = mk('span', { class: 'mono' }), summary = mk('div'), msgs = mk('div');
  const prevBtn = fBtn('‹', () => { S.page--; update(); }, { cls: 'ghost' }), nextBtn = fBtn('›', () => { S.page++; update(); }, { cls: 'ghost' });
  const rangeRow = dRow(LT('label.print.from_to'), from, to);
  let J = null;
  const opts = () => ({ records: recSel.value, from: +from.value, to: +to.value, current: App.rec, qty: +qty.value || 1, copies: +copies.value || 1, prompts, start: Math.max(0, (+start.value || 1) - 1) });
  function update() {
    rangeRow.hidden = !n || recSel.value !== 'range';
    try { J = jobScenes(opts()); } catch (e) { msgs.replaceChildren(mk('div', { class: 'msg err' }, e.message)); return; }
    const o = opts(), { canvas, pages } = pagePreviewCanvas(d, J.scenes, o.start, (S.page = clamp(S.page, 0, Math.max(0, Math.ceil((J.scenes.length + (st.kind === 'sheet' ? o.start : 0)) / per) - 1))));
    prevBox.replaceChildren(canvas);
    pageInfo.textContent = LT('label.print.page_of', { n: S.page + 1, of: pages });
    prevBtn.disabled = S.page <= 0; nextBtn.disabled = S.page >= pages - 1;
    summary.textContent = LT(st.kind === 'sheet' ? 'label.print.on_sheets' : 'label.print.on_pages', { labels: LT('label.bulk.labels', { n: J.scenes.length }), n: pages }) + ' · ' + LT('label.print.page_size', { size: num(st.pageW, 1) + ' × ' + num(st.pageH, 1) });
    msgs.replaceChildren(...J.errors.slice(0, 3).map((e) => mk('div', { class: 'msg err' }, e)), ...J.job.warnings.slice(0, 3).map((w) => mk('div', { class: 'msg warn' }, w)));
  }
  const done = (what) => { if (J && d.vars.some((v) => v.type === 'counter' && v.remember)) { advanceCounters(d, J.job.serials); commit(LT('label.print.advance_counters')); } status(what, '', 4000); };
  const run = async (fn) => { if (!J) return; if (J.errors.length && !(await SlopUI.confirm(LT('label.print.some_labels_have_errors'), J.errors[0] + (J.errors.length > 1 ? ` (and ${J.errors.length - 1} more)` : '') + '. Objects with errors are left out. Continue?', LT('label.print.continue')))) return; try { await fn(); } catch (e) { SlopUI.alert(LT('label.print.output_failed'), e.message || String(e)); } };
  const out = {
    print: () => run(async () => { await printViaIframe(printHTML(d, J.scenes, { start: opts().start, mode: mode.value, title: d.name })); done(LT('label.print.sent', { n: J.scenes.length })); }),
    pdf: () => run(async () => { downloadBytes(await buildPDF(d, J.scenes, { start: opts().start, title: d.name }), fileBase() + '.pdf', 'application/pdf'); done(LT('label.print.saved_pdf')); }),
    zpl: () => run(async () => { downloadBytes(buildZPL(d, J.scenes, { keys: J.keys }), fileBase() + '.zpl', 'text/plain'); done(LT('label.print.saved_zpl')); }),
    epl: () => run(async () => { downloadBytes(buildEPL(d, J.scenes), fileBase() + '.epl', 'application/octet-stream'); done(LT('label.print.saved_epl2')); }),
    tspl: () => run(async () => { downloadBytes(buildTSPL(d, J.scenes), fileBase() + '.tspl', 'application/octet-stream'); done(LT('label.print.saved_tspl')); }),
    png: () => run(async () => { const c = renderLabelCanvas(d, J.scenes[0], Math.max(300, d.dpi)); c.toBlob((b) => SlopUI.download(b, fileBase() + '.png'), 'image/png'); SlopSupport.afterExport('label'); }),
    zplView: () => run(async () => zplPreviewDialog(buildZPL(d, J.scenes.slice(0, 50), { keys: J.keys.slice(0, 50) }), d.dpi)),
  };
  const body = mk('div', { class: 'pd' },
    mk('div', { class: 'pd-prev' }, prevBox, mk('div', { class: 'pd-nav' }, prevBtn, pageInfo, nextBtn), summary),
    mk('div', { class: 'dlg-form' },
      n ? dRow(LT('label.print.records'), recSel) : null, n ? rangeRow : null,
      dRow(n ? LT('label.print.labels_per_record') : LT('label.print.quantity'), qty), dRow(LT('label.print.identical_copies'), copies),
      st.kind === 'sheet' ? dRow(LT('label.print.start_at', { per }), start) : null,
      dRow(LT('label.print.browser_print'), mode), msgs,
      mk('div', { class: 'pd-out' }, fBtn(LT('label.cmd.print'), out.print, { cls: 'primary', title: LT('label.print.print_through_the_browser_at') }),
        fBtn('PDF', out.pdf), fBtn('PNG', out.png), fBtn('ZPL (Zebra)', out.zpl), fBtn(LT('label.print.zpl_preview'), out.zplView), fBtn('EPL2', out.epl), fBtn('TSPL (TSC)', out.tspl)),
      mk('p', { class: 'hint' }, LT('label.print.browser_printing_choose_your_label'))));
  body.addEventListener('input', () => { S.page = 0; update(); }); body.addEventListener('change', update);
  qty.disabled = !!(n && d.data.qtyCol);
  if (n && d.data.qtyCol) qty.title = LT('label.print.qty_from', { col: d.data.qtyCol });
  update();
  SlopFormReset.snapshot(body);
  SlopUI.dialog({ title: LT('label.panels.print'), cls: 'sl-wide', body, buttons: [SlopFormReset.dialogButton(body), { label: LT('label.print.close') }] });
}
function zplPreviewDialog(zpl, dpi) {
  const ta = mk('textarea', { class: 'code-view', spellcheck: 'false' }); ta.value = zpl;
  const pic = mk('div', { class: 'pd-canvas' }), info = mk('p', { class: 'hint' });
  const render = async () => {
    try { const c = await zplPreviewCanvas(ta.value, dpi); c.style.maxWidth = '100%'; pic.replaceChildren(c); info.textContent = LT('label.print.first_label_decoded_from_the'); }
    catch (e) { pic.replaceChildren(mk('div', { class: 'msg err' }, e.message)); }
  };
  let t = 0; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 400); });
  render();
  const cols = mk('div', { class: 'dlg-cols' }, mk('div', null, ta), mk('div', null, pic, info));
  SlopFormReset.snapshot(cols);
  SlopUI.dialog({ title: LT('label.print.zpl_preview'), cls: 'sl-wide', body: cols,
    buttons: [SlopFormReset.dialogButton(cols), { label: LT('label.cmd.copy'), act: async () => { try { await navigator.clipboard.writeText(ta.value); SlopUI.toast(LT('label.print.zpl_copied')); } catch (e) { ta.select(); document.execCommand('copy'); } return false; } },
      { label: LT('label.print.download'), act: () => { downloadBytes(ta.value, fileBase() + '.zpl', 'text/plain'); return false; } }, { label: LT('label.print.close'), primary: true }] });
}
