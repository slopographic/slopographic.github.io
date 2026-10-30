// A hand-built PowerPoint package for the Slop Slides import tests (tests/node/slides-pptx-in.test.mjs and the browser
// test tests/slides/pptx-import.test.html): 4:3, a theme with its own colours and fonts, a master with text styles and
// placeholders, a layout, two slides (the second hidden, with a fade), speaker notes, a picture, a table, a chart and a
// group. Not a test itself. Works in Node and in the browser (no DOM, no Node modules).
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const E = (pt) => Math.round(pt * 12700);
const rels = (list) => HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  list.map(([id, type, target, ext]) => `<Relationship Id="${id}" Type="${REL}${type}" Target="${target}"${ext ? ' TargetMode="External"' : ''}/>`).join('') + '</Relationships>';
const xfrm = (x, y, w, h, extra = '') => `<a:xfrm${extra}><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(w)}" cy="${E(h)}"/></a:xfrm>`;
const nv = (tag, id, name, inner = '', pr = '') => `<p:nv${tag}Pr><p:cNvPr id="${id}" name="${name}"/><p:cNv${tag}Pr${pr}/><p:nvPr>${inner}</p:nvPr></p:nv${tag}Pr>`;
const tree = (body) => '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + body + '</p:spTree>';

const THEME = HDR + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Harbour"><a:themeElements>' +
  '<a:clrScheme name="Harbour"><a:dk1><a:sysClr val="windowText" lastClr="101820"/></a:dk1><a:lt1><a:srgbClr val="FBFAF5"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="2B3A55"/></a:dk2><a:lt2><a:srgbClr val="E8E4D8"/></a:lt2><a:accent1><a:srgbClr val="1F77B4"/></a:accent1>' +
  '<a:accent2><a:srgbClr val="FF7F0E"/></a:accent2><a:accent3><a:srgbClr val="2CA02C"/></a:accent3><a:accent4><a:srgbClr val="D62728"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="9467BD"/></a:accent5><a:accent6><a:srgbClr val="8C564B"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink>' +
  '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="Harbour"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Harbour"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"/><a:ln w="19050"/></a:lnStyleLst>' +
  '<a:effectStyleLst/><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';

const MASTER = HDR + `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>` + tree(
  `<p:sp>${nv('Sp', 2, 'Title Placeholder 1', '<p:ph type="title"/>')}<p:spPr>${xfrm(36, 30, 648, 90)}</p:spPr>` +
  '<p:txBody><a:bodyPr anchor="b"/><a:lstStyle/><a:p><a:r><a:t>Master title</a:t></a:r></a:p></p:txBody></p:sp>' +
  `<p:sp>${nv('Sp', 3, 'Text Placeholder 2', '<p:ph type="body" idx="1"/>')}<p:spPr>${xfrm(36, 140, 648, 340)}</p:spPr>` +
  '<p:txBody><a:bodyPr lIns="0"/><a:lstStyle/><a:p><a:r><a:t>Body</a:t></a:r></a:p></p:txBody></p:sp>' +
  `<p:sp>${nv('Sp', 4, 'Brand bar')}<p:spPr>${xfrm(0, 520, 720, 20)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>`) +
  '</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles>' +
  '<p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4000" b="1"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
  '<p:bodyStyle><a:lvl1pPr><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buChar char="•"/><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr>' +
  '<a:lvl2pPr><a:buChar char="–"/><a:defRPr sz="2400"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:defPPr/></p:otherStyle></p:txStyles></p:sldMaster>';

const LAYOUT = HDR + `<p:sldLayout ${NS} type="obj"><p:cSld name="Title and Content">` + tree(
  `<p:sp>${nv('Sp', 2, 'Title 1', '<p:ph type="title"/>')}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Click to add title</a:t></a:r></a:p></p:txBody></p:sp>` +
  `<p:sp>${nv('Sp', 3, 'Content 2', '<p:ph idx="1"/>')}<p:spPr>${xfrm(36, 150, 648, 330)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Click</a:t></a:r></a:p></p:txBody></p:sp>`) +
  '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

const tb = (id, name, x, y, w, h, paras, pr = '') => `<p:sp>${nv('Sp', id, name, '', ' txBox="1"')}<p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
  `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"${pr}><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
const SLIDE1 = HDR + `<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F0F4FA"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` + tree(
  `<p:sp>${nv('Sp', 2, 'Title 1', '<p:ph type="title"/>')}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-GB"/><a:t>Harbour report</a:t></a:r></a:p></p:txBody></p:sp>` +
  `<p:sp>${nv('Sp', 3, 'Content 2', '<p:ph idx="1"/>')}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>` +
  '<a:p><a:r><a:t>Ships in</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:t>Mostly ferries</a:t></a:r></a:p><a:p><a:r><a:t>Cargo too</a:t></a:r></a:p></p:txBody></p:sp>' +
  tb(4, 'Mixed runs', 400, 40, 280, 60, '<a:p><a:pPr algn="r"/><a:r><a:rPr sz="1400" b="1"/><a:t>Bold </a:t></a:r><a:r><a:rPr sz="1400" i="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>red italic </a:t></a:r>' +
    '<a:r><a:rPr sz="2000" u="sng"><a:solidFill><a:schemeClr val="accent2"><a:lumMod val="75000"/></a:schemeClr></a:solidFill><a:latin typeface="Courier New"/>' +
    '<a:hlinkClick r:id="rId9"/></a:rPr><a:t>link</a:t></a:r></a:p>') +
  `<p:sp>${nv('Sp', 5, 'Badge')}<p:spPr>${xfrm(500, 380, 120, 60, ' rot="1800000"')}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 25000"/></a:avLst></a:prstGeom>` +
  '<a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="003366"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr>' +
  '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>' +
  '<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:t>New</a:t></a:r></a:p></p:txBody></p:sp>' +
  `<p:sp>${nv('Sp', 6, 'Glow')}<p:spPr>${xfrm(40, 400, 100, 100)}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs><a:gs pos="100000"><a:schemeClr val="accent3"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>` +
  `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="7" name="Arrow"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(160, 300, 200, 50, ' flipV="1"')}<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>` +
  '<a:ln w="38100"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>' +
  `<p:pic>${nv('Pic', 8, 'Logo')}<p:blipFill><a:blip r:embed="rId3"/><a:srcRect l="10000" r="20000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(600, 30, 80, 80)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="${E(100)}" cy="${E(100)}"/></p:xfrm>` +
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId4"/></a:graphicData></a:graphic></p:graphicFrame>' +
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="10" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${E(380)}" y="${E(150)}"/><a:ext cx="${E(300)}" cy="${E(80)}"/></p:xfrm>` +
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/>' +
  `<a:tblGrid><a:gridCol w="${E(100)}"/><a:gridCol w="${E(200)}"/></a:tblGrid>` +
  `<a:tr h="${E(40)}"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1600"/><a:t>Port</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1600"/><a:t>Ships</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>` +
  `<a:tr h="${E(40)}"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1600"/><a:t>Oslo</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="FFFF00"/></a:solidFill></a:tcPr></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1600"/><a:t>42</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>` +
  '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>' +
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="11" name="Pair"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${E(200)}" y="${E(460)}"/><a:ext cx="${E(100)}" cy="${E(40)}"/>` +
  `<a:chOff x="0" y="0"/><a:chExt cx="${E(200)}" cy="${E(80)}"/></a:xfrm></p:grpSpPr>` +
  `<p:sp>${nv('Sp', 12, 'Left')}<p:spPr>${xfrm(0, 0, 80, 80)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="00AA00"/></a:solidFill></p:spPr></p:sp>` +
  `<p:sp>${nv('Sp', 13, 'Right')}<p:spPr>${xfrm(120, 0, 80, 80)}<a:custGeom><a:pathLst/></a:custGeom><a:solidFill><a:srgbClr val="0000AA"/></a:solidFill></p:spPr></p:sp></p:grpSp>`) +
  '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
const SLIDE2 = HDR + `<p:sld ${NS} show="0"><p:cSld>` + tree(
  `<p:sp>${nv('Sp', 2, 'Title 1', '<p:ph type="title"/>')}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Spare slide</a:t></a:r></a:p></p:txBody></p:sp>`) +
  '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr><p:transition spd="slow"><p:fade/></p:transition></p:sld>';
const NOTES = HDR + `<p:notes ${NS}><p:cSld>` + tree(
  `<p:sp>${nv('Sp', 2, 'Slide Image', '<p:ph type="sldImg"/>')}<p:spPr/></p:sp>` +
  `<p:sp>${nv('Sp', 3, 'Notes', '<p:ph type="body" idx="1"/>')}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Remember the numbers.</a:t></a:r></a:p><a:p><a:r><a:t>Then smile.</a:t></a:r></a:p></p:txBody></p:sp>`) +
  '</p:cSld></p:notes>';

/** The package as [{ path, data }] (strings, and the picture as bytes), ready for writeZip. */
export function fixtureEntries(pngBytes) {
  return [
    { path: '[Content_Types].xml', data: HDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>' },
    { path: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'metadata/core-properties', 'docProps/core.xml']]) },
    { path: 'docProps/core.xml', data: HDR + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Harbour report 2026</dc:title></cp:coreProperties>' },
    { path: 'ppt/presentation.xml', data: HDR + `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      '<p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId4"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/>' +
      '<p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>' },
    { path: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ['rId3', 'slide', 'slides/slide1.xml'], ['rId4', 'slide', 'slides/slide2.xml']]) },
    { path: 'ppt/theme/theme1.xml', data: THEME },
    { path: 'ppt/slideMasters/slideMaster1.xml', data: MASTER },
    { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT },
    { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { path: 'ppt/slides/slide1.xml', data: SLIDE1 },
    { path: 'ppt/slides/_rels/slide1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'notesSlide', '../notesSlides/notesSlide1.xml'],
      ['rId3', 'image', '../media/image1.png'], ['rId4', 'chart', '../charts/chart1.xml'], ['rId9', 'hyperlink', 'https://example.com/harbour', true]]) },
    { path: 'ppt/slides/slide2.xml', data: SLIDE2 },
    { path: 'ppt/slides/_rels/slide2.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
    { path: 'ppt/notesSlides/notesSlide1.xml', data: NOTES },
    { path: 'ppt/media/image1.png', data: pngBytes },
  ];
}
