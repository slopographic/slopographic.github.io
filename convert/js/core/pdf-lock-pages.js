/* Converter pages (convert/<slug>/) for the PDF password conversions (core/pdf-lock.js), added to PAGES in pages.js.
 * Same fields as the other pages; shared/seo/convert-copy.mjs writes their head from the same title and description.
 * Every claim is what the code does (shared/pdf-crypto/: AES-256, R 6; the permissions; decryption of RC4 and AES files). */
import { withWords } from './page-words.js';
const PRIVATE = ['Is my PDF or my password uploaded?', 'No. The PDF is encrypted or decrypted in your browser, on this device. Neither the file nor the password is sent to Slopographic or to any other server, and the password is forgotten after Convert.'];

export const PDF_LOCK_PAGES = withWords([
  { slug: 'password-protect-pdf', conv: 'pdf-protect', from: ['pdf'], accept: '.pdf,application/pdf', pair: ['PDF', 'PDF'], cat: 'Documents',
    h1: 'Password protect a PDF',
    title: 'Password protect PDF with AES-256, free, on your device | File convert',
    description: 'Add a password to a PDF in your browser with AES-256 encryption. Choose whether it can be printed, copied or edited. The file is never uploaded.',
    lead: 'Lock a PDF with a password before you email or share it. The encryption runs on this device, so the file and the password never leave it.',
    how: ['Drop the PDF and open Options. Type the password twice.',
      'Untick what readers may not do once the file is open: printing, copying text and pictures, or editing pages, text and comments.',
      'Press Convert. Every string and stream of the PDF is encrypted with AES-256 (the PDF 2.0 standard security handler), and the password fields are cleared.'],
    faq: [['How strong is the encryption?', 'AES-256 with the PDF 2.0 password hashing, the strongest encryption PDF has. A long password that is not used anywhere else is what keeps the file safe.'],
      ['Which apps open the protected PDF?', 'Any current PDF reader: Adobe Acrobat and Reader, Apple Preview, Chrome, Edge, Firefox and the Slop PDF editor ask for the password and open it.'],
      ['Do the print and copy limits always hold?', 'Readers that follow the PDF rules, such as Acrobat, Preview and browsers, apply them. They are a request to the reader app, not a lock like the password itself.'],
      ['What if I forget the password?', 'The file cannot be opened. There is no recovery: keep a copy of the original PDF or of the password somewhere safe.'], PRIVATE] },
  { slug: 'remove-password-from-pdf', conv: 'pdf-unlock', from: ['pdf'], accept: '.pdf,application/pdf', pair: ['PDF', 'PDF'], cat: 'Documents',
    h1: 'Remove the password from a PDF',
    title: 'Remove password from PDF: unlock a PDF you can open, free | File convert',
    description: 'Remove the password from a PDF you can open, in your browser: type it once and save a copy with no password and no print or copy limits. No upload.',
    lead: 'Tired of typing the password every time? Make a copy of the PDF that opens straight away, on this device.',
    how: ['Drop the protected PDF, open Options and type the password that opens it. A PDF that opens without a password but blocks printing or copying needs none.',
      'Press Convert. Every string and stream is decrypted and the file is saved again without its encryption. The password field is cleared.'],
    faq: [['Can it remove a password I do not know?', 'No. You need the password that opens the PDF; this is not a password cracker.'],
      ['Which encryption does it read?', 'The standard PDF password handler in every version: RC4 40 and 128-bit, AES-128 and AES-256. PDFs locked to a certificate or a rights-management server cannot be opened.'],
      ['Are the print and copy limits removed too?', 'Yes. The copy has no encryption, so readers no longer limit printing, copying or editing.'], PRIVATE] },
]);
