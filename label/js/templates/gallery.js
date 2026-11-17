/* SlopLabel — templates/gallery: ready-made labels to start from (shipping 4×6, product EAN-13,
 * GS1-128 SSCC pallet label, asset tag with QR, name badge, Avery 5160 address merge). */
'use strict';

const T = (type, props) => makeObject(type, props);
// Auto-sized text aligned right/centre anchors at x (zero-width box), so x is the right edge / centre.
const tx = (x, y, content, size = 10, more = {}) => T('text', Object.assign({ x, y, content, size }, more.fit !== 'box' && (more.align === 'right' || more.align === 'center') ? { w: 0 } : {}, more));
const hline = (x, y, w, s = 0.5) => T('line', { x, y: y - s / 2, w, h: s, stroke: s, dir: 'h', name: 'Rule' });
const vline = (x, y, h, s = 0.5) => T('line', { x: x - s / 2, y, w: s, h, stroke: s, dir: 'v', name: 'Rule' });

const SAMPLE_ADDRESSES = [
  ['Name', 'Address', 'City', 'State', 'ZIP'],
  ['Ada Lovelace', '12 Analytical Way', 'Portland', 'OR', '97201'], ['Grace Hopper', '1 Compiler Ct, Apt 4', 'Arlington', 'VA', '22201'],
  ['Alan Turing', '42 Enigma Rd', 'Boston', 'MA', '02108'], ['Katherine Johnson', '7 Orbit Ave', 'Hampton', 'VA', '23669'],
  ['Linus Torvalds', '256 Kernel St', 'Beaverton', 'OR', '97005'], ['Margaret Hamilton', '11 Apollo Blvd', 'Cambridge', 'MA', '02139'],
  ['Tim Berners-Lee', '80 Hypertext Ln', 'Seattle', 'WA', '98101'], ['Hedy Lamarr', '5 Frequency Hop', 'Los Angeles', 'CA', '90001'],
  ['Dennis Ritchie', '99 Pointer Pl', 'Summit', 'NJ', '07901'], ['Barbara Liskov', '3 Substitution Sq', 'Newton', 'MA', '02458'],
  ['Claude Shannon', '1 Information Dr', 'Ann Arbor', 'MI', '48103'], ['Radia Perlman', '15 Spanning Tree', 'Redmond', 'WA', '98052'],
];

const TEMPLATES = [
  { id: 'shipping', name: 'Shipping label 4 × 6"', desc: 'Sender, recipient, postal GS1-128 and a Code 128 tracking barcode', build() {
    const d = newDoc({ stock: stockById('roll-4x6'), unit: 'in', name: 'Shipping label 4x6' });
    d.vars.push(makeVar('prompt', 'Tracking', { prompt: 'Tracking number', def: '1Z999AA10123456784', required: true }),
      makeVar('prompt', 'Weight', { prompt: 'Weight (kg)', def: '2.4' }), makeVar('prompt', 'Reference', { prompt: 'Order reference', def: 'SO-104233' }),
      makeVar('date', 'ShipDate', { format: 'DD MMM YYYY' }), makeVar('prompt', 'ShipToZIP', { prompt: 'Recipient ZIP', def: '10001', pattern: '\\d{5}' }));
    d.objects.push(
      tx(4, 4, 'FROM', 7, { bold: true }),
      T('para', { x: 4, y: 8, w: 62, h: 18, size: 9, content: '**Slopographic Fulfilment**\n400 Goo Street, Unit 7\nPortland OR 97209 · USA', shrink: true }),
      T('rect', { x: 71, y: 4, w: 26.6, h: 22, fill: 'black', radius: 1.5, name: 'Service box' }),
      tx(71, 6.5, '2', 34, { bold: true, color: 'white', fit: 'box', w: 26.6, h: 13, align: 'center', name: 'Service' }),
      tx(71, 19.5, 'DAY AIR', 8, { bold: true, color: 'white', fit: 'box', w: 26.6, h: 4, align: 'center' }),
      hline(0, 30, 101.6, 0.8),
      tx(4, 33, 'SHIP TO', 7, { bold: true }),
      T('para', { x: 10, y: 38, w: 86, h: 34, size: 14, content: '**ROSALIND FRANKLIN**\nHelix Labs, Receiving Dock B\n51 Double Street\nNEW YORK NY {ShipToZIP}', shrink: true, lineSpacing: 1.18 }),
      hline(0, 76, 101.6, 0.8),
      T('barcode', { x: 4, y: 80, symbology: 'gs1-128', content: '(420){ShipToZIP}', module: 0.375, barHeight: 15, hr: 'below', hrSize: 7, quiet: false, name: 'Postal barcode' }),
      tx(62, 81, 'ZIP', 7, { bold: true }), tx(62, 85, '{ShipToZIP}', 26, { bold: true, font: 'sans', name: 'ZIP' }),
      hline(0, 104, 101.6, 0.8),
      tx(4, 107, 'TRACKING #', 7, { bold: true }), tx(28, 106.2, '{Tracking}', 10, { bold: true, font: 'mono', name: 'Tracking text' }),
      T('barcode', { x: 50.8, y: 112, align: 'center', symbology: 'code128', content: '{Tracking}', module: 0.375, barHeight: 24, hr: 'none', quiet: true, name: 'Tracking barcode' }),
      hline(0, 141, 101.6, 0.8),
      tx(4, 144, 'REF {Reference}', 8, { name: 'Reference' }), tx(42, 144, 'WT {Weight} KG', 8, { name: 'Weight' }), tx(97.6, 144, '{ShipDate}', 8, { align: 'right', name: 'Ship date' }));
    d.objects.forEach((o) => syncAutoSize(d, o, previewResolver(d)));
    d.objects.find((o) => o.name === 'Tracking barcode').x = 50.8 - d.objects.find((o) => o.name === 'Tracking barcode').w / 2;
    return d;
  } },
  { id: 'product', name: 'Product label 58 × 40 mm', desc: 'Name, EAN-13, price and SKU — ready to merge from a price list', build() {
    const d = newDoc({ stock: stockById('roll-58x40'), unit: 'mm', name: 'Product label' });
    d.vars.push(makeVar('prompt', 'Product', { prompt: 'Product name', def: 'Sloppo Lime Goo — Original 250 ml' }), makeVar('prompt', 'EAN', { prompt: 'EAN-13 (12 or 13 digits)', def: '4006381333931', pattern: '\\d{12,13}' }),
      makeVar('prompt', 'Price', { prompt: 'Price', def: '4.99' }), makeVar('prompt', 'SKU', { prompt: 'SKU', def: 'SLP-250-LIME' }));
    d.objects.push(
      T('para', { x: 2.5, y: 2.5, w: 53, h: 10, size: 10, bold: true, content: '{Product}', shrink: true, name: 'Product name' }),
      tx(2.5, 13.2, 'SKU {SKU}', 6.5, { font: 'mono', name: 'SKU' }),
      T('barcode', { x: 1.2, y: 18, symbology: 'ean13', content: '{EAN}', module: 0.25, barHeight: 14, hr: 'below', hrSize: 7, quiet: true, name: 'EAN-13' }),
      tx(55.5, 21, '€', 9, { bold: true, align: 'right', name: 'Currency' }),
      tx(55.5, 26, '{Price}', 20, { bold: true, align: 'right', name: 'Price' }),
      hline(31.5, 17, 24, 0.3));
    d.objects.forEach((o) => syncAutoSize(d, o, previewResolver(d)));
    return d;
  } },
  { id: 'sscc', name: 'GS1-128 pallet label (SSCC)', desc: 'GS1 logistic label: SSCC serial with check digit, GTIN, count, batch and best-before', build() {
    const d = newDoc({ stock: stockById('roll-4x6'), unit: 'mm', name: 'GS1 pallet label' });
    d.vars.push(makeVar('fixed', 'CompanyPrefix', { value: '0950110153' }), makeVar('counter', 'Serial', { start: 1, pad: 6, remember: true }),
      makeVar('formula', 'SSCC', { expr: '{SSCCBody|gs1check}' }), makeVar('formula', 'SSCCBody', { expr: '3{CompanyPrefix}{Serial}' }),
      makeVar('prompt', 'GTIN', { prompt: 'Content GTIN-14', def: '09501101530003', pattern: '\\d{13,14}' }), makeVar('prompt', 'Count', { prompt: 'Cases on pallet', def: '48', pattern: '\\d{1,8}' }),
      makeVar('prompt', 'Batch', { prompt: 'Batch / lot', def: 'B2310A' }), makeVar('date', 'BestBefore', { format: 'YYMMDD', days: 30 }), makeVar('date', 'BestBeforeText', { format: 'DD.MM.YY', days: 30 }));
    d.objects.push(
      T('rect', { x: 0, y: 0, w: 101.6, h: 11, fill: 'black', name: 'Header' }),
      tx(4, 2.6, 'SLOP FOODS LTD', 12, { bold: true, color: 'white' }), tx(97.6, 3.6, 'Goo Street 1 · Slopton', 8, { color: 'white', align: 'right' }),
      tx(4, 13, 'SSCC', 7, { bold: true }), tx(4, 16.5, '{SSCC}', 15, { bold: true, font: 'mono', name: 'SSCC text' }),
      hline(0, 25, 101.6, 0.4),
      tx(4, 27, 'CONTENT', 7, { bold: true }), tx(4, 30.5, '{GTIN}', 11, { font: 'mono' }),
      tx(60, 27, 'COUNT', 7, { bold: true }), tx(60, 30.5, '{Count}', 11, { font: 'mono' }),
      tx(4, 37, 'BEST BEFORE (dd.mm.yy)', 7, { bold: true }), tx(4, 40.5, '{BestBeforeText}', 11, { font: 'mono' }),
      tx(60, 37, 'BATCH/LOT', 7, { bold: true }), tx(60, 40.5, '{Batch}', 11, { font: 'mono' }),
      vline(56, 25, 22, 0.4), hline(0, 47, 101.6, 0.4),
      T('barcode', { x: 4, y: 50, symbology: 'gs1-128', content: '(02){GTIN}(37){Count}', module: 0.375, barHeight: 18, hr: 'below', hrSize: 8, quiet: false, name: 'GTIN + count' }),
      T('barcode', { x: 4, y: 77, symbology: 'gs1-128', content: '(15){BestBefore}(10){Batch}', module: 0.375, barHeight: 18, hr: 'below', hrSize: 8, quiet: false, name: 'Date + batch' }),
      T('barcode', { x: 4, y: 108, symbology: 'gs1-128', content: '(00){SSCC}', module: 0.5, barHeight: 30, hr: 'below', hrSize: 9, quiet: false, name: 'SSCC barcode' }));
    d.objects.forEach((o) => syncAutoSize(d, o, previewResolver(d)));
    for (const o of d.objects) if (o.type === 'barcode') o.x = round((101.6 - o.w) / 2, 3);
    return d;
  } },
  { id: 'asset', name: 'Asset tag 2 × 1" with QR', desc: 'Serialised asset IDs, a scannable QR link and an inverse header', build() {
    const d = newDoc({ stock: stockById('roll-2x1'), unit: 'in', name: 'Asset tag' });
    d.label.radius = 1;
    d.vars.push(makeVar('counter', 'AssetID', { start: 1201, pad: 5, prefix: 'SLP-', remember: true }), makeVar('formula', 'AssetURL', { expr: 'https://slopographic.com/a/{AssetID}' }));
    d.objects.push(
      T('rect', { x: 0, y: 0, w: 50.8, h: 6, fill: 'black', name: 'Header' }),
      tx(0, 1.2, 'PROPERTY OF SLOPOGRAPHIC', 6.5, { bold: true, color: 'white', fit: 'box', w: 50.8, h: 4, align: 'center' }),
      T('barcode', { x: 1.5, y: 7.4, symbology: 'qrcode', content: '{AssetURL}', module: 0.5, ec: 'M', quiet: false, hr: 'none', name: 'QR' }),
      tx(21, 9, 'ASSET', 6, { bold: true }), tx(21, 12, '{AssetID}', 12, { bold: true, font: 'mono', name: 'Asset ID' }),
      T('para', { x: 21, y: 18.3, w: 28, h: 5.5, size: 5.5, content: 'Scan to report an issue or check this item out.', shrink: true }));
    d.objects.forEach((o) => syncAutoSize(d, o, previewResolver(d)));
    return d;
  } },
  { id: 'badge', name: 'Name badge 4 × 3"', desc: 'Auto-shrinking name, company, role and a contact QR', build() {
    const d = newDoc({ stock: stockById('roll-4x3'), unit: 'in', name: 'Name badge' });
    d.vars.push(makeVar('prompt', 'Name', { prompt: 'Full name', def: 'Sloppo McGooface', required: true }), makeVar('prompt', 'Company', { prompt: 'Company', def: 'Slopographic' }), makeVar('prompt', 'Role', { prompt: 'Role', def: 'Head of Goo' }));
    d.objects.push(
      T('rect', { x: 0, y: 0, w: 101.6, h: 17, fill: 'black', name: 'Header' }),
      tx(0, 2.5, 'HELLO', 22, { bold: true, color: 'white', fit: 'box', w: 101.6, h: 9, align: 'center' }), tx(0, 11, 'my name is', 9, { color: 'white', fit: 'box', w: 101.6, h: 4, align: 'center' }),
      tx(5, 22, '{Name}', 30, { bold: true, fit: 'box', w: 91.6, h: 16, align: 'center', valign: 'middle', shrink: true, name: 'Name' }),
      tx(5, 44, '{Company}', 14, { fit: 'box', w: 68, h: 7, align: 'left', shrink: true, name: 'Company' }),
      tx(5, 53, '{Role}', 10, { italic: true, fit: 'box', w: 68, h: 6, shrink: true, name: 'Role' }),
      T('barcode', { x: 77, y: 47, symbology: 'qrcode', content: 'MECARD:N:{Name};ORG:{Company};;', module: 0.5, ec: 'L', quiet: false, hr: 'none', name: 'Contact QR' }),
      hline(5, 70, 91.6, 0.3), tx(5, 71.5, 'SLOPCON 2026 · ALL ACCESS', 6.5, { bold: true }));
    d.objects.forEach((o) => syncAutoSize(d, o, previewResolver(d)));
    return d;
  } },
  { id: 'address', name: 'Address labels — Avery 5160', desc: '30 per Letter sheet, merged from a sample CSV address list', build() {
    const d = newDoc({ stock: stockById('avery-5160'), unit: 'in', name: 'Address labels 5160' });
    d.label.margin = [1.5, 3, 1.5, 3];
    d.data = tableToSource(SAMPLE_ADDRESSES, 'addresses.csv');
    d.objects.push(T('para', { x: 4, y: 2.5, w: 58.7, h: 20.4, size: 10, valign: 'middle', content: '**{Name}**\n{Address}\n{City}, {State} {ZIP}', shrink: true, lineSpacing: 1.15, name: 'Address' }));
    d.objects.forEach((o) => syncAutoSize(d, o, previewResolver(d)));
    return d;
  } },
];
