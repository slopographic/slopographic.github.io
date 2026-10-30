/* Converter pages (convert/<slug>/) for Word and PowerPoint files, added to PAGES in pages.js; shared/seo/convert-copy.mjs
 * writes their head from the same title and description. Every claim is what the code does (core/office.js with the
 * Slop Docs engine, core/slides-out.js with the Slop Slides engine). */
import { withWords } from './page-words.js';
const PRIVATE = ['Are my files uploaded?', 'No. The conversion runs in your browser, on this device. Your files are not sent to Slopographic or to any other server.'];
const DOCX = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCS_READS = 'The file is read by the Slop Docs engine: paragraphs, headings, bold, italic, underline, colours, fonts, lists, tables, links, page size, margins, headers and footers. Pictures, footnotes, comments and tracked changes are not carried over yet.';
const SLIDES_READS = 'The file is read by the Slop Slides engine: text, shapes, pictures, tables, backgrounds and the theme. Charts, SmartArt, video and sound are left out, and the status line counts them.';
const SCRIPTS = 'Text in Arabic, Hebrew, Chinese, Hindi and other writing systems is set with a Noto font for that script, downloaded once after the page asks.';
const OLD = ['What about old .doc and .ppt files?', 'Those older binary formats are not read here. Save them as .docx or .pptx in Word, PowerPoint or LibreOffice first.'];
const word = (slug, conv, to, rest) => ({ slug, conv, from: ['docx'], accept: DOCX, cat: 'Documents', pair: ['DOCX', to], ...rest });
const ppt = (slug, conv, to, rest) => ({ slug, conv, from: ['pptx'], accept: PPTX, cat: 'Documents', pair: ['PPTX', to], ...rest });

export const OFFICE_PAGES = withWords([
  word('docx-to-pdf', 'docx-to-pdf', 'PDF', { h1: 'DOCX to PDF converter',
    title: 'DOCX to PDF converter, free and private, in your browser | File convert',
    description: 'Convert DOCX files to PDF in your browser: headings, lists, tables and links laid out on real pages, in any language. Nothing is uploaded to a server.',
    lead: 'Turn a Word .docx file into a PDF with selectable text, bookmarks for the headings and working links, on this device.',
    how: [DOCS_READS, 'Keep the page size from the document, or choose A4 or US Letter.', SCRIPTS],
    faq: [['Will the PDF look exactly like Word?', 'Close, not identical. The layout is done by Slop Docs with metric-compatible fonts (Carlito for Calibri, Tinos for Times New Roman and so on), so lines can break in slightly different places.'], OLD, PRIVATE] }),
  word('word-to-pdf', 'docx-to-pdf', 'PDF', { h1: 'Word to PDF converter',
    title: 'Word to PDF: save a Word document as PDF without Word | File convert',
    description: 'Save a Microsoft Word document as a PDF without Word or an upload. The text stays real text, links stay links, and Arabic or Chinese text gets its font.',
    lead: 'No Word on this computer? Drop the document here and get a PDF that prints and shares the way it should, made in your browser.',
    how: ['Drop one or more Word documents (.docx). Each becomes its own PDF; download them one by one or all as a ZIP.', DOCS_READS, SCRIPTS],
    faq: [['Do I need Microsoft Word?', 'No. The document is read and laid out in your browser by the Slop Docs engine, so it works on any computer, tablet or phone with a modern browser.'], OLD, PRIVATE] }),
  word('docx-to-html', 'docx-to-html', 'HTML', { h1: 'DOCX to HTML converter',
    title: 'DOCX to HTML converter: clean HTML from Word documents | File convert',
    description: 'Convert a Word DOCX file to clean HTML in your browser: headings, lists, tables, links, bold and italic, with no Word styling clutter. Nothing is uploaded.',
    lead: 'Get plain, tidy HTML from a Word document: real headings, lists and tables, without the inline styles Word adds when it saves a web page.',
    how: ['Drop a .docx file. Choose a full web page with a small stylesheet, or just the body to paste into a site or a CMS.', 'Right-to-left paragraphs (Arabic, Hebrew) get dir="auto", so they read the right way. Pictures are not carried over yet.'],
    faq: [['Is the HTML editable?', 'Yes. It is ordinary HTML: h1 to h6, p, ul and ol, table, a, strong and em, so any editor or CMS can take it.'], OLD, PRIVATE] }),
  word('docx-to-markdown', 'docx-to-md', 'MD', { h1: 'DOCX to Markdown converter',
    title: 'DOCX to Markdown converter: Word to .md with tables | File convert',
    description: 'Convert Word DOCX files to Markdown in your browser: headings, nested lists, bold, italic, links and simple tables as GitHub pipe tables. Nothing is uploaded.',
    lead: 'Move a Word document into a README, a wiki or a static site: get Markdown that keeps the structure and drops the formatting noise.',
    how: ['Drop a .docx file. Headings become # lines, lists keep their nesting, links become [text](address) and tables become pipe tables.', 'Underline, colours, fonts and pictures are left out: standard Markdown has no way to say them.'],
    faq: [['Which Markdown flavour?', 'CommonMark with GitHub tables and ~~strikethrough~~. Characters that Markdown would read as formatting are escaped with a backslash.'], OLD, PRIVATE] }),
  word('docx-to-text', 'docx-to-text', 'TXT', { h1: 'DOCX to text converter',
    title: 'DOCX to TXT: extract the plain text from a Word file | File convert',
    description: 'Extract the plain text from Word DOCX files in your browser, one line per paragraph and table cell, in UTF-8 for any language. Your files are never uploaded.',
    lead: 'Get just the words out of a Word document, for search, a translation tool or a script, without opening Word.',
    how: ['Drop one or more .docx files. Each paragraph becomes a line; table cells come one per line in reading order.', 'The text is saved as UTF-8, so Swedish, Arabic, Chinese and every other script stay as they were.'],
    faq: [['Are headers and footers included?', 'No. The text is the body of the document: its paragraphs, lists and tables.'], OLD, PRIVATE] }),
  ppt('pptx-to-pdf', 'pptx-to-pdf', 'PDF', { h1: 'PPTX to PDF converter',
    title: 'PPTX to PDF converter, one page per slide, in your browser | File convert',
    description: 'Convert PPTX presentations to PDF in your browser: one page per slide with vector shapes, pictures and real, searchable text in any language. No upload.',
    lead: 'Share or print a PowerPoint deck as a PDF, made on this device, with text you can still select and search.',
    how: [SLIDES_READS, 'Each visible slide becomes one page at the slide size. Tick "Include hidden slides" to keep those too.', SCRIPTS],
    faq: [['Are animations kept?', 'No. A PDF has no animations: each slide is drawn as it looks once all its animations have played.'], OLD, PRIVATE] }),
  ppt('powerpoint-to-pdf', 'pptx-to-pdf', 'PDF', { h1: 'PowerPoint to PDF converter',
    title: 'PowerPoint to PDF: save slides as PDF without PowerPoint | File convert',
    description: 'Save a PowerPoint presentation as a PDF without PowerPoint or an upload. Slides keep their shapes, pictures and text, and other scripts get their font.',
    lead: 'No PowerPoint on this computer? Drop the presentation here and get a PDF of the slides, made in your browser.',
    how: ['Drop one or more .pptx files. Each becomes its own PDF; download them one by one or all as a ZIP.', SLIDES_READS, SCRIPTS],
    faq: [['Do I need Microsoft PowerPoint?', 'No. The deck is read and drawn by the Slop Slides engine in your browser, so it works without Office.'], OLD, PRIVATE] }),
  ppt('pptx-to-images', 'pptx-to-images', 'PNG', { h1: 'PPTX to images converter',
    title: 'PPTX to images: every slide as a PNG picture, free | File convert',
    description: 'Convert a PowerPoint PPTX deck to images in your browser: every slide as a sharp PNG at 1×, 2× or 3× size, packed in one ZIP. Nothing is uploaded.',
    lead: 'Get each slide as a picture for a website, a chat, a video editor or a thumbnail, without opening PowerPoint.',
    how: ['Drop a .pptx file and choose the picture size: 1× is 960 pixels wide for a 16:9 deck, 2× is 1920 and 3× is 2880.', 'You get one ZIP with a PNG for each visible slide, numbered in order.', SLIDES_READS],
    faq: [['Can I get JPG instead?', 'Pick PowerPoint to PDF and then PDF to images, or convert the PNG files to JPG here afterwards.'], OLD, PRIVATE] }),
  ppt('pptx-to-text', 'pptx-to-text', 'TXT', { h1: 'PPTX to text converter',
    title: 'PPTX to TXT: slide text and speaker notes as plain text | File convert',
    description: 'Extract the text from a PowerPoint PPTX deck in your browser: each slide’s title and text in reading order, plus the speaker notes if you like. No upload.',
    lead: 'Turn a presentation into an outline: the words of every slide, in order, ready for a document, a translation or a script.',
    how: ['Drop a .pptx file. Each slide becomes a "Slide n" block with its title first, then the rest top to bottom; tables come one row per line.', 'Speaker notes are included unless you untick them.'],
    faq: [['Is the text in pictures read?', 'No. Text that is part of a picture needs OCR; try Slop OCR for that.'], OLD, PRIVATE] }),
]);
