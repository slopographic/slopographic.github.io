// How the apps run, said once and in plain words: every Slopographic app works right in the browser on a phone, tablet
// or computer, with nothing to install, and keeps working offline after the first visit (the offline worker,
// service-worker.js, mounted by shell/shell.js through shared/pwa.js). It can also be added to a home screen or desktop
// (manifest.webmanifest). Used by the app pages (tools/seo/landing.mjs), the task FAQs and the round-ups
// (shared/seo/roundups/*.mjs); how-it-works/index.html says the same in its own words.
// The words are the SEO tables' seo.install.* (shared/seo/i18n/<code>/common.js): short (a table value for rows like
// "Mobile app"), pro (a round-up pro), con (a round-up con), how (the full answer, for an app page note or an FAQ).
import { hydrate } from './i18n.mjs';
export const installIn = (code = 'en') => hydrate({}, 'seo.install', code);
export const INSTALL = installIn('en');
