/* Slop Docs — ui/buffer: the shared copy-and-drop buffer (window.SlopBuffer, see shared/buffer/). Copy to buffer puts the
 * selected text as text/html (paragraphs, bold and italic kept) and text/plain. Paste (when the buffer is newer than the
 * last copy made in this document) and drop insert it at the caret. Adds SlopDocs.A.copyToBuffer and A.pasteBuffer.
 * Classic script; reads SlopBuffer only. */
(function () {
  'use strict';
  const S = window.SlopDocs, A = S.A;
  const SB = window.SlopBuffer;
  const O = () => window.SlopDocEngine.O;
  let lastCopyT = 0;

  const toast = (m) => { if (window.SlopUI) SlopUI.toast(m); };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const len = (p) => (p.runs || []).reduce((n, r) => n + r.text.length, 0);

  /** The runs of a paragraph between two offsets, as { t, b, i } (bold and italic are the only marks carried). */
  function sliceRuns(p, from, to) {
    const out = [];
    let pos = 0;
    for (const r of p.runs || []) {
      const s = Math.max(from, pos), e = Math.min(to, pos + r.text.length);
      if (e > s) out.push({ t: r.text.slice(s - pos, e - pos), b: !!r.b, i: !!r.i });
      pos += r.text.length;
    }
    return out;
  }
  const runHtml = (r) => {
    let s = esc(r.t);
    if (r.b) s = '<b>' + s + '</b>';
    if (r.i) s = '<i>' + s + '</i>';
    return s;
  };

  /** Copy to buffer: the selection as HTML and as plain text (paragraphs joined by line breaks, as Docs copies them). */
  A.copyToBuffer = function () {
    const sel = S.sel;
    if (!sel || O().collapsed(sel) || !SB) { toast(S.t('docs.buf.select_first')); return; }
    const [a, f] = O().ordered(sel), paras = [], text = [];
    for (let i = a.b; i <= f.b && i < S.doc.blocks.length; i++) {
      const p = S.doc.blocks[i];
      if (!p || p.type !== 'p') continue;
      const runs = sliceRuns(p, i === a.b ? a.o : 0, i === f.b ? f.o : len(p));
      paras.push(runs);
      text.push(runs.map((r) => r.t).join(''));
    }
    const html = paras.map((runs) => '<p>' + runs.map(runHtml).join('') + '</p>').join('');
    SB.put({ kind: 'text', formats: { 'text/html': html, 'text/plain': text.join('\n') }, source: 'docs' })
      .then(() => toast(S.t('docs.buf.copied')), () => toast(S.t('docs.buf.failed')));
  };

  /** Inserts a parsed HTML block list at the caret: each run with its marks, a new paragraph between blocks. */
  function insertRich(paras) {
    const base = A.baseMarks();
    paras.forEach((runs, pi) => {
      if (pi) A.enter();
      runs.forEach((r) => {
        const m = Object.assign({}, base);
        delete m.b; delete m.i;
        if (r.b) m.b = true;
        if (r.i) m.i = true;
        S.pending = m;
        A.type(r.t, 'paste');
      });
    });
    S.pending = null;
  }

  /** The HTML a buffer item holds, as paragraphs of runs. Anything that is not a paragraph is read as text. */
  function htmlParas(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = doc.body.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6');
    const walk = (node, marks, acc) => {
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) { if (c.nodeValue) acc.push({ t: c.nodeValue, b: marks.b, i: marks.i }); return; }
        if (c.nodeType !== 1) return;
        const tag = c.localName;
        walk(c, { b: marks.b || tag === 'b' || tag === 'strong', i: marks.i || tag === 'i' || tag === 'em' }, acc);
      });
      return acc;
    };
    if (!blocks.length) return String(doc.body.textContent || '').replace(/\r\n?/g, '\n').split('\n').map((t) => [{ t }]);
    return Array.from(blocks).map((b) => walk(b, {}, []));
  }

  /** Paste: the buffer when it is newer than this document's last copy. Returns true when it handled the paste. */
  A.pasteBuffer = function () {
    const rec = SB && SB.get();
    if (!rec || rec.t <= lastCopyT) return false;
    const c = SB.choose(rec, ['text/html', 'text/plain']);
    if (!c) return false;
    if (c.type === 'text/plain') A.paste(c.data);
    else insertRich(htmlParas(c.data));
    return true;
  };

  /** Our own copy events count as copies too, so the buffer never beats a newer Ctrl+C made in this document. */
  document.addEventListener('copy', () => { lastCopyT = Date.now(); }, true);
  document.addEventListener('cut', () => { lastCopyT = Date.now(); }, true);

  if (SB) {
    SB.bindDrop(document.body, (rec) => {
      const c = SB.choose(rec, ['text/html', 'text/plain']);
      if (!c) return;
      if (c.type === 'text/plain') A.paste(c.data); else insertRich(htmlParas(c.data));
    });
    SB.tray(document.body);
  }
})();
