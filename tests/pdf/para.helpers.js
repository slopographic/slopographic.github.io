/* Helpers for the Edit text ▸ Paragraphs tests (window.PP): make PDFs with paragraphs, open one in Paragraphs mode, click
   and drag on the page, type in a frame, and read the saved file's text back with pdf.js. */
(function () {
  'use strict';
  const { waitFor, sleep } = SlopTest;
  const PP = window.PP = {};
  const doc = () => PT.win.document;
  PP.Ed = () => PT.SP.editor;
  PP.P = () => PT.SP.editor._.para;

  /** A one-page PDF (420 × 320) drawn by draw(page, fonts, PDFLib); fonts: { hel } (Helvetica, not embedded). */
  PP.pdf = async function (draw) {
    if (!PT.SP) await PT.boot();
    const L = PT.win.PDFLib, d = await L.PDFDocument.create(), hel = await d.embedFont(L.StandardFonts.Helvetica);
    const pg = d.addPage(PT.win.Array.of(420, 320));
    await draw(pg, { hel, doc: d }, L);
    d.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2024, 0, 1) + (++PT._nonce) * 1000));
    return d.save();
  };
  /** Lines of text from a baseline (PDF y) down, one pitch apart, at x. */
  PP.lines = (pg, font, texts, x, y, pitch = 15, size = 12) => texts.forEach((t, i) => pg.drawText(t, { x, y: y - i * pitch, size, font }));
  /** Words set justified in a column: every line but the last spread to the width. Returns the lines' word lists. */
  PP.justify = function (pg, font, words, x, y, width, pitch = 15, size = 12) {
    const sp = font.widthOfTextAtSize(' ', size), lines = [];
    let cur = [];
    const w = (ws) => ws.reduce((a, t) => a + font.widthOfTextAtSize(t, size), 0) + sp * (ws.length - 1);
    words.forEach((t) => { if (cur.length && w(cur.concat(t)) > width) { lines.push(cur); cur = []; } cur.push(t); });
    if (cur.length) lines.push(cur);
    lines.forEach((ws, i) => {
      const last = i === lines.length - 1, extra = last || ws.length < 2 ? 0 : (width - w(ws)) / (ws.length - 1);
      let xx = x;
      ws.forEach((t) => { pg.drawText(t, { x: xx, y: y - i * pitch, size, font }); xx += font.widthOfTextAtSize(t, size) + sp + extra; });
    });
    return lines;
  };

  /** Opens bytes in the page view with Edit text on in Paragraphs mode. */
  PP.open = async function (bytes, name) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(bytes, name || 'para.pdf');
    PT.A.openPage(PT.E.state.pages[0].id);
    await waitFor(() => doc().querySelector('.pv-textlayer span') && PP.Ed().pid === PT.E.state.pages[0].id, { timeout: 10000 });
    PP.Ed().setTool('select');
    PP.Ed().setEditTextMode('paragraphs');
    if (!PP.Ed().editText) PP.Ed().toggleEditText();
    return PT.E.state.pages[0];
  };
  PP.off = () => { if (PP.Ed().editText) PP.Ed().toggleEditText(); PP.Ed().setEditTextMode('lines'); };
  /** A client point for a page point (x, y from the page's top, points). */
  PP.at = function (x, y) {
    const el = PP.Ed()._.slots.get(PT.E.state.pages[0].id).el, z = PP.Ed().zoom, r = el.getBoundingClientRect();
    return { el, x: r.left + x * z, y: r.top + y * z };
  };
  const ev = (type, x, y, id) => new PT.win.PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, pointerId: id || 1, pointerType: 'mouse', isPrimary: true });
  /** A click on the page (x, y from the top); waits for the frame to be set up. */
  PP.click = async function (x, y) {
    const a = PP.at(x, y);
    a.el.dispatchEvent(ev('pointerdown', a.x, a.y));
    PT.win.dispatchEvent(ev('pointerup', a.x, a.y));
    await PP.ready();
  };
  /** A drag on the page from one point to another (a selection across lines). */
  PP.drag = async function (x0, y0, x1, y1) {
    const a = PP.at(x0, y0), b = PP.at(x1, y1);
    a.el.dispatchEvent(ev('pointerdown', a.x, a.y));
    PT.win.dispatchEvent(ev('pointermove', (a.x + b.x) / 2, (a.y + b.y) / 2));
    PT.win.dispatchEvent(ev('pointermove', b.x, b.y));
    PT.win.dispatchEvent(ev('pointerup', b.x, b.y));
    await PP.ready();
  };
  PP.ready = async function () {
    const f = await waitFor(() => { const el = doc().querySelector('.para-frame'); return el && !el.classList.contains('is-busy') ? el : (doc().querySelector('.sf-ov') ? 'ask' : null); }, { timeout: 10000 });
    if (f === 'ask') { doc().querySelectorAll('.sf-row [data-how="closest"]').forEach((b) => b.click()); return PP.ready(); }
    return f;
  };
  /** Drags a side handle of the frame ('w' or 'e') by dx screen pixels. */
  PP.dragHandle = async function (h, dx) {
    const el = doc().querySelector('.para-frame .para-h[data-h="' + h + '"]'), r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    el.dispatchEvent(ev('pointerdown', x, y));
    for (let k = 1; k <= 4; k++) PT.win.dispatchEvent(ev('pointermove', x + dx * k / 4, y));
    PT.win.dispatchEvent(ev('pointerup', x + dx, y));
    await sleep(50);
  };
  /** Drags the frame itself by (dx, dy) screen pixels. */
  PP.dragFrame = async function (dx, dy) {
    const el = doc().querySelector('.para-frame'), r = el.getBoundingClientRect(), x = r.left + 20, y = r.top + r.height / 2;
    el.dispatchEvent(ev('pointerdown', x, y));
    PT.win.dispatchEvent(ev('pointermove', x + dx / 2, y + dy / 2));
    PT.win.dispatchEvent(ev('pointermove', x + dx, y + dy));
    PT.win.dispatchEvent(ev('pointerup', x + dx, y + dy));
    await sleep(50);
  };
  /** Opens the selected frame for typing, replaces its text with text (as typed), and applies it with Ctrl+Enter. */
  PP.type = async function (text, { keep = false } = {}) {
    const before = PT.E.undoLabel();
    PP.Ed()._.para.edit();
    const box = await waitFor(() => doc().querySelector('.para-edit'), { timeout: 8000 });
    box.focus();
    if (!keep) doc().execCommand('selectAll');
    doc().execCommand('insertText', false, text);
    box.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await waitFor(() => !doc().querySelector('.para-edit') && PP.para() && PT.E.undoLabel() === 'Edit paragraph', { timeout: 8000 });
    return before;
  };
  /** The page's paragraph frame annotation (the last one). */
  PP.para = () => PT.E.state.pages[0].annots.filter((a) => a.type === 'para').pop() || null;
  /** The text of a frame annotation. */
  PP.textOf = (a) => a.paras.map((pr) => pr.map((r) => r.t).join('')).join('\n');
  /** The saved file's text items on page 1: [{ str, x, y, w, font }] (pdf.js reads it back). */
  PP.saved = async function () {
    const out = await PT.read(await PT.E.build()), pg = await out.doc.getPage(1);
    await pg.getOperatorList();
    const items = (await pg.getTextContent()).items.filter((i) => i.str.trim());
    return items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, font: pg.commonObjs.has(i.fontName) ? pg.commonObjs.get(i.fontName).name : '' }));
  };
  /** Items grouped by baseline, top line first: [{ y, items, x0, x1, text }]. */
  PP.rows = function (items) {
    const rows = [];
    items.slice().sort((a, b) => b.y - a.y).forEach((it) => {
      const r = rows.find((q) => Math.abs(q.y - it.y) < 1);
      if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
    });
    rows.forEach((r) => {
      r.items.sort((a, b) => a.x - b.x);
      r.x0 = Math.min(...r.items.map((i) => i.x)); r.x1 = Math.max(...r.items.map((i) => i.x + i.w));
      r.text = r.items.map((i) => i.str).join(' ');
    });
    return rows;
  };
  /** The frame's left and right edges in PDF space. */
  PP.edges = (a) => { const g = PT.E.geom(PT.E.state.pages[0]); return { x0: g.x0 + a.cx - a.w / 2, x1: g.x0 + a.cx + a.w / 2, top: g.y0 + g.H - (a.cy - a.h / 2) }; };
})();
