/* Slop Docs — io/pdf-nav: the PDF's links and bookmarks.
 *   addLinks(PL, pdf, page, links, destOf)   a Link annotation per linked text: a web or mail address opens it, a link to
 *                                            a heading (#<paragraph id>) goes to that heading's page and height
 *   addOutline(PL, pdf, headings, destOf)    the bookmarks panel: the document's headings, nested by level
 * destOf(pid) → [pageRef, top y in PDF space] or null. */
const ok = (u) => /^(https?:|mailto:|tel:)/i.test(u);

function destArray(PL, pdf, d) { return pdf.context.obj([d[0], PL.PDFName.of('XYZ'), PL.PDFNull, d[1], PL.PDFNull]); }

export function addLinks(PL, pdf, page, links, destOf) {
  for (const l of links) {
    const u = String(l.link || '');
    const base = { Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, 0] };
    let dict = null;
    if (ok(u)) dict = pdf.context.obj({ ...base, A: { Type: 'Action', S: 'URI', URI: PL.PDFString.of(u) } });
    else if (u.startsWith('#')) { const d = destOf(u.slice(1)); if (d) dict = pdf.context.obj({ ...base, Dest: destArray(PL, pdf, d) }); }
    if (dict) page.node.addAnnot(pdf.context.register(dict));
  }
}

export function addOutline(PL, pdf, headings, destOf) {
  const items = headings.filter((h) => h.text && destOf(h.pid));
  if (!items.length) return;
  const ctx = pdf.context, root = { ref: ctx.nextRef(), kids: [], level: 0 };
  const stack = [root];
  for (const h of items) {
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    const node = { ref: ctx.nextRef(), kids: [], level: h.level, h, parent: stack[stack.length - 1] };
    node.parent.kids.push(node);
    stack.push(node);
  }
  const count = (n) => n.kids.reduce((s, k) => s + 1 + count(k), 0);
  const write = (n) => {
    n.kids.forEach((k, i) => {
      const d = { Title: PL.PDFHexString.fromText(k.h.text), Parent: n.ref, Dest: destArray(PL, pdf, destOf(k.h.pid)) };
      if (i > 0) d.Prev = n.kids[i - 1].ref;
      if (i < n.kids.length - 1) d.Next = n.kids[i + 1].ref;
      if (k.kids.length) { d.First = k.kids[0].ref; d.Last = k.kids[k.kids.length - 1].ref; d.Count = count(k); }
      ctx.assign(k.ref, ctx.obj(d));
      write(k);
    });
  };
  write(root);
  ctx.assign(root.ref, ctx.obj({ Type: 'Outlines', First: root.kids[0].ref, Last: root.kids[root.kids.length - 1].ref, Count: count(root) }));
  pdf.catalog.set(PL.PDFName.of('Outlines'), root.ref);
}
