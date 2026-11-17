// Camera RAW photos (shared/raw/): PhotoSlop's Develop dialog, Slop Gallery's thumbnails and viewer, File convert's RAW to
// JPG/PNG/WebP and Slop Resize. Every claim is what the code does: SlopRaw reads CR2, CR3, CRW, NEF, NRW, ARW, SR2, DNG,
// RAF, ORF, RW2, RWL, PEF, SRW, 3FR and more; the embedded JPEG preview is instant; the full develop is LibRaw 0.22.1 in
// WebAssembly, downloaded once (about 1.4 MB) after a notice, with white balance, exposure and highlight options.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-raw*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'photoslop', slug: 'open-raw-files' },
  { app: 'gallery', slug: 'raw-photo-viewer', faq: [['@seo.task.photoslop.open-raw-files.faq.1.0', '@seo.task.photoslop.open-raw-files.faq.1.1']] },
  {
    app: 'convert',
    slug: 'dng-converter',
    faq: [
      ['@seo.task.photoslop.open-raw-files.faq.0.0', '@seo.task.photoslop.open-raw-files.faq.0.1'],
      ['@seo.task.photoslop.open-raw-files.faq.1.0', '@seo.task.photoslop.open-raw-files.faq.1.1'],
    ],
  },
  {
    app: 'resize',
    slug: 'resize-raw-photos',
    faq: [
      ['@seo.task.photoslop.open-raw-files.faq.0.0', '@seo.task.photoslop.open-raw-files.faq.0.1'],
      ['@seo.task.photoslop.open-raw-files.faq.1.0', '@seo.task.photoslop.open-raw-files.faq.1.1'],
    ],
  },
];
