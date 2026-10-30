// Slop Expenses: what a receipt says, from the lines of text OCR read off its photo (top to bottom). Pure: no page, no
// storage, so the Node tests load it as it is (after shared/data/readtext.js, which reads the amounts and dates).
// Exposes SlopExpenses.receipt = { parse }.
//   parse(lines, { currency, dayFirst }) -> { supplier, date, total, tax, currency, found: [field names] }
//     total and tax are minor units (cents) in `currency`; date is YYYY-MM-DD. A field not found is null.
//   The total is the amount on the line that says so (TOTAL, AMOUNT DUE, SUMMA, ATT BETALA, GESAMT…), the last such line
//   when there are several, never a subtotal; failing that, the largest amount not on a tax line. Tax is the amount on a VAT, tax, MOMS, MwSt,
//   IVA, TVA or GST line (not its rate). The supplier is the first line that reads like a name, not an address or a number.
(function (g) {
  'use strict';
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  const TOTAL = /\b(grand\s*total|total\s*(due|amount|to\s*pay)?|amount\s*(due|paid)|balance\s*due|to\s*pay|summa|att\s*betala|totalt|gesamt(betrag)?|zu\s*zahlen|totale|montant|importe)\b/i;
  const SUB = /\b(sub\s*-?\s*total|delsumma|zwischensumme|netto|net\s*amount)\b/i;
  const TAX = /\b(vat|tax|moms|mwst|ust|iva|tva|gst|hst|pst)\b/i;
  const NOT_NAME = /\b(receipt|kvitto|invoice|faktura|tel|phone|fax|www\.|https?:|@|org\.?\s*nr|vat\s*no|cashier|kassa|table|order|date|time|street|st\.|road|ave)\b/i;
  const SYMBOL = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };

  const RT = () => g.SlopData.readText;   // amounts and dates in text (shared/data/readtext.js)
  const amountsIn = (line) => RT().amountsIn(line);
  const dateIn = (line, dayFirst) => RT().dateIn(line, dayFirst);

  function parse(lines, { currency = null, dayFirst = true } = {}) {
    const L = (lines || []).map((x) => String(x || '').trim()).filter(Boolean);
    let total = null, tax = null, date = null, supplier = null, cur = null;
    for (const line of L) {
      const amounts = amountsIn(line);
      if (amounts.length && TOTAL.test(line) && !SUB.test(line) && !TAX.test(line)) total = amounts[amounts.length - 1];
      else if (amounts.length && TAX.test(line) && !TOTAL.test(line) && tax === null) tax = amounts[amounts.length - 1];
      if (!date) date = dateIn(line, dayFirst);
      if (!cur) { const sym = Object.keys(SYMBOL).find((k) => line.includes(k)); const code = /\b(USD|EUR|GBP|SEK|NOK|DKK|CHF|JPY|CAD|AUD)\b/.exec(line); cur = code ? code[1] : sym ? SYMBOL[sym] : null; }
      if (!supplier && /[a-z]{2}/i.test(line) && !/\d{3,}/.test(line) && !NOT_NAME.test(line) && !TOTAL.test(line) && line.length <= 60) supplier = line.replace(/\s{2,}/g, ' ');
    }
    if (total === null) { const all = L.filter((l) => !TAX.test(l)).flatMap(amountsIn); if (all.length) total = Math.max(...all); }
    if (tax !== null && total !== null && tax >= total) tax = null;   // a tax line's amount above the total is a misread
    const out = { supplier, date, total, tax, currency: cur || currency };
    out.found = ['supplier', 'date', 'total', 'tax'].filter((k) => out[k] !== null);
    return out;
  }

  NS.receipt = { parse };
})(typeof window !== 'undefined' ? window : globalThis);
