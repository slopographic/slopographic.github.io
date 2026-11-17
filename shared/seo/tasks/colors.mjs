// Task pages for Slop Colors (colors/): contrast checker, colour picker from a picture, palette generator, HEX to RGB
// and the other formats. Every step matches the app as it is (colors/index.html, colors/js/*.js). Shape in index.mjs.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-colors*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'colors', slug: 'contrast-checker' },
  { app: 'colors', slug: 'color-picker-from-image', cta: '@seo.task.colors.color-picker-from-image.h1' },
  { app: 'colors', slug: 'color-palette-generator' },
  { app: 'colors', slug: 'hex-to-rgb' },
];
