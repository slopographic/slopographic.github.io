// Task pages for Slop Recorder (recorder/index.html, recorder/js/main.js). The app reads ?source=screen|camera|pip|mic
// (recorder/js/main.js) to start with that source chosen.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-recorder*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'recorder', slug: 'screen-recorder-with-webcam', query: 'source=pip' },
  { app: 'recorder', slug: 'record-screen-with-audio', query: 'source=screen' },
  { app: 'recorder', slug: 'loom-alternative', query: 'source=pip' },
  { app: 'recorder', slug: 'webcam-recorder', query: 'source=camera' },
];
