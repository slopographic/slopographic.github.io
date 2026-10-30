/* Converter pages (convert/<slug>/) for routes of two conversions (core/chain.js), added to PAGES in pages.js. `conv` is
 * the route key (data-preset): the page runs both steps; its middle tile can switch to another format that ends with the
 * same conversion. shared/seo/convert-copy.mjs writes their head from the same title and description.
 * Every claim is what the steps do (finance.js, heic.js, data-more.js, sheet-json.js, structured.js, the catalog). */
import { withWords } from './page-words.js';
const PRIVATE = ['Are my files uploaded?', 'No. Both steps run in your browser, on this device. Your files are not sent to Slopographic or to any other server.'];
const STEPS = ['Can I keep the file made in between?', 'Yes. Open Options and tick Also keep the in-between files: it is listed with the result.'];

const page = (slug, conv, from, pair, cat, h1, title, description, lead, how, faq, extra = {}) => ({
  slug, conv, from, pair, cat, h1, title, description, lead, how, faq: [...faq, STEPS, PRIVATE], ...extra });

export const CHAIN_PAGES = withWords([
  page('sie-to-json', 'sie-to-csv>csv-to-json', ['sie'], ['SIE', 'JSON'], 'Finance', 'SIE to JSON converter',
    'SIE to JSON converter: vouchers as JSON records, free | File convert',
    'Convert an SIE 4 accounting file to JSON in your browser: SIE to CSV, then CSV to JSON, one object per transaction line. Nothing is uploaded.',
    'Get the transactions of an SIE file as JSON for a script, an API or a database import.',
    ['The SIE file is read first and written as a table, one row per transaction line (voucher, date, account, debit, credit and more). SIE 1 to 3 files give the balances per account instead.',
      'The table then becomes JSON: an array with one object per row, the column names as keys. Tick Write plain numbers as JSON numbers to get amounts as numbers.'],
    [['Why does it go through CSV?', 'The route is SIE to CSV, then CSV to JSON. The tile in the middle switches it to go through Excel instead.']], { appCat: 'FinanceApplication' }),
  page('heic-to-pdf', 'heic-to-jpg>images-to-pdf', ['heic'], ['HEIC', 'PDF'], 'Images', 'HEIC to PDF converter',
    'HEIC to PDF converter: iPhone photos in one PDF, free | File convert',
    'Convert iPhone HEIC and HEIF photos to a PDF in your browser: each photo becomes a JPG, then a page of one PDF. A4, Letter or photo size. No upload.',
    'Send a set of iPhone photos as one PDF: drop them all, and each becomes a page.',
    ['Each HEIC photo is decoded (by Safari itself, or by the HEIC decoder, which the page asks for first) and saved as a JPG, which is placed in the PDF as it is.',
      'Choose A4, US Letter or Fit to each image, and the margin. Switch the tile in the middle to PNG to keep every pixel, at the cost of a larger PDF.'],
    [['Are all the photos in one PDF?', 'Yes. Every photo you drop is a page of the same PDF, in the order of the list.']], { accept: '.heic,.heif,image/heic,image/heif' }),
  page('xlsx-to-yaml', 'xlsx-to-json>json-to-yaml', ['xlsx', 'ods'], ['XLSX', 'YAML'], 'Data', 'Excel (XLSX) to YAML converter',
    'Excel to YAML converter: sheet rows as YAML, free | File convert',
    'Convert Excel (XLSX) and ODS sheets to YAML in your browser: the sheet becomes JSON records, then YAML, the first row naming the keys. Nothing uploaded.',
    'Turn a sheet of settings, translations or test data into YAML that people can read.',
    ['The workbook is read by the same spreadsheet reader as Slop Tables, and each row becomes a record with the column names as keys. Formulas give the values Excel saved.',
      'The records are then written as YAML. Choose Every sheet in step 1 for a key per sheet.'],
    [['Do numbers stay numbers?', 'Yes. Numbers and true or false stay typed, and dates become text such as 2026-10-24.']], { accept: '.xlsx,.ods' }),
  page('pdf-to-webp', 'pdf-to-images>to-webp', ['pdf'], ['PDF', 'WEBP'], 'Images', 'PDF to WebP converter',
    'PDF to WebP converter: every page as a WebP picture, free | File convert',
    'Convert PDF pages to WebP pictures in your browser: each page is drawn at 72, 144 or 216 dpi, then saved as WebP at the quality you choose. No upload.',
    'Get the pages of a PDF as small WebP pictures for a website or a chat.',
    ['Each page is drawn as a picture at the resolution you choose (step 1); type a page range to get only some pages.',
      'Each picture is then saved as WebP (step 2) with the quality and size you choose. Download them one by one or all as a ZIP.'],
    [['Why WebP?', 'WebP pictures are often a third smaller than PNG or JPG at the same look, and every current browser shows them.']], { accept: '.pdf,application/pdf' }),
  page('csv-to-yaml', 'csv-to-json>json-to-yaml', ['csv'], ['CSV', 'YAML'], 'Data', 'CSV to YAML converter',
    'CSV to YAML converter: table rows as YAML items, free | File convert',
    'Convert CSV to YAML in your browser: the table becomes JSON records with the header row as keys, then YAML for a config or data file. Nothing uploaded.',
    'Turn a table into YAML items: one per row, with the column names as keys.',
    ['The CSV is read with its quoting rules (RFC 4180); the separator is detected. Each row becomes a record.',
      'The records are then written as YAML. Tick Write plain numbers as JSON numbers in step 1 so numbers are not quoted.'],
    [['What if my CSV has no header row?', 'Untick First row has column names: each row becomes a list of values.']]),
  page('ics-to-xlsx', 'ics-to-csv>csv-to-xlsx', ['ics'], ['ICS', 'XLSX'], 'Data', 'Calendar (ICS) to Excel converter',
    'ICS to Excel converter: calendar events as a sheet, free | File convert',
    'Convert an .ics calendar to an Excel (XLSX) sheet in your browser: the events become a CSV table, then a workbook with one row per event. Nothing uploaded.',
    'Get the events of a calendar export as a spreadsheet you can sort, filter and share.',
    ['The .ics file is read by the same calendar reader as Slop Calendar and each event becomes a row: title, start, end, all day, location and notes.',
      'The table is then written as an XLSX workbook.'],
    [['Which calendars export ICS?', 'Google Calendar, Apple Calendar and Outlook all export a calendar as an .ics file.']], { accept: '.ics,text/calendar' }),
]);
