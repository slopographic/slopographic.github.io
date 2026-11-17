// The hand-written pages whose words are in the SEO tables (tools/seo/build-lang.mjs): each app's about page and How it
// works. The page is a template in shared/seo/pages/ (about/<app id>.html, <folder>.html): its HTML as it is shipped, with
// every sentence a {{key}} of the tables (shared/seo/i18n/<code>/about-*.js, how.js). The first line names the prefix of
// the page's own keys (<!-- seo:template seo.how ... -->); a key that starts with seo. is a whole key (the words the
// about pages share, seo.ui.about.*). A key's text is HTML as the page has it (a <code>, a link): a language keeps the tags.
// write.mjs writes the page in every published language: the root one at <folder>/index.html, the others as copies.
//   aboutTemplate(id)              the about page's template file of an app
//   pageTemplate(slug)             the template file of a page that is not an app's ('how-it-works')
//   hasTemplate(file)              true when that file is there
//   templateKeys(file)             every whole key the template uses, in order
//   renderTemplate(file, L, vars)  the page's HTML in language L (a lang.mjs context); vars fill {app} and the like
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './site.mjs';

export const PAGES_DIR = path.join(ROOT, 'shared/seo/pages');
export const aboutTemplate = (id) => path.join(PAGES_DIR, 'about', `${id}.html`);
export const pageTemplate = (slug) => path.join(PAGES_DIR, `${slug}.html`);
export const hasTemplate = (file) => existsSync(file);

const HEAD = /^<!-- seo:template ([\w.-]+)[^\n]*-->\n/;
const SLOT = /\{\{([\w.-]+)\}\}/g;

function read(file) {
  const src = readFileSync(file, 'utf8'), m = HEAD.exec(src);
  if (!m) throw new Error(`${path.relative(ROOT, file)}: the first line must be <!-- seo:template <key prefix> ... -->`);
  const whole = (k) => (k.startsWith('seo.') ? k : `${m[1]}.${k}`);
  return { body: src.slice(m[0].length), whole };
}

export function templateKeys(file) {
  const { body, whole } = read(file);
  return [...body.matchAll(SLOT)].map((m) => whole(m[1]));
}

export function renderTemplate(file, L, vars = {}) {
  const { body, whole } = read(file);
  return body.replace(SLOT, (m, k) => L.t(whole(k), vars));
}
