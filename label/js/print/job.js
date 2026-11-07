/* SlopLabel — print/job: expands a print request (records, quantities, identical copies, sheet start
 * position) into concrete labels with resolved variables, and places them on pages. */
'use strict';

/** opts: { records: 'all'|'current'|'range'|'only', only (0-based indexes, for 'only'), from, to (1-based), current (0-based), qty (labels when no data),
 *  copies (identical copies), qtyCol, prompts, now, counterBase } → { labels:[{get, record, serial, copy}], warnings } */
function buildJob(doc, opts = {}) {
  const n = recordCount(doc);
  const copies = Math.max(1, Math.min(10000, opts.copies | 0 || 1));
  const labels = [], warnings = [];
  const now = opts.now || new Date();
  let recIdx = [];
  if (!n) recIdx = [-1];
  else if (opts.records === 'current') recIdx = [clamp(opts.current | 0, 0, n - 1)];
  else if (opts.records === 'only') recIdx = (opts.only || []).filter((i) => i >= 0 && i < n);
  else if (opts.records === 'range') { const a = clamp((opts.from | 0 || 1) - 1, 0, n - 1), b = clamp((opts.to | 0 || n) - 1, a, n - 1); for (let i = a; i <= b; i++) recIdx.push(i); }
  else for (let i = 0; i < n; i++) recIdx.push(i);
  const qtyCol = opts.qtyCol != null ? opts.qtyCol : doc.data && doc.data.qtyCol;
  let serial = 0;
  for (const r of recIdx) {
    let q = r < 0 ? Math.max(1, opts.qty | 0 || 1) : 1;
    if (r >= 0 && qtyCol) {
      const ci = doc.data.columns.indexOf(qtyCol), raw = ci >= 0 ? doc.data.rows[r][ci] : '';
      const v = parseInt(raw, 10);
      if (!(v >= 0)) { warnings.push(LT('label.print.qty_nan', { n: r + 1, raw: String(raw) })); q = 1; } else q = v;
    } else if (r >= 0 && opts.qty > 1) q = opts.qty | 0;
    for (let k = 0; k < q; k++) {
      const get = makeResolver(doc, { record: r >= 0 ? recordAt(doc, r) : {}, recordIndex: Math.max(0, r), index: serial, prompts: opts.prompts || {}, now, counterBase: opts.counterBase });
      for (let c = 0; c < copies; c++) labels.push({ get, record: r, serial, copy: c });
      serial++;
    }
  }
  if (labels.length > 20000) throw new Error(`That is ${labels.length} labels — the limit per job is 20,000`);
  return { labels, warnings, serials: serial };
}
/** Place n labels on pages. start = number of slots to skip on the first sheet (used labels). */
function layoutPages(doc, n, start = 0) {
  const st = stockOf(doc), slots = sheetPositions(st), per = slots.length;
  const pages = [];
  let k = st.kind === 'sheet' ? clamp(start | 0, 0, per - 1) : 0;
  let page = null;
  for (let i = 0; i < n; i++) {
    if (!page || k >= per) { page = { slots: [] }; pages.push(page); if (pages.length > 1) k = 0; }
    page.slots.push({ x: slots[k].x, y: slots[k].y, label: i });
    k++;
  }
  return { stock: st, pages };
}
/** Values for counters that remember their last value between print jobs. */
function advanceCounters(doc, serials) {
  for (const v of doc.vars) if (v.type === 'counter' && v.remember) v.start = (+v.start || 0) + (+v.step || 1) * Math.ceil(serials / Math.max(1, +v.every || 1));
}
/** Design-time values: current record, prompt defaults, first counter value. */
function previewResolver(doc, recIndex = 0, prompts = {}) {
  const n = recordCount(doc);
  return makeResolver(doc, { record: n ? recordAt(doc, clamp(recIndex, 0, n - 1)) : {}, recordIndex: recIndex, index: 0, prompts });
}
