// Task pages: the copy for every "how do I…" page, one file per family of apps. tools/seo/tasks.mjs checks and draws
// them; tools/seo/write.mjs writes them to /<app path><slug>/ with their head block and puts them in the sitemap.
// A task: { app, slug, title (≤ 75), description (120–160), h1, crumb?, lead, cta?, query? (the app's URL preset),
//   steps: [3–6], body?: [paragraphs], faq: [[question, answer], ≥ 3] }. Titles and descriptions are unique site-wide.
import { hydrate, seg } from '../i18n.mjs';

// The facts of every task (the family files), in this order; tasksIn(code) joins them with that language's words.
import { FACTS } from './facts.mjs';
export const tasksIn = (code = 'en') => FACTS.map((t) => hydrate(t, `seo.task.${seg(t.app)}.${seg(t.slug)}`, code));
export const TASKS = tasksIn('en');
