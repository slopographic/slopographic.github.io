// Documents family, part 4: Slop EML (eml): open email files and mailboxes, convert them, combine them. No preset.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-documents-4*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'eml', slug: 'open-eml-file', cta: '@seo.task.eml.open-eml-file.crumb' },
  { app: 'eml', slug: 'eml-to-pdf' },
  { app: 'eml', slug: 'combine-emails-to-pdf', h1: '@seo.task.eml.combine-emails-to-pdf.crumb' },
  { app: 'eml', slug: 'mbox-to-pdf' },
];
