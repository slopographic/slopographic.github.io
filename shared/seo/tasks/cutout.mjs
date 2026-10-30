// SlopIsolate (app id cutout): background removal, one picture or hundreds, photos or video. Presets read by the app:
// bg=transparent|white|blur (the background new images start with), format=png|jpg|webp (the export format).
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-cutout*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'cutout', slug: 'bulk-background-remover', query: 'bg=transparent' },
  { app: 'cutout', slug: 'white-background', h1: '@seo.task.cutout.white-background.crumb', query: 'bg=white&format=jpg' },
  { app: 'cutout', slug: 'transparent-png', query: 'bg=transparent&format=png' },
  { app: 'cutout', slug: 'video-background-remover', query: 'bg=transparent' },
];
