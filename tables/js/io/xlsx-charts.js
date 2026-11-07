/* Slop Tables: charts in the XLSX export. Each sheet with charts gets a drawing part (a two-cell anchor per chart, from its
 * place and size on the grid) and a chart part per chart (DrawingML: barChart with barDir col or bar, lineChart, pieChart),
 * whose series point at the same cells as on screen and carry the current values as a cache. A chart whose range has
 * no numbers is left out, as it shows no picture either.
 *   chartParts(wb) → { entries: [{ path, data }], types: [Override xml], sheets: Map(sheet index → drawing number) } */
import { esc, escAttr, doc } from '../../../shared/office/xml.js';
import { rangeText, quoteSheet } from '../engine/refs.js';
import { chartData, MAX_SERIES } from '../objects/chart-data.js';
import { LIGHT } from '../objects/chart-svg.js';

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart', NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const EMU = 9525;

/** A pixel offset on the sheet → { cell index, offset in EMU } along one axis. */
function along(size, px, max) {
  let i = 0, at = 0;
  while (i < max && at + size(i) <= px) { at += size(i); i++; }
  return { i, off: Math.max(0, Math.round((px - at) * EMU)) };
}
const marker = (tag, c, r) => `<xdr:${tag}><xdr:col>${c.i}</xdr:col><xdr:colOff>${c.off}</xdr:colOff><xdr:row>${r.i}</xdr:row><xdr:rowOff>${r.off}</xdr:rowOff></xdr:${tag}>`;
const ref = (sheet, g) => `${quoteSheet(sheet.name)}!${rangeText(g.r1, g.c1, g.r2, g.c2, [1, 1, 1, 1])}`;
const strCache = (list) => `<c:strCache><c:ptCount val="${list.length}"/>${list.map((t, i) => `<c:pt idx="${i}"><c:v>${esc(t)}</c:v></c:pt>`).join('')}</c:strCache>`;

function seriesXml(ch, d, s, i) {
  const sref = d.refs.series[i], sheet = d.refs.sheet, color = LIGHT.palette[i % LIGHT.palette.length];
  const tx = sref.name ? `<c:tx><c:strRef><c:f>${esc(ref(sheet, { r1: sref.name.r, c1: sref.name.c, r2: sref.name.r, c2: sref.name.c }))}</c:f>${strCache([s.name])}</c:strRef></c:tx>`
    : `<c:tx><c:v>${esc(s.name)}</c:v></c:tx>`;
  const fill = `<a:solidFill><a:srgbClr val="${color.slice(1)}"/></a:solidFill>`;
  const sp = ch.type === 'pie' ? '' : ch.type === 'line' ? `<c:spPr><a:ln w="28575" cap="rnd">${fill}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${fill}</c:spPr></c:marker>`
    : `<c:spPr>${fill}</c:spPr><c:invertIfNegative val="0"/>`;
  const cat = d.refs.cats ? `<c:cat><c:strRef><c:f>${esc(ref(sheet, d.refs.cats))}</c:f>${strCache(d.cats)}</c:strRef></c:cat>` : '';
  const pts = s.values.map((v, k) => (v === null ? '' : `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`)).join('');
  const val = `<c:val><c:numRef><c:f>${esc(ref(sheet, sref.vals))}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.values.length}"/>${pts}</c:numCache></c:numRef></c:val>`; // i18n-ignore: an XLSX format code
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${sp}${cat}${val}${ch.type === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
}

/** The chart part for one chart. */
export function chartXml(ch, d) {
  const sers = d.series.slice(0, ch.type === 'pie' ? 1 : MAX_SERIES).map((s, i) => seriesXml(ch, d, s, i)).join('');
  const axIds = '<c:axId val="111"/><c:axId val="222"/>';
  let plot;
  if (ch.type === 'pie') plot = `<c:pieChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/></c:pieChart>`;
  else if (ch.type === 'line') plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axIds}</c:lineChart>`;
  else plot = `<c:barChart><c:barDir val="${ch.type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="60"/>${axIds}</c:barChart>`;
  if (ch.type !== 'pie') {
    const horiz = ch.type === 'bar';
    plot += `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="low"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>` +
      `<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'b' : 'l'}"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  }
  const title = ch.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>';
  const legend = ch.legend !== false ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : '';
  return doc(`<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`);
}

export function chartParts(wb) {
  const entries = [], types = [], sheets = new Map();
  let drawings = 0, charts = 0;
  wb.sheets.forEach((sh, si) => {
    const list = (sh.charts || []).map((ch) => ({ ch, d: chartData(wb, sh, ch) })).filter((x) => !x.d.error);
    if (!list.length) return;
    const dn = ++drawings, anchors = [], rels = [];
    const colW = (c) => sh.colW(c), rowH = (r) => sh.rowH(r);
    list.forEach(({ ch, d }, k) => {
      const n = ++charts, rid = `rId${k + 1}`;
      entries.push({ path: `xl/charts/chart${n}.xml`, data: chartXml(ch, d) });
      types.push(`<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      rels.push(`<Relationship Id="${rid}" Type="${REL}chart" Target="../charts/chart${n}.xml"/>`);
      const a = [along(colW, ch.x, 16383), along(rowH, ch.y, 1048575)], b = [along(colW, ch.x + ch.w, 16383), along(rowH, ch.y + ch.h, 1048575)];
      anchors.push(`<xdr:twoCellAnchor editAs="oneCell">${marker('from', a[0], a[1])}${marker('to', b[0], b[1])}` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="${escAttr(ch.title || 'Chart ' + (k + 1))}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
    });
    entries.push({ path: `xl/drawings/drawing${dn}.xml`, data: doc(`<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">${anchors.join('')}</xdr:wsDr>`) });
    entries.push({ path: `xl/drawings/_rels/drawing${dn}.xml.rels`, data: doc(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`) });
    entries.push({ path: `xl/worksheets/_rels/sheet${si + 1}.xml.rels`, data: doc(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}drawing" Target="../drawings/drawing${dn}.xml"/></Relationships>`) });
    types.push(`<Override PartName="/xl/drawings/drawing${dn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    sheets.set(si, dn);
  });
  return { entries, types, sheets };
}
