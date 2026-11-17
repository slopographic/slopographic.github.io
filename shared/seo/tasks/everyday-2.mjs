// Everyday tools, part 2: Slop Calendar, Slop To-do, Slop Reminders, Slop Drive, Slop Music, Reel Remix and SlopCut
// (registry id slopedit). None of these pages uses a preset. Part 1 is everyday.mjs.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-everyday-2*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'calendar', slug: 'open-ics-file' },
  { app: 'calendar', slug: 'google-calendar-alternative' },
  { app: 'todo', slug: 'online-to-do-list' },
  { app: 'todo', slug: 'todoist-alternative' },
  { app: 'reminders', slug: 'online-reminder' },
  { app: 'drive', slug: 'find-duplicate-files' },
  { app: 'drive', slug: 'google-drive-alternative', faq: [['@seo.task.calendar.google-calendar-alternative.faq.0.0']] },
  { app: 'music', slug: 'play-local-music-files' },
  { app: 'music', slug: 'flac-player' },
  { app: 'remix', slug: 'automatic-video-editor' },
  { app: 'remix', slug: 'photo-slideshow-with-music' },
  { app: 'slopedit', slug: 'merge-videos' },
  { app: 'slopedit', slug: 'trim-video', faq: [null, null, null, [null, '@seo.task.slopedit.merge-videos.faq.1.1']] },
  { app: 'slopedit', slug: 'video-to-gif' },
  {
    app: 'slopedit',
    slug: 'add-text-to-video',
    h1: '@seo.task.slopedit.add-text-to-video.crumb',
    steps: ['@seo.task.slopedit.video-to-gif.steps.0'],
  },
  { app: 'slopedit', slug: 'split-screen-video' },
  { app: 'slopedit', slug: 'capcut-alternative' },
];
