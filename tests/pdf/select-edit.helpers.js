/* Helpers for the select tool's editing tests (window.SE): open a PDF in page view with the select tool (Edit text and Objects
   mode off), press, tap, drag and double-click as a mouse or a finger sends them (the events go to the element under the point,
   moves and the release to the page element, as with pointer capture), and read the saved file's text back with pdf.js. */
(function () {
  'use strict';
  const { waitFor, sleep } = SlopTest;
  const SE = window.SE = {};
  const doc = () => PT.win.document;
  SE.Ed = () => PT.SP.editor;
  SE.S = () => PT.SP.editor._;
  SE.P = () => PT.SP.editor._.para;

  /** Opens bytes and shows page 1 with the select tool. */
  SE.open = async function (bytes, name, opts = { text: true }) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    PT.win.getSelection().removeAllRanges();
    await PT.open(bytes, name || 'se.pdf');
    const id = PT.E.state.pages[0].id;
    PT.A.openPage(id);
    await waitFor(() => SE.Ed().pid === id && SE.S().pageEl && SE.S().slots.get(id).key && (!opts.text || doc().querySelector('.pv-textlayer span')), { timeout: 15000 });
    const Ed = SE.Ed();
    if (Ed.editText) Ed.toggleEditText();
    if (Ed.objMode) Ed.toggleObjects(false);
    Ed.setTool('select');
    SE.S().pageEl.setPointerCapture = () => {}; SE.S().pageEl.releasePointerCapture = () => {};
    return PT.E.state.pages[0];
  };
  /** A one-page 420 × 320 PDF with two Helvetica paragraphs (3 lines at baselines 280, 265, 250; 2 lines at 215, 200), and
   * optional more pages. */
  SE.paras = (pages = 1) => PP.pdf((pg, f) => {
    PP.lines(pg, f.hel, ['The quick brown fox jumps over', 'the lazy dog and keeps on', 'running until the end of it.'], 40, 280);
    PP.lines(pg, f.hel, ['A second paragraph sits below', 'after a gap.'], 40, 215);
    for (let i = 1; i < pages; i++) f.doc.addPage(PT.win.Array.of(420, 320));
  });
  /** Client point of a page point (x, y from the page's top-left, points) on page pid (the active page by default). */
  SE.at = function (x, y, pid) {
    const s = SE.S().slots.get(pid || SE.Ed().pid), r = s.el.getBoundingClientRect(), z = SE.Ed().zoom;
    return { clientX: r.left + x * z, clientY: r.top + y * z };
  };
  SE.centre = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  const ev = (type, pt, o = {}) => new PT.win.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: o.touch ? 21 : 9, pointerType: o.touch ? 'touch' : 'mouse',
    isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, shiftKey: !!o.shift, altKey: !!o.alt }, pt));
  /** A press and release with no movement at a client point, on what is there. */
  SE.tap = async function (pt, o = {}) {
    const el = doc().elementFromPoint(pt.clientX, pt.clientY);
    el.dispatchEvent(ev('pointerdown', pt, o));
    if (o.hold) await sleep(o.hold);
    (SE.S().pageEl || el).dispatchEvent(ev('pointerup', pt, o));
    await sleep(30);
  };
  /** A press at a client point (or on an element's centre) and a drag by (dx, dy) client px in steps. */
  SE.drag = async function (from, dx, dy, o = {}) {
    const pt = from.nodeType ? SE.centre(from) : from, el = from.nodeType ? from : doc().elementFromPoint(pt.clientX, pt.clientY), pg = SE.S().pageEl;
    el.dispatchEvent(ev('pointerdown', pt, o));
    for (let k = 1; k <= 6; k++) pg.dispatchEvent(ev('pointermove', { clientX: pt.clientX + dx * k / 6, clientY: pt.clientY + dy * k / 6 }, o));
    pg.dispatchEvent(ev('pointerup', { clientX: pt.clientX + dx, clientY: pt.clientY + dy }, o));
    await sleep(60);
  };
  /** A double click at a client point: two presses, then the dblclick. */
  SE.dbl = async function (pt) {
    await SE.tap(pt);
    const el = doc().elementFromPoint(pt.clientX, pt.clientY);
    el.dispatchEvent(ev('pointerdown', pt)); SE.S().pageEl.dispatchEvent(ev('pointerup', pt));
    el.dispatchEvent(new PT.win.MouseEvent('dblclick', Object.assign({ bubbles: true, cancelable: true, detail: 2 }, pt)));
  };
  /** The frame once its block is set up (a font question is answered with the closest font). */
  SE.frame = () => PP.ready();
  SE.key = (el, key, o = {}) => el.dispatchEvent(new PT.win.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, o)));
  /** The saved file's text items of page i: [{ str, x, y, t (transform), font }]. */
  SE.saved = async function (i = 0) {
    const out = await PT.read(await PT.E.build()), pg = await out.doc.getPage(i + 1);
    await pg.getOperatorList();
    return (await pg.getTextContent()).items.filter((it) => it.str.trim()).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], t: it.transform, font: pg.commonObjs.has(it.fontName) ? pg.commonObjs.get(it.fontName).name : '' }));
  };
  SE.annot = (aid, pi = 0) => PT.E.state.pages[pi].annots.find((a) => a.id === aid);
  SE.elOf = (aid) => SE.S().pageEl.querySelector('.annots [data-aid="' + aid + '"]');
  /** A text box annotation on page pi at cx, cy. */
  SE.textAnnot = function (id, text, cx, cy) {
    const a = { id, type: 'text', text, font: 'Helvetica', bold: false, italic: false, size: 16, color: '#111111', opacity: 1, rot: 0, cx, cy };
    const t = PT.E.textLayout(a); a.w = t.w; a.h = t.h;
    return a;
  };
  SE.box = (id, cx, cy) => ({ id, type: 'hlbox', rot: 0, cx, cy, w: 60, h: 30, fill: '#ff0000', opacity: 1 });
})();
