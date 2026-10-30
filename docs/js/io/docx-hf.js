/* Slop Docs — io/docx-hf: headers and footers in a Word file. Export: one part per area that has text (word/header1.xml
 * for every page, word/header2.xml for the first page when it differs, the same for footers), their relationships and
 * content types, and the section's references (w:headerReference, w:footerReference, w:titlePg). Fields are w:fldSimple
 * PAGE and NUMPAGES (docx.js runXml). Import of the same parts is in docx-in.js (readHF).
 *   hfParts(doc, blockXml) → { files, rels, types, refs, titlePg } */
import { x, doc as xmlDoc, xmlns } from '../../../shared/office/xml.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';

export function hfParts(doc, blockXml) {
  const out = { files: [], rels: [], types: [], refs: [], titlePg: '' };
  const first = !!doc.section.differentFirst;
  const want = [['header', 'default'], ['footer', 'default']];
  if (first) want.push(['header', 'first'], ['footer', 'first']);
  const n = { header: 0, footer: 0 };
  for (const [kind, type] of want) {
    const blocks = (doc[kind] && doc[kind][type]) || [];
    // a different first page with nothing on it still needs its (empty) part, or Word repeats the default one there
    if (!blocks.length && type === 'default') continue;
    const i = ++n[kind], name = `${kind}${i}.xml`, id = `rIdHF${kind[0]}${i}`, tag = kind === 'header' ? 'w:hdr' : 'w:ftr';
    const body = blocks.map(blockXml).join('') || x('w:p');
    out.files.push({ path: 'word/' + name, data: xmlDoc(x(tag, xmlns('w', 'r'), [body])) });
    out.rels.push(x('Relationship', { Id: id, Type: REL + kind, Target: name }));
    out.types.push(x('Override', { PartName: '/word/' + name, ContentType: CT + kind + '+xml' }));
    out.refs.push(x(kind === 'header' ? 'w:headerReference' : 'w:footerReference', { 'w:type': type, 'r:id': id }));
  }
  // Word wants the header references before the footer references
  out.refs.sort((a, b) => (a.startsWith('<w:header') ? 0 : 1) - (b.startsWith('<w:header') ? 0 : 1));
  if (first) out.titlePg = x('w:titlePg');
  return out;
}
