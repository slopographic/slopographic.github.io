// Task pages for the creative apps, part 2: Slop Watermark, Slop Effects, Slop Image to 3D, Slop 3D, Slop Gallery and
// Slop Photo Sorter (see index.mjs for the shape of a task). None of these pages uses a `query` preset.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-creative-2*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'watermark', slug: 'add-logo-to-photos', cta: '@seo.task.watermark.add-logo-to-photos.crumb' },
  { app: 'watermark', slug: 'repeating-watermark' },
  { app: 'effects', slug: 'text-animation-maker' },
  { app: 'effects', slug: 'glitch-effect-video' },
  { app: 'effects', slug: 'after-effects-alternative' },
  { app: 'img3d', slug: 'photo-to-3d-model' },
  { app: '3d', slug: 'glb-viewer' },
  { app: '3d', slug: 'glb-to-obj' },
  { app: 'gallery', slug: 'duplicate-photo-finder', faq: [null, null, ['@seo.task.watermark.add-logo-to-photos.faq.2.0']] },
  { app: 'gallery', slug: 'private-photo-organizer' },
  { app: 'sorter', slug: 'cull-photos', faq: [null, null, null, ['@seo.task.watermark.add-logo-to-photos.faq.2.0']] },
];
