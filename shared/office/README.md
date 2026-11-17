# shared/office: the Slop Office file layer

Small ES modules shared by Slop Docs, Slop Tables and Slop Slides for reading and
writing OOXML (DOCX/XLSX/PPTX) and ODF (ODT/ODS/ODP) packages. No dependencies,
no build step. Owned by Slop Docs; other apps use it read-only.

## zip.js

```js
import { readZip, writeZip, readText, crc32 } from '../../shared/office/zip.js';
const files = await readZip(blob);            // Map(path → Uint8Array), central-directory order
const xml = readText(files, 'word/document.xml');
const out = await writeZip([
  { path: 'mimetype', data: 'application/vnd.oasis.opendocument.text', store: true }, // ODF: first, stored
  { path: 'content.xml', data: xmlString },   // strings are utf-8 encoded
  { path: 'Pictures/a.png', data: pngBytes },
], { compress: true });                       // → Blob (application/zip)
```

- Deflate uses `CompressionStream('deflate-raw')` / `DecompressionStream('deflate-raw')`.
- Methods read: stored (0) and deflate (8). No ZIP64, no encryption.
- `store: true` keeps an entry uncompressed (needed for the ODF `mimetype` entry).
  Entries of 64 bytes or less, and entries that do not shrink, are stored.
- Also exported: `inflateRaw(u8)`, `deflateRaw(u8)`.

## xml.js

```js
import { x, esc, doc, xmlns, NS, parseXml, kids, kid, path, all, attr, textOf } from '../../shared/office/xml.js';
doc(x('w:document', xmlns('w', 'r'), [x('w:body', null, [x('w:p', null, [])])]));
x('w:t', { 'xml:space': 'preserve' }, 'a < b');   // string child: escaped text
x('w:r', null, [x('w:t', null, 'hi')]);             // array child: raw XML strings
const d = parseXml(text);                           // throws on malformed XML
kids(body, NS.w, 'p'); kid(p, NS.w, 'pPr'); path(p, NS.w, 'pPr', 'pStyle');
attr(el, NS.w, 'val'); attr(el, null, 'Target');
```

- `NS` holds the OOXML (w, r, wp, a, pic, p, s, c, rel, ct, cp, dc, dcterms, xsi, ep, mc)
  and ODF (office, style, text, table, draw, fo, svg, presentation, meta, number,
  manifest, xlink) namespace URIs. `xmlns('w','r')` makes the declaration attributes.
- Attributes with `null`, `undefined` or `false` values are dropped.
- `esc` strips XML-illegal control characters.

## units.js

Conversions through points: `ptToPx`, `pxToPt`, `ptToEmu`, `emuToPt`, `pxToEmu`,
`emuToPx`, `ptToTwips`, `twipsToPt`, `ptToHalfPt`, `halfPtToPt`, `ptToEighths`,
`eighthsToPt`, `mmToPt`, `ptToMm`, `cmToPt`, `ptToCm`, `inToPt`, `ptToIn`.
`lengthToPt('2.54cm')` parses ODF/CSS lengths; `ptToLength(pt, 'cm')` formats them.
`PAGE_SIZES` (A3, A4, A5, Letter, Legal, Tabloid in points) and `pageSizeName(w, h)`.
`hexToOoxml('#ff0000') → 'FF0000'`, `ooxmlToHex('FF0000') → '#ff0000'`.

## Tests

`node tests/run.mjs office` (tests/office/office.test.html).
