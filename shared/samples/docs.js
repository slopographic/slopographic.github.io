/* SlopSamples.docs: sample documents for the document and data apps' "Try it with a sample" (an invoice, a price list,
 * a meeting invite), made in the page. Classic script; load after samples.js. Every name and company is made up.
 *   SlopSamples.docs.csv()   -> File   "Price list.csv": a supplier's price list, 24 products
 *   SlopSamples.docs.xlsx()  -> Promise<File>   "Price list.xlsx": the price list and an Orders sheet (dates, money),
 *                                       written with shared/sheets/write.js (loaded on first use)
 *   SlopSamples.docs.pdf()   -> File   "Invoice 2026-118.pdf": a one-page invoice, plain PDF syntax (readable in a hex view)
 *   SlopSamples.docs.ics()   -> File   "Kickoff.ics": a meeting invite
 *   SlopSamples.docs.eml()   -> File   "Kickoff on Thursday.eml": an email with an HTML and a text body, the invite and
 *                                       the invoice attached
 *   SlopSamples.docs.PRODUCTS                   the price list rows: [sku, product, category, unit price, stock] */
(function (g) {
  'use strict';
  const S = g.SlopSamples;
  if (!S || S.docs) return;
  const doc = g.document;
  const here = doc && doc.currentScript ? doc.currentScript.src : '';
  const WRITE = here ? new URL('../sheets/write.js', here).href : '../sheets/write.js';

  const PRODUCTS = [
    ['BW-1001', 'Oat flat white, 1 L', 'Dairy-free', 2.85, 140], ['BW-1002', 'Barista milk, 1 L', 'Dairy', 1.95, 220],
    ['BW-1003', 'Single-origin beans, 1 kg', 'Coffee', 18.5, 64], ['BW-1004', 'House blend beans, 1 kg', 'Coffee', 14.25, 120],
    ['BW-1005', 'Decaf beans, 500 g', 'Coffee', 9.4, 38], ['BW-1006', 'Breakfast tea, 100 bags', 'Tea', 6.8, 75],
    ['BW-1007', 'Green tea, 50 bags', 'Tea', 5.2, 42], ['BW-1008', 'Chai syrup, 750 ml', 'Syrups', 7.9, 30],
    ['BW-1009', 'Vanilla syrup, 750 ml', 'Syrups', 6.6, 55], ['BW-1010', 'Caramel syrup, 750 ml', 'Syrups', 6.6, 48],
    ['BW-1011', 'Hot cups 8 oz, 1000', 'Packaging', 39, 18], ['BW-1012', 'Hot cups 12 oz, 1000', 'Packaging', 46, 22],
    ['BW-1013', 'Lids, 1000', 'Packaging', 21.5, 30], ['BW-1014', 'Paper straws, 500', 'Packaging', 8.75, 60],
    ['BW-1015', 'Napkins, 2000', 'Packaging', 12.9, 25], ['BW-1016', 'Croissant, frozen, 40', 'Bakery', 24, 16],
    ['BW-1017', 'Cinnamon bun, frozen, 30', 'Bakery', 27.5, 12], ['BW-1018', 'Sourdough loaf, 6', 'Bakery', 15.6, 20],
    ['BW-1019', 'Oat cookie, 48', 'Bakery', 19.2, 26], ['BW-1020', 'Hot chocolate, 2 kg', 'Cocoa', 22.4, 14],
    ['BW-1021', 'Descaler, 1 L', 'Cleaning', 11.3, 35], ['BW-1022', 'Grinder cleaner, 430 g', 'Cleaning', 13.95, 19],
    ['BW-1023', 'Milk jug, 600 ml', 'Equipment', 16.5, 9], ['BW-1024', 'Tamper, 58 mm', 'Equipment', 29, 7],
  ];
  const ORDERS = [
    ['SO-3301', [2026, 9, 2], 'Harbor & Pine Café', 'BW-1003', 6], ['SO-3302', [2026, 9, 3], 'Little Fern Bakery', 'BW-1016', 4],
    ['SO-3303', [2026, 9, 7], 'Harbor & Pine Café', 'BW-1012', 2], ['SO-3304', [2026, 9, 9], 'The Reading Room', 'BW-1006', 10],
    ['SO-3305', [2026, 9, 13], 'Corner Cup Co.', 'BW-1001', 36], ['SO-3306', [2026, 9, 15], 'Little Fern Bakery', 'BW-1019', 5],
    ['SO-3307', [2026, 9, 20], 'Corner Cup Co.', 'BW-1004', 8], ['SO-3308', [2026, 9, 22], 'The Reading Room', 'BW-1009', 6],
    ['SO-3309', [2026, 9, 27], 'Harbor & Pine Café', 'BW-1002', 48], ['SO-3310', [2026, 9, 29], 'Northgate Deli', 'BW-1011', 3],
  ];
  const money = (n) => n.toFixed(2);
  const price = (sku) => PRODUCTS.find((p) => p[0] === sku)[3];
  const csvField = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));

  function csv() {
    const rows = [['SKU', 'Product', 'Category', 'Unit price (EUR)', 'In stock'], ...PRODUCTS.map((p) => [p[0], p[1], p[2], money(p[3]), p[4]])];
    return S.file('Price list.csv', rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n', 'text/csv');
  }

  async function xlsx() {
    const { toXlsxBlob } = await import(WRITE);
    const KEY = (r, c) => r * 16384 + c;
    const sheet = (name, head, body, fmts) => {
      const fmt = new Map(), bold = new Set(head.map((_, c) => KEY(0, c)));
      body.forEach((_, i) => Object.entries(fmts).forEach(([c, code]) => fmt.set(KEY(i + 1, +c), code)));
      return { name, rows: [head, ...body], fmt, bold };
    };
    const list = sheet('Price list', ['SKU', 'Product', 'Category', 'Unit price (EUR)', 'In stock'], PRODUCTS.map((p) => p.slice()), { 3: '#,##0.00' });
    const orders = sheet('Orders', ['Order', 'Date', 'Customer', 'SKU', 'Quantity', 'Total (EUR)'],
      ORDERS.map(([id, [y, m, d], who, sku, q]) => [id, new Date(Date.UTC(y, m - 1, d)), who, sku, q, Math.round(q * price(sku) * 100) / 100]),
      { 1: 'yyyy-mm-dd', 5: '#,##0.00' });
    const blob = await toXlsxBlob([list, orders]);
    return S.file('Price list.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /** The invoice's lines: [description, quantity, unit price]. */
  const LINES = [['House blend beans, 1 kg', 8, 14.25], ['Oat flat white, 1 L', 36, 2.85], ['Hot cups 12 oz, 1000', 2, 46], ['Vanilla syrup, 750 ml', 6, 6.6]];
  /** A one-page A4 invoice as plain PDF 1.4 text: Helvetica, an uncompressed content stream and a correct xref table. */
  function pdfText() {
    const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c);
    const ops = [];
    const text = (x, y, size, s, font = 'F1') => ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`);
    const right = (x, y, size, s, font) => text(x - Math.round(String(s).length * size * 0.52), y, size, s, font);
    ops.push('0.33 0.42 0.09 rg 0 806 595 36 re f 1 1 1 rg');
    text(48, 818, 16, 'Brightwater Supply Co.', 'F2');
    ops.push('0 0 0 rg');
    text(48, 760, 26, 'Invoice', 'F2');
    text(48, 738, 10, 'Invoice 2026-118    Date 2026-10-02    Due 2026-11-01');
    text(48, 700, 10, 'Bill to', 'F2');
    ['Harbor & Pine Café', 'Attn. Tom Okafor', '14 Quay Street', 'Port Ellen PE4 2LT'].forEach((s, i) => text(48, 684 - i * 14, 10, s));
    text(330, 700, 10, 'From', 'F2');
    ['Brightwater Supply Co.', '3 Mill Lane, Unit 7', 'Ashby AB1 9QD', 'VAT GB 123 4567 89'].forEach((s, i) => text(330, 684 - i * 14, 10, s));
    ops.push('0.92 0.92 0.88 rg 48 592 499 22 re f 0 0 0 rg');
    text(56, 599, 10, 'Description', 'F2'); right(380, 599, 10, 'Qty', 'F2'); right(460, 599, 10, 'Unit', 'F2'); right(540, 599, 10, 'Amount', 'F2');
    let y = 572, sub = 0;
    for (const [d, q, u] of LINES) {
      const a = q * u; sub += a;
      text(56, y, 10, d); right(380, y, 10, String(q)); right(460, y, 10, money(u)); right(540, y, 10, money(a));
      ops.push(`0.8 0.8 0.78 RG 48 ${y - 8} m 547 ${y - 8} l S`);
      y -= 24;
    }
    const vat = Math.round(sub * 20) / 100;
    [['Subtotal', sub], ['VAT 20%', vat], ['Total due (EUR)', sub + vat]].forEach(([k, v], i) => {
      const bold = i === 2 ? 'F2' : 'F1';
      right(460, y - 10 - i * 18, 10, k, bold); right(540, y - 10 - i * 18, 10, money(v), bold);
    });
    text(48, 120, 9, 'Payment: bank transfer to Brightwater Supply Co., IBAN GB00 BWSC 0000 1234 5678 90, reference 2026-118.');
    text(48, 106, 9, 'Thank you for your order. Questions? accounts@brightwater.example');
    const stream = ops.join('\n');
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`,
      '<< /Title (Invoice 2026-118) /Author (Brightwater Supply Co.) /Producer (Slopographic sample) >>',
    ];
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const at = [];
    objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  }
  /** Text whose characters are all below 256 as one byte each (WinAnsi for the é in Café). */
  function latin1(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  const pdf = () => S.file('Invoice 2026-118.pdf', latin1(pdfText()), 'application/pdf');

  function icsText() {
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Slopographic//Sample//EN', 'METHOD:REQUEST', 'BEGIN:VEVENT',
      'UID:kickoff-2026-11-05@brightwater.example', 'DTSTAMP:20261020T090000Z', 'DTSTART:20261105T140000Z', 'DTEND:20261105T150000Z',
      'SUMMARY:Supply kickoff: Harbor & Pine', 'LOCATION:Harbor & Pine Café\\, 14 Quay Street',
      'DESCRIPTION:Winter menu\\, delivery days and the first order.', 'ORGANIZER;CN=Maya Lindqvist:mailto:maya@brightwater.example',
      'ATTENDEE;CN=Tom Okafor;RSVP=TRUE:mailto:tom@harborpine.example', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  }
  const ics = () => S.file('Kickoff.ics', icsText(), 'text/calendar');

  /** Base64 in lines of 76, for a MIME part. */
  const b64 = (bin) => btoa(bin).replace(/.{76}/g, '$&\r\n');
  const utf8b64 = (s) => b64(String.fromCharCode(...new TextEncoder().encode(s)));
  function emlText() {
    const plain = 'Hi Tom,\n\nThanks for the first order. The invoice is attached, and here is the plan for Thursday:\n\n'
      + '  1. Winter menu: the chai and the new oat milk\n  2. Delivery days (Tuesday and Friday?)\n  3. Your standing order\n\n'
      + 'The invite is attached too. See you at the café at 2 pm.\n\nMaya Lindqvist\nBrightwater Supply Co.\n';
    const html = '<!doctype html><html><body style="font-family:Georgia,serif;font-size:15px;color:#222">'
      + '<p>Hi Tom,</p><p>Thanks for the first order. The invoice is attached, and here is the plan for <b>Thursday</b>:</p>'
      + '<ol><li>Winter menu: the chai and the new oat milk</li><li>Delivery days (Tuesday and Friday?)</li><li>Your standing order</li></ol>'
      + '<p>The invite is attached too. See you at the café at 2&nbsp;pm.</p>'
      + '<p style="color:#556b2f">Maya Lindqvist<br>Brightwater Supply Co.</p></body></html>';
    const A = 'sample-alt-7f3a', M = 'sample-mix-7f3a';
    return [
      'From: Maya Lindqvist <maya@brightwater.example>', 'To: Tom Okafor <tom@harborpine.example>',
      'Cc: Accounts <accounts@brightwater.example>', 'Subject: Kickoff on Thursday: agenda and invoice',
      'Date: Tue, 20 Oct 2026 09:14:00 +0100', 'Message-ID: <kickoff-2026@brightwater.example>', 'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${M}"`, '', `--${M}`, `Content-Type: multipart/alternative; boundary="${A}"`, '',
      `--${A}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', utf8b64(plain),
      `--${A}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', utf8b64(html), `--${A}--`, '',
      `--${M}`, 'Content-Type: text/calendar; charset=utf-8; method=REQUEST; name="Kickoff.ics"',
      'Content-Disposition: attachment; filename="Kickoff.ics"', 'Content-Transfer-Encoding: base64', '', utf8b64(icsText()),
      `--${M}`, 'Content-Type: application/pdf; name="Invoice 2026-118.pdf"', 'Content-Disposition: attachment; filename="Invoice 2026-118.pdf"',
      'Content-Transfer-Encoding: base64', '', b64(pdfText().replace(/[^\x00-\xff]/g, '?')), `--${M}--`, '',
    ].join('\r\n');
  }
  const eml = () => S.file('Kickoff on Thursday.eml', emlText(), 'message/rfc822');

  S.docs = { csv, xlsx, pdf, ics, eml, PRODUCTS };
})(typeof window !== 'undefined' ? window : globalThis);
