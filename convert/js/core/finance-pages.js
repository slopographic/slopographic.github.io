/* The finance converter pages (convert/<slug>/), added to PAGES in pages.js. Same fields as the other pages. Every claim
 * here is what core/finance.js and the shared readers (shared/finance/) do: the formats and versions read, the sheets
 * and columns written, the checks made. */
import { withWords } from './page-words.js';
const cat = 'Finance';
const STATUS = 'After converting, the status line gives the counts and the totals, and any note from the reader, such as a voucher that does not balance or balances that do not add up.';
const SEP_Q = ['Will Excel read the amounts as numbers?', 'Choose comma for an English Excel. For Excel in Swedish, German or another language with a decimal comma, choose semicolon: the amounts are then written 1234,50. The file starts with a BOM so letters such as å, ä and ö show correctly.'];
const UPLOAD_Q = ['Is my file uploaded?', 'No. The file is read by this page in your browser and the result is made on your device. Nothing is sent to Slopographic or to anyone else.'];
const COLUMNS = 'Each transaction becomes one row: date, value date, amount (money in positive, money out negative), currency, text, counterparty, reference, type, status and the bank’s id.';

export const FINANCE_PAGES = withWords([
  { slug: 'sie-to-xlsx', conv: 'sie-to-xlsx', from: ['sie'], pair: ['SIE', 'XLSX'], cat, h1: 'SIE to Excel (XLSX) converter',
    title: 'SIE to Excel: open an SIE file as a workbook, free | File convert',
    description: 'Convert an SIE file (type 1, 2, 3, 4 or 4I) to an Excel workbook with vouchers, accounts and balances. Runs in your browser; nothing is uploaded.',
    lead: 'An SIE file is the export Swedish accounting programs make for the accountant, the auditor or another program. Turn it into a workbook you can filter, sum and print.',
    how: ['Drop the .se or .si file. SIE types 1 to 4 and 4I are read, in the PC8 character set (code page 437) the standard asks for, and in UTF-8 or Windows-1252 when a program wrote those instead.',
      'The workbook has an Info sheet (company, organisation number, program, years, checksum), Vouchers with one row per transaction line, Accounts, and Balances with the opening and closing balance and the result per account and year. Period balances get a Periods sheet.',
      STATUS],
    faq: [['Which SIE versions are read?', 'The SIE file format as described in SIE 4C (2025) and 4B (2008), which describe the same format: types 1, 2, 3, 4 (export) and 4I (import). Older files read the same way.'],
      ['What happens to added and removed lines?', 'An added line (#RTRANS) is listed once, marked Added line. A removed line (#BTRANS) is listed with its old amount in the note, and is not counted.'],
      ['Is the checksum checked?', 'Yes. When the file has a #KSUMMA checksum it is worked out again, and the Info sheet says whether it matches.'],
      ['Are dates and amounts real Excel values?', 'Yes. Dates are Excel dates and amounts are numbers, so sums and filters work. Debit and credit have their own columns, and Amount is signed: debit positive, credit negative.']] },
  { slug: 'sie-to-csv', conv: 'sie-to-csv', from: ['sie'], pair: ['SIE', 'CSV'], cat, h1: 'SIE to CSV converter',
    title: 'SIE to CSV: SIE vouchers as a table, free, in your browser | File convert',
    description: 'Turn an SIE 4 file into a CSV with one row per transaction line: voucher, date, account, debit and credit. SIE 1 to 3 give the balances. Nothing is uploaded.',
    lead: 'Get the transactions of an SIE file as a plain table for a spreadsheet, a database or your own script.',
    how: ['Drop the .se or .si file. The character set is worked out from the file: PC8 (code page 437), UTF-8 or Windows-1252.',
      'Each transaction line becomes a row: series, number, date and text of the voucher, then the account and its name, debit, credit, signed amount, the line’s own date and text, objects (dimension:object) and quantity.',
      'An SIE 1, 2 or 3 file has no vouchers, so its CSV holds the balances per account instead: opening, closing and result for each year in the file.'],
    faq: [SEP_Q, ['Are vouchers that do not balance kept?', 'Yes. Every line is written, and the Note column says Voucher does not balance, so you can find it.'], UPLOAD_Q] },
  { slug: 'ofx-to-csv', conv: 'bank-to-csv', from: ['ofx'], pair: ['OFX', 'CSV'], cat, h1: 'OFX to CSV converter',
    title: 'OFX to CSV: bank and card statements as a table, free | File convert',
    description: 'Convert OFX and QFX bank or credit card downloads to CSV in your browser. OFX 1.x (SGML) and 2.x (XML) are both read. Nothing is uploaded.',
    lead: 'Banks offer OFX (or QFX, for Quicken) downloads. Turn one into a CSV that any spreadsheet or bookkeeping program opens.',
    how: ['Drop the .ofx or .qfx file. Both kinds are read: OFX 1.x (SGML, the older download) and OFX 2.x (XML).', COLUMNS,
      'Bank and credit card statements are read. Pending lines are left out, because the bank has not settled them yet.'],
    faq: [['Which date is used?', 'The date the bank posted the line (DTPOSTED). The value date (DTAVAIL) has its own column when the bank sends it.'],
      ['Is the sign of the amount right?', 'Amounts are as the bank signs them: OFX says money in is positive and money out negative, whatever the transaction type.'], SEP_Q] },
  { slug: 'qif-to-csv', conv: 'bank-to-csv', from: ['qif'], pair: ['QIF', 'CSV'], cat, h1: 'QIF to CSV converter',
    title: 'QIF to CSV: Quicken files as a table, free, in your browser | File convert',
    description: 'Convert QIF files from Quicken, Microsoft Money and bank exports to CSV in your browser. Bank, cash and card sections are read. Nothing is uploaded.',
    lead: 'QIF is the old Quicken format that many banks and money programs still export. Turn it into a CSV you can open anywhere.',
    how: ['Drop the .qif file. Bank, Cash, CCard and other asset or liability sections are read; category and investment sections are skipped.', COLUMNS,
      'QIF dates have no fixed order. Month first is assumed, as Quicken writes them, unless a date in the file has a first number above 12; then day first is used.'],
    faq: [['What about split transactions?', 'A split transaction stays one row with its total amount. The category of the whole transaction is kept.'],
      ['Why is the currency column empty?', 'QIF files do not say which currency they are in, so the column is left empty.'], SEP_Q] },
  { slug: 'camt053-to-xlsx', conv: 'bank-to-xlsx', from: ['camt053'], pair: ['CAMT', 'XLSX'], cat, h1: 'camt.053 to Excel (XLSX) converter',
    title: 'camt.053 viewer: ISO 20022 bank statements to Excel, free | File convert',
    description: 'Open camt.053 bank statements (ISO 20022 XML, version .001.02 and later) as an Excel workbook, with the balances checked. Nothing is uploaded.',
    lead: 'Banks in Europe send statements as camt.053 XML. Open one as a workbook with every entry on a row and the opening and closing balances beside them.',
    how: ['Drop the camt.053 .xml file. The elements are matched by name, so camt.053.001.02 (still the most common) and the later versions read the same way, and so do camt.052 reports and camt.054 notifications.', COLUMNS,
      'The Statement sheet gives the account (IBAN), the period, the opening and closing balance, money in and out, and a check that the opening balance plus the booked entries equals the closing balance.'],
    faq: [['Which text is shown for an entry?', 'The remittance information (Ustrd, or the structured reference), else the additional entry information. The counterparty is the debtor for money in and the creditor for money out.'],
      ['Are pending entries included?', 'Yes, with PDNG in the Status column. They are left out of the balance check, because the closing balance does not hold them.'], UPLOAD_Q] },
  { slug: 'mt940-to-csv', conv: 'bank-to-csv', from: ['mt940'], pair: ['MT940', 'CSV'], cat, h1: 'MT940 to CSV converter',
    title: 'MT940 to CSV: SWIFT bank statements as a table, free | File convert',
    description: 'Convert SWIFT MT940 bank statements (.sta, .940, .txt) to CSV in your browser. German and Dutch statement texts are read. Nothing is uploaded.',
    lead: 'MT940 is the SWIFT statement many banks still send to bookkeeping programs. Turn it into a CSV with one row for each statement line.',
    how: ['Drop the MT940 file (.sta, .mt940, .940 or .txt). One file may hold many statements; every line of every statement is listed.', COLUMNS,
      'The :86: text is read as it stands, and the German (?20 to ?29, ?32 name) and Dutch (/NAME/, /REMI/) layouts are taken apart into text and counterparty.'],
    faq: [['Can I get Excel instead of CSV?', 'Yes. Drop the file on the File convert page and choose Bank statement to Excel (XLSX): the workbook has a Transactions and a Statement sheet.'],
      ['How are reversals shown?', 'A reversal (RC or RD) gets the sign of the money it moves and the word Reversal in the Status column.'], SEP_Q] },
]);
