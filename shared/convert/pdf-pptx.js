/* PDF to PowerPoint (PPTX): one slide per page, the page drawn as a picture (rendered by pdf.js at 144 dpi, fitted to a
 * 16:9 slide and centred). The text is not editable in the deck. Packages the parts with shared/office/zip.js.
 * pdfToPptx(bytes, { pages }) → Blob. Not yet checked in Microsoft PowerPoint. Classic ES module. */
import { writeZip } from '../office/zip.js';
import { pdfToImages } from '../../convert/js/core/pdf-raster.js';

const SLIDE_W = 12192000, SLIDE_H = 6858000;   // 13.333 × 7.5 in, in EMU
const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PML = 'application/vnd.openxmlformats-officedocument.presentationml.';
const rels = (list) => HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  list.map((r) => `<Relationship Id="${r[0]}" Type="${RELS}/${r[1]}" Target="${r[2]}"/>`).join('') + '</Relationships>';
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

/** The picture of one page, fitted inside the slide and centred. */
export function slideXml(w, h, pageNo) {
  const k = Math.min(SLIDE_W / w, SLIDE_H / h), cx = Math.round(w * k), cy = Math.round(h * k);
  const x = Math.round((SLIDE_W - cx) / 2), y = Math.round((SLIDE_H - cy) / 2);
  return HDR + `<p:sld ${NS}><p:cSld><p:spTree>${GROUP}` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${pageNo}" descr="Page ${pageNo} of the PDF"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const MASTER = HDR + `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld>` +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
const LAYOUT = HDR + `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const FILL = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
const THEME = HDR + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Slop PDF"><a:themeElements>' +
  '<a:clrScheme name="Slop PDF"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2>' +
  ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'].map((c, i) => `<a:accent${i + 1}><a:srgbClr val="${c}"/></a:accent${i + 1}>`).join('') +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="Slop PDF"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  `<a:fmtScheme name="Slop PDF"><a:fillStyleLst>${FILL}${FILL}${FILL}</a:fillStyleLst>` +
  `<a:lnStyleLst><a:ln w="6350">${FILL}</a:ln><a:ln w="12700">${FILL}</a:ln><a:ln w="19050">${FILL}</a:ln></a:lnStyleLst>` +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  `<a:bgFillStyleLst>${FILL}${FILL}${FILL}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

/** The package parts for the pages: [{ w, h, pageNo, png (Uint8Array) }]. */
export function pptxEntries(pages) {
  const n = pages.length;
  const sldIds = pages.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('');
  const presentation = HDR + `<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  const ct = (part, type) => `<Override PartName="${part}" ContentType="${type}"/>`;
  const contentTypes = HDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
    ct('/ppt/presentation.xml', PML + 'presentation.main+xml') + ct('/ppt/slideMasters/slideMaster1.xml', PML + 'slideMaster+xml') +
    ct('/ppt/slideLayouts/slideLayout1.xml', PML + 'slideLayout+xml') + ct('/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml') +
    pages.map((_, i) => ct(`/ppt/slides/slide${i + 1}.xml`, PML + 'slide+xml')).join('') + '</Types>';
  const parts = [
    { path: '[Content_Types].xml', data: contentTypes },
    { path: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    { path: 'ppt/presentation.xml', data: presentation },
    { path: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'],
      ...pages.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]) },
    { path: 'ppt/slideMasters/slideMaster1.xml', data: MASTER },
    { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT },
    { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { path: 'ppt/theme/theme1.xml', data: THEME },
  ];
  for (let i = 0; i < n; i++) {
    const p = pages[i];
    parts.push({ path: `ppt/slides/slide${i + 1}.xml`, data: slideXml(p.w, p.h, p.pageNo) });
    parts.push({ path: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/image${i + 1}.png`]]) });
    parts.push({ path: `ppt/media/image${i + 1}.png`, data: p.png });
  }
  return parts;
}

/** A PPTX Blob with one slide per page. Pages are rendered with pdf.js; the list is read in the order given. */
export async function pdfToPptx(bytes, { pages = '' } = {}) {
  const images = await pdfToImages(bytes, { pages, scale: 2, format: 'png' });
  const list = [];
  for (const im of images) {
    list.push({ w: im.width, h: im.height, pageNo: im.pageNo, png: new Uint8Array(await im.blob.arrayBuffer()) });
  }
  return writeZip(pptxEntries(list));
}
