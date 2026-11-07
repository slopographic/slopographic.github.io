/* SlopLabel — ui/bulkprint: Print all / Print selected. One label per data record (the quantity column is
 * not used here), on the label stock or on a custom grid of labels per sheet (across × down, with gaps and a
 * margin). Printed through the same print page as the single-label print (printHTML + printViaIframe). */
'use strict';

const BULK = { picked: new Set(), layout: 'stock', paper: 'a4', cols: 3, rows: 10, gapX: 2.5, gapY: 0, margin: 5 };
const BULK_PAPER = { a4: ['A4 (210 × 297 mm)', 210, 297], letter: ['US Letter (215.9 × 279.4 mm)', 215.9, 279.4] };

/** The page the grid lays out on (a sheet stock for layoutPages). */
function bulkStock(d, g) {
  const L = d.label, [, pageW, pageH] = BULK_PAPER[g.paper];
  return { kind: 'sheet', id: 'bulk-grid', name: LT('label.bulk.custom_grid'), pageW, pageH, cols: g.cols, rows: g.rows, left: g.margin, top: g.margin, hpitch: L.w + g.gapX, vpitch: L.h + g.gapY, w: L.w, h: L.h };
}
/** The document to print: the label as designed, or the same label on the custom grid. */
function bulkDoc(d, g) { return g.layout === 'grid' ? Object.assign({}, d, { stock: bulkStock(d, g) }) : d; }
/** A message when the grid cannot hold the labels, or ''. */
function bulkProblem(d, g) {
  if (g.layout !== 'grid') return '';
  const L = d.label, [, pageW, pageH] = BULK_PAPER[g.paper];
  const needW = g.margin + g.cols * L.w + (g.cols - 1) * g.gapX, needH = g.margin + g.rows * L.h + (g.rows - 1) * g.gapY;
  if (needW > pageW || needH > pageH) return LT('label.bulk.no_fit', { grid: g.cols + ' × ' + g.rows, size: num(L.w, 1) + ' × ' + num(L.h, 1), paper: BULK_PAPER[g.paper][0] });
  return '';
}

/** Print every record (selectedOnly false) or the ticked records (true). Asks for prompt values first. */
async function bulkPrint(selectedOnly) {
  const d = App.doc, n = recordCount(d);
  if (!n) { SlopUI.toast(LT('label.bulk.import_data_first')); return; }
  const picks = [...BULK.picked].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  if (selectedOnly && !picks.length) { SlopUI.toast(LT('label.bulk.tick_the_records_to_print')); return; }
  const prompts = await promptValuesDialog(); if (!prompts) return;
  await preloadImages(d);
  openBulkDialog({ selectedOnly, picks: selectedOnly ? picks : null, n, prompts });
}

function openBulkDialog(ctx) {
  const d = App.doc, S = { page: 0 };
  const layout = dSel([['stock', LT('label.bulk.label_stock_layout') + (d.stock && d.stock.kind === 'sheet' ? ' (' + d.stock.name + ')' : ' (one label per page)')], ['grid', LT('label.bulk.custom_grid_on_a_sheet')]], BULK.layout);
  const paper = dSel(Object.entries(BULK_PAPER).map(([k, v]) => [k, v[0]]), BULK.paper);
  const cols = dInp(BULK.cols, 'number', { min: 1, max: 50, step: 1 }), rows = dInp(BULK.rows, 'number', { min: 1, max: 100, step: 1 });
  const gapX = dInp(BULK.gapX, 'number', { min: 0, step: 'any' }), gapY = dInp(BULK.gapY, 'number', { min: 0, step: 'any' }), margin = dInp(BULK.margin, 'number', { min: 0, step: 'any' });
  const prev = mk('div', { class: 'pd-canvas' }), pageInfo = mk('span', { class: 'mono' }), info = mk('p', { class: 'hint' }), msgs = mk('div');
  const prevBtn = fBtn('‹', () => { S.page--; update(); }, { cls: 'ghost' }), nextBtn = fBtn('›', () => { S.page++; update(); }, { cls: 'ghost' });
  const grab = () => {
    Object.assign(BULK, { layout: layout.value, paper: paper.value, cols: Math.max(1, Math.floor(+cols.value) || 1), rows: Math.max(1, Math.floor(+rows.value) || 1), gapX: Math.max(0, +gapX.value || 0), gapY: Math.max(0, +gapY.value || 0), margin: Math.max(0, +margin.value || 0) });
    return { layout: BULK.layout, paper: BULK.paper, cols: BULK.cols, rows: BULK.rows, gapX: BULK.gapX, gapY: BULK.gapY, margin: BULK.margin };
  };
  const jobFor = (g) => jobScenes({ records: ctx.selectedOnly ? 'only' : 'all', only: ctx.picks || [], prompts: ctx.prompts, qtyCol: '', qty: 1, copies: 1, start: 0 }, bulkDoc(d, g));
  function update() {
    const g = grab(), pd = bulkDoc(d, g), problem = bulkProblem(d, g);
    msgs.replaceChildren(problem ? mk('div', { class: 'msg err' }, problem) : null);
    let J;
    try { J = jobFor(g); } catch (e) { msgs.replaceChildren(mk('div', { class: 'msg err' }, e.message)); prev.replaceChildren(); return; }
    const per = slotsPerPage(stockOf(pd)), pages = Math.max(1, Math.ceil(J.scenes.length / per));
    S.page = clamp(S.page, 0, pages - 1);
    if (J.scenes.length) prev.replaceChildren(pagePreviewCanvas(pd, J.scenes, 0, S.page).canvas); else prev.replaceChildren(mk('p', { class: 'hint' }, LT('label.bulk.nothing_to_print')));
    pageInfo.textContent = LT('label.print.page_of', { n: S.page + 1, of: pages });
    prevBtn.disabled = S.page <= 0; nextBtn.disabled = S.page >= pages - 1;
    info.textContent = [LT('label.bulk.labels', { n: J.scenes.length }), LT('label.bulk.per_page', { n: per }), LT('label.bulk.pages', { n: pages })].join(' · ');
    msgs.append(...J.errors.slice(0, 3).map((e) => mk('div', { class: 'msg err' }, e)));
  }
  const print = async () => {
    const g = grab();
    if (bulkProblem(d, g)) { SlopUI.toast(LT('label.bulk.the_labels_do_not_fit')); return false; }
    const J = jobFor(g);
    if (!J.scenes.length) { SlopUI.toast(LT('label.bulk.nothing_to_print_2')); return false; }
    if (J.errors.length && !(await SlopUI.confirm(LT('label.print.some_labels_have_errors'), J.errors[0] + '. Objects with errors are left out. Continue?', LT('label.print.continue')))) return false;
    await printViaIframe(printHTML(bulkDoc(d, g), J.scenes, { start: 0, mode: 'vector', title: d.name }));
    status(LT('label.print.sent', { n: J.scenes.length }), '', 4000);
    return false;
  };
  const body = mk('div', { class: 'pd' },
    mk('div', { class: 'pd-prev' }, prev, mk('div', { class: 'pd-nav' }, prevBtn, pageInfo, nextBtn), info),
    mk('div', { class: 'dlg-form' },
      dRow(LT('label.bulk.layout'), layout), dRow(LT('label.bulk.paper'), paper),
      dRow(LT('label.bulk.labels_across_down'), cols, rows), dRow(LT('label.bulk.gap_across_down_mm'), gapX, gapY), dRow(LT('label.bulk.margin_mm'), margin),
      msgs,
      mk('p', { class: 'hint' }, LT('label.bulk.browser_printing_set_the_scale'))));
  SlopFormReset.snapshot(body);
  body.addEventListener('input', () => { S.page = 0; update(); }); body.addEventListener('change', () => { S.page = 0; update(); });
  update();
  SlopUI.dialog({ title: ctx.selectedOnly ? LT('label.bulk.print_sel', { n: ctx.picks.length }) : LT('label.bulk.print_all', { n: ctx.n }), cls: 'sl-wide', body,
    buttons: [SlopFormReset.dialogButton(body), { label: LT('label.print.close') }, { label: LT('label.cmd.print'), primary: true, act: print }] });
}
