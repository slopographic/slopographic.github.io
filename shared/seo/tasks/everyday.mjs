// Everyday tools, part 1: Slop Transcribe, Slop Time, Slopculator, Slop AI and Slop AI Tools. Part 2 is everyday-2.mjs.
// Presets read by the apps: transcribe format=txt|docx|srt|vtt (the download format); time tab=world|my|meet|conv|timers|sync;
// calculator panel=tape|history|convert (shared/router, calculator/js/route.js); ai tab=chat|build|models|sys;
// aitools tool=ocr|speech|denoise|tags|portrait (the hub goes straight to that tool). Unknown values are ignored.
// Model sizes: Whisper tiny is about 40 MB (aitools/model-registry.js); Slop AI models 290 MB to 4.3 GB (shared/ai/catalog.js).
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-everyday*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: 'transcribe', slug: 'audio-to-text' },
  {
    app: 'transcribe',
    slug: 'video-to-text',
    steps: ['@seo.task.transcribe.audio-to-text.steps.0'],
    faq: [null, [null, '@seo.task.transcribe.audio-to-text.faq.0.1']],
  },
  {
    app: 'transcribe',
    slug: 'subtitles-from-video',
    query: 'format=srt',
    faq: [null, null, null, [null, '@seo.task.transcribe.audio-to-text.faq.0.1']],
  },
  { app: 'transcribe', slug: 'otter-ai-alternative' },
  { app: 'time', slug: 'time-zone-converter', h1: '@seo.task.time.time-zone-converter.crumb', query: 'tab=conv' },
  { app: 'time', slug: 'meeting-planner', query: 'tab=meet' },
  { app: 'time', slug: 'online-stopwatch', query: 'tab=timers' },
  { app: 'time', slug: 'timeanddate-alternative' },
  { app: 'calculator', slug: 'date-calculator' },
  { app: 'calculator', slug: 'time-calculator', steps: ['@seo.task.calculator.date-calculator.steps.0'] },
  {
    app: 'calculator',
    slug: 'percentage-calculator',
    h1: '@seo.task.calculator.percentage-calculator.crumb',
    steps: ['@seo.task.calculator.date-calculator.steps.0'],
  },
  { app: 'calculator', slug: 'unit-converter', query: 'panel=convert' },
  { app: 'ai', slug: 'run-ai-locally-in-browser', query: 'tab=models' },
  { app: 'ai', slug: 'can-my-pc-run-ai', query: 'tab=sys' },
  { app: 'ai', slug: 'chatgpt-alternative' },
  { app: 'aitools', slug: 'blur-photo-background', query: 'tool=portrait' },
  { app: 'aitools', slug: 'denoise-photo', query: 'tool=denoise', faq: [null, null, ['@seo.task.aitools.blur-photo-background.faq.1.0']] },
];
