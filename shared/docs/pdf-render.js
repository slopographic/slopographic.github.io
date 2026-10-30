// The PDF export for Slop Orders and Slop Invoices: one A4 document drawn from a doc-view (shared/docs/doc-view.js) in
// the template the view resolved (shared/docs/pdf-layouts.js). Uses the vendored pdf-lib (global PDFLib). The fonts are
// pdf-lib's standard Helvetica and Times (WinAnsi): pdf-lib cannot embed the bundled WOFF2 faces (no fontkit here), so
// characters outside Latin become "?". Lines wrap, long tables run onto more pages with the header repeated, and each
// page has a footer with the company and "Page n of N". Metadata is not stamped, so the same view gives the same bytes.
// Classic script. Exposes window.SlopDocs.pdf.
(function (g) {
  'use strict';
  const NS = (g.SlopDocs = g.SlopDocs || {});
  const PAGE_W = 595.28, PAGE_H = 841.89;   // A4 in points
  const L = 42, R = 553;                    // left and right edges of the body
  const TOP = 790, BOTTOM = 84;             // first baseline and the lowest body line (the footer sits below)
  const SIDE_X = 190;                       // the side bar layout: where the body (table) starts; the column is 130 wide
  const FAMILY = { sans: ['Helvetica', 'HelveticaBold'], serif: ['TimesRoman', 'TimesRomanBold'] };   // i18n-ignore: pdf-lib font names
  const COLS = { wide: { qty: 36, unit: 70, disc: 44, tax: 66, total: 76 }, side: { qty: 30, unit: 58, disc: 38, tax: 54, total: 64 } };

  /** WinAnsi text for pdf-lib: line breaks kept for wrapping by the caller; characters it cannot draw become "?" (the minus sign of sv and others reads as a hyphen). */
  const clean = (t) => String(t ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/\u2212/g, '-').replace(/[  ]/g, ' ')
    .replace(/[^\n\x20-\x7e\xa0-\xff€]/g, '?');
  const oneLine = (t) => clean(t).replace(/\n/g, ' ');

  /** Splits text into lines that fit maxW at this size. Words are kept whole; a word wider than the column is cut. */
  function wrap(font, text, size, maxW) {
    const out = [];
    for (const para of clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const cand = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(cand, size) <= maxW) { line = cand; continue; }
        if (line) out.push(line);
        let w = word;
        while (font.widthOfTextAtSize(w, size) > maxW && w.length > 1) {
          let k = w.length - 1;
          while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > maxW) k -= 1;
          out.push(w.slice(0, k));
          w = w.slice(k);
        }
        line = w;
      }
      out.push(line);
    }
    return out;
  }

  /** Renders a view to PDF bytes: { ok: true, value: Uint8Array } or a refusal { ok: false, code, message }. */
  async function renderPdf(view) {
    const PDFLib = g.PDFLib;
    if (!PDFLib) return { ok: false, code: 'unavailable', message: 'the PDF library did not load' };   // i18n-ignore: a developer message (the app shows its own words)
    const st = view.style;
    const { rgb, StandardFonts } = PDFLib;
    const doc = await PDFLib.PDFDocument.create({ updateMetadata: false });
    doc.setTitle(oneLine(`${view.title} ${view.number}`));
    doc.setProducer('Slopographic');   // i18n-ignore: brand name in the PDF metadata
    doc.setCreator('Slopographic');   // i18n-ignore: brand name in the PDF metadata
    if (view.lang) doc.setLanguage(view.lang);
    const fam = FAMILY[st.family] || FAMILY.sans;
    const f = { reg: await doc.embedFont(StandardFonts[fam[0]]), bold: await doc.embedFont(StandardFonts[fam[1]]) };
    const acc = st.accent.rgb;
    const c = {
      ink: rgb(0.08, 0.08, 0.08), grey: rgb(0.42, 0.42, 0.42), rule: rgb(0.76, 0.76, 0.76), white: rgb(1, 1, 1),
      accent: rgb(acc[0], acc[1], acc[2]),
      tint: st.accent.id === 'ink' ? rgb(0.95, 0.95, 0.95) : rgb(acc[0] * 0.14 + 0.86, acc[1] * 0.14 + 0.86, acc[2] * 0.14 + 0.86),
    };
    const sideBar = st.sidebar;
    const cols = layoutCols(view, sideBar);
    const x0 = sideBar ? SIDE_X : L;
    const ctx = { doc, PDFLib, f, c, st, view, cols, x0, pages: [], page: null, y: TOP, inTable: false };

    /** Starts a page: the side bar tint (sidebar layout) and, inside a table, the repeated header. */
    const newPage = () => {
      ctx.page = doc.addPage([PAGE_W, PAGE_H]);
      ctx.pages.push(ctx.page);
      ctx.y = TOP;
      if (sideBar) ctx.page.drawRectangle({ x: 0, y: 0, width: SIDE_X - 18, height: PAGE_H, color: c.tint });
      if (ctx.inTable) tableHead(ctx);
    };
    /** Makes room for h points of body, starting a page when it does not fit. */
    const ensure = (h) => { if (ctx.y - h < BOTTOM) newPage(); };

    newPage();
    header(ctx);
    if (sideBar) sideColumn(ctx); else billTo(ctx);
    table(ctx, ensure);
    totals(ctx, ensure);
    notes(ctx, ensure);
    footers(ctx);
    return { ok: true, value: await doc.save({ useObjectStreams: false }) };
  }

  /** Column edges: each numeric column's right edge, and the description column's width. */
  function layoutCols(view, sideBar) {
    const x0 = sideBar ? SIDE_X : L;
    const w = sideBar ? COLS.side : COLS.wide;
    const list = [['qty', w.qty], ['unit', w.unit], ...(view.hasDiscount ? [['disc', w.disc]] : []), ['tax', w.tax], ['total', w.total]];
    const out = {};
    let right = R;
    for (let i = list.length - 1; i >= 0; i -= 1) { out[list[i][0]] = { right }; right -= list[i][1]; }
    out.desc = { x: x0, w: right - x0 - 10 };
    return out;
  }

  /** Draws one line of text. align: left or right (at x). */
  function text(ctx, s, x, y, size, o = {}) {
    const t = oneLine(s);
    if (!t) return 0;
    const font = o.bold ? ctx.f.bold : ctx.f.reg;
    const w = font.widthOfTextAtSize(t, size);
    ctx.page.drawText(t, { x: o.align === 'right' ? x - w : x, y, size, font, color: o.color || ctx.c.ink });
    return w;
  }

  const TITLE_SIZE = 22;

  /** The header on page one: company, title, number and dates, in the template's arrangement. */
  function header(ctx) {
    const { st, view, c } = ctx;
    const company = view.company;
    const addr = [...company.lines.slice(0, 4), ...(view.words.taxNumber ? [view.words.taxNumber] : [])];
    const metaRows = [[view.words.number, view.number], ...view.meta.filter((m) => m.value).map((m) => [m.label, m.value])];
    if (st.sidebar) { ctx.y = TOP; return; }
    if (st.header === 'band') {
      const h = 150;
      ctx.page.drawRectangle({ x: 0, y: PAGE_H - h, width: PAGE_W, height: h, color: c.accent });
      text(ctx, company.name, L, PAGE_H - 46, 16, { bold: true, color: c.white });
      addr.forEach((l, i) => text(ctx, l, L, PAGE_H - 64 - i * 12, 9, { color: c.white }));
      text(ctx, view.title.toUpperCase(), L, PAGE_H - 116, 26, { bold: true, color: c.white });
      metaRows.forEach(([k, v], i) => { text(ctx, `${k}  ${v}`, R, PAGE_H - 46 - i * 14, 9.5, { align: 'right', color: c.white }); });
      ctx.y = PAGE_H - h - 26;
      return;
    }
    if (st.titleAlign === 'left') {
      text(ctx, view.title.toUpperCase(), L, TOP, TITLE_SIZE + 2, { color: c.ink });
      metaRows.forEach(([k, v], i) => text(ctx, `${k}  ${v}`, L, TOP - 24 - i * 13, 9, { color: c.grey }));
      text(ctx, company.name, R, TOP, 10, { bold: true, align: 'right' });
      addr.forEach((l, i) => text(ctx, l, R, TOP - 13 - i * 12, 8.5, { align: 'right', color: c.grey }));
      ctx.y = TOP - 24 - metaRows.length * 13 - 22;
    } else {
      text(ctx, company.name, L, TOP, 15, { bold: true, color: c.accent });
      addr.forEach((l, i) => text(ctx, l, L, TOP - 16 - i * 12, 9, { color: c.grey }));
      text(ctx, view.title.toUpperCase(), R, TOP, TITLE_SIZE, { bold: true, color: c.accent, align: 'right' });
      metaRows.forEach(([k, v], i) => text(ctx, `${k}  ${v}`, R, TOP - 24 - i * 13, 9.5, { align: 'right' }));
      const low = Math.min(TOP - 16 - Math.max(0, addr.length) * 12, TOP - 24 - metaRows.length * 13);
      ctx.y = low - 14;
      if (st.header === 'rule') {
        ctx.page.drawLine({ start: { x: L, y: ctx.y }, end: { x: R, y: ctx.y }, thickness: 1, color: c.ink });
        ctx.y -= 18;
      }
    }
  }

  /** The bill-to block under the header (layouts without a side bar). */
  function billTo(ctx) {
    const b = ctx.view.bill, c = ctx.c;
    ctx.y -= 10;
    text(ctx, b.title.toUpperCase(), L, ctx.y, 7.5, { bold: true, color: c.grey });
    ctx.y -= 14;
    text(ctx, b.name || ctx.view.words.noCustomer, L, ctx.y, 11, { bold: true });
    ctx.y -= 13;
    for (const l of b.lines.slice(0, 4)) { text(ctx, l, L, ctx.y, 9, { color: c.grey }); ctx.y -= 12; }
    ctx.y -= 18;
  }

  /** The side bar on page one: company, bill-to, and the number and dates, in the left column; the title is on the right. */
  function sideColumn(ctx) {
    const { view, c } = ctx;
    let y = TOP;
    text(ctx, view.company.name, L, y, 12, { bold: true, color: c.accent });
    y -= 14;
    for (const l of view.company.lines.slice(0, 4)) { text(ctx, l, L, y, 8.5, { color: c.grey }); y -= 11; }
    if (view.words.taxNumber) { text(ctx, view.words.taxNumber, L, y, 8, { color: c.grey }); y -= 11; }
    y -= 14;
    text(ctx, view.bill.title.toUpperCase(), L, y, 7.5, { bold: true, color: c.grey }); y -= 13;
    text(ctx, view.bill.name || view.words.noCustomer, L, y, 10, { bold: true }); y -= 12;
    for (const l of view.bill.lines.slice(0, 3)) { text(ctx, l, L, y, 8.5, { color: c.grey }); y -= 11; }
    y -= 14;
    text(ctx, view.words.number.toUpperCase(), L, y, 7.5, { bold: true, color: c.grey }); y -= 12;
    text(ctx, view.number, L, y, 9.5); y -= 14;
    for (const m of view.meta.filter((x) => x.value)) { text(ctx, `${m.label}  ${m.value}`, L, y, 9); y -= 12; }
    if (view.statusText) text(ctx, view.statusText.toUpperCase(), L, y - 2, 7.5, { color: c.grey });
    text(ctx, view.title.toUpperCase(), R, TOP, TITLE_SIZE, { bold: true, color: c.accent, align: 'right' });
    text(ctx, view.number, R, TOP - 22, 9.5, { align: 'right', color: c.grey });
    ctx.y = TOP - 64;
  }

  /** The table head: the column titles, a rule under them. */
  function tableHead(ctx) {
    const { cols, c, st, view } = ctx;
    const hc = st.accent.id === 'ink' ? c.ink : c.accent;
    ctx.y -= 4;
    for (const k of ['desc', 'qty', 'unit', 'disc', 'tax', 'total']) {
      if (k === 'disc' && !view.hasDiscount) continue;
      const align = k === 'desc' ? 'left' : 'right';
      text(ctx, view.words.cols[k].toUpperCase(), k === 'desc' ? cols.desc.x : cols[k].right, ctx.y - 10, 7.5, { bold: true, color: hc, align });
    }
    ctx.page.drawLine({ start: { x: ctx.x0, y: ctx.y - 16 }, end: { x: R, y: ctx.y - 16 }, thickness: 0.8, color: c.ink });
    ctx.y -= 22;
  }

  /** The lines table: one row per line, description wrapped, repeated head on each page. */
  function table(ctx, ensure) {
    const { view, c, st, cols, f } = ctx;
    ctx.inTable = true;
    ensure(40);
    tableHead(ctx);
    const size = 9.5;
    view.rows.forEach((r, i) => {
      const lines = wrap(f.reg, r.description || view.words.noDesc, size, cols.desc.w);
      const h = Math.max(1, lines.length) * 12 + 8;
      ensure(h);
      if (st.table === 'zebra' && i % 2 === 1) ctx.page.drawRectangle({ x: ctx.x0, y: ctx.y - h + 3, width: R - ctx.x0, height: h, color: c.tint });
      lines.forEach((ln, k) => text(ctx, ln, cols.desc.x, ctx.y - 12 - k * 12, size));
      const base = ctx.y - 12;
      text(ctx, r.qty, cols.qty.right, base, size, { align: 'right' });
      text(ctx, r.unit, cols.unit.right, base, size, { align: 'right' });
      if (view.hasDiscount) text(ctx, r.disc, cols.disc.right, base, size, { align: 'right' });
      text(ctx, r.tax, cols.tax.right, base, size, { align: 'right' });
      text(ctx, r.total, cols.total.right, base, size, { align: 'right', bold: true });
      if (st.table === 'rules' || st.table === 'zebra') ctx.page.drawLine({ start: { x: ctx.x0, y: ctx.y - h + 3 }, end: { x: R, y: ctx.y - h + 3 }, thickness: 0.4, color: c.rule });
      ctx.y -= h;
    });
    if (!view.rows.length) { ensure(20); text(ctx, view.words.noLines, ctx.x0, ctx.y - 12, 9, { color: c.grey }); ctx.y -= 20; }
    ctx.inTable = false;
    ctx.y -= 12;
  }

  /** The totals: subtotal, tax by rate, total, paid and balance due, in a tinted box or under a rule. */
  function totals(ctx, ensure) {
    const { view, c, st } = ctx;
    const boxX = R - 218;
    const rows = view.totals;
    const h = (rows.length || 1) * 15 + 16;
    ensure(h + 10);
    if (!rows.length) { text(ctx, view.totalsNote, R, ctx.y - 10, 9, { align: 'right', color: c.grey }); ctx.y -= 26; return; }
    if (st.totals === 'box') ctx.page.drawRectangle({ x: boxX, y: ctx.y - h + 6, width: R - boxX, height: h, color: c.tint });
    let y = ctx.y - 14;
    for (const r of rows) {
      if (r.strong && st.totals === 'rule') ctx.page.drawLine({ start: { x: boxX, y: y + 11 }, end: { x: R, y: y + 11 }, thickness: 0.8, color: c.ink });
      text(ctx, r.label, boxX + 10, y, r.strong ? 10 : 9, { bold: !!r.strong });
      text(ctx, r.value, R - 10, y, r.strong ? 10 : 9, { bold: !!r.strong, align: 'right' });
      y -= 15;
    }
    ctx.y = ctx.y - h - 8;
  }

  /** The notes, wrapped, under the totals. */
  function notes(ctx, ensure) {
    const t = ctx.view.notes.text;
    if (!t) return;
    const lines = wrap(ctx.f.reg, t, 9, R - ctx.x0);
    ensure(lines.length * 12 + 22);
    text(ctx, ctx.view.words.notes.toUpperCase(), ctx.x0, ctx.y - 6, 7.5, { bold: true, color: ctx.c.grey });
    ctx.y -= 18;
    for (const ln of lines) { ensure(12); text(ctx, ln, ctx.x0, ctx.y, 9); ctx.y -= 12; }
  }

  /** The footer on every page: company and tax number on the left, "Page n of N" on the right. */
  function footers(ctx) {
    const n = ctx.pages.length;
    const left = [ctx.view.company.name, ctx.view.words.taxNumber].filter(Boolean).join('  ·  ');
    ctx.pages.forEach((p, i) => {
      ctx.page = p;
      p.drawLine({ start: { x: L, y: 52 }, end: { x: R, y: 52 }, thickness: 0.4, color: ctx.c.rule });
      text(ctx, left, L, 40, 7.5, { color: ctx.c.grey });
      text(ctx, ctx.view.words.pageOf(i + 1, n), R, 40, 7.5, { color: ctx.c.grey, align: 'right' });
    });
  }

  NS.pdf = { renderPdf, wrap, clean, PAGE_W, PAGE_H };
})(typeof window !== 'undefined' ? window : globalThis);
