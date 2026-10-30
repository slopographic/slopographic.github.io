// Task pages for the creative apps, part 1: PhotoSlop, Paint Classic, SlopVector, Slop Resize and Slop Upscale (see
// index.mjs for the shape of a task; parts 2 and 3 are creative-2.mjs and creative-3.mjs). Presets in `query` must be
// read by the app. Slop Resize reads w, h, kb, scale, long, fill, resample and format (resize/js/app/settings.js presetOf).
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-creative*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'photoslop', slug: 'psd-viewer' },
  { app: 'photoslop', slug: 'remove-blemishes' },
  { app: 'photoslop', slug: 'deep-fry-meme' },
  { app: 'photoslop', slug: 'photoshop-alternative' },
  { app: 'paint-classic', slug: 'ms-paint-online' },
  { app: 'vector', slug: 'svg-editor-online' },
  { app: 'vector', slug: 'svg-to-png' },
  { app: 'vector', slug: 'illustrator-alternative', faq: [[null, '@seo.task.photoslop.photoshop-alternative.faq.0.1']] },
  { app: 'resize', slug: 'bulk-image-resizer', query: 'long=1920&format=jpg' },
  { app: 'resize', slug: 'compress-image-to-100kb', query: 'kb=100&format=jpg' },
  { app: 'resize', slug: 'resize-video', cta: '@seo.task.resize.resize-video.crumb', query: 'long=1920' },
  { app: 'resize', slug: 'pixel-art-scaler', query: 'scale=400&resample=nearest&format=png' },
  { app: 'upscale', slug: 'upscale-image-4x' },
  { app: 'upscale', slug: 'upscale-video', h1: '@seo.task.upscale.upscale-video.crumb', faq: [['@seo.task.resize.resize-video.faq.0.0']] },
];
