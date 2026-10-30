// The folders of the languages besides the root one (/sv/, /de/) and their sitemaps (sitemap-sv.xml) are written when the
// site is published (tools/seo/write.mjs --langs) and never committed. This file keeps git away from them and them away
// from the app folders:
//   langDirs(root)            the folder names of every language in LANGS but the root one, in lower case ('sv', 'pt-br')
//   ignoreBlock(root)         the .gitignore lines between the markers: /<code>/ and /sitemap-<code>.xml for each of them,
//                             anchored at the repo root, so only those exact names are ignored (never pdf/ or docs/)
//   withBlock(text, root)     .gitignore with its block rewritten; a file without the markers is returned as it is
//   withoutBlock(text)        .gitignore without the block: a white-label build commits its language folders (its mirror is
//                             the published site), so tools/whitelabel/build.mjs drops the block from its copy
//   clashes(codes, apps)      the published languages whose folder is an app's or one write.mjs did not make (no index.html
//                             with data-lang-page): write.mjs refuses to write (and clean) there
// Tests: tests/node/seo-langdirs.test.mjs.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './site.mjs';
import { LANGS, ROOT_LANG } from './lang.mjs';

export const START = '# seo:langs:start';
export const END = '# seo:langs:end';

export const langDirs = (root = ROOT_LANG) => LANGS.filter((l) => l.code !== root).map((l) => l.code.toLowerCase());

export function ignoreBlock(root = ROOT_LANG) {
  return [START,
    '# The SEO pages of the languages besides the root one and their sitemaps: written when the site is published',
    '# (node tools/seo/write.mjs --langs), never committed. Written by tools/seo/write.mjs from the language list',
    '# (shared/i18n/i18n.js); tools/seo/langdirs.mjs.',
    ...langDirs(root).flatMap((d) => [`/${d}/`, `/sitemap-${d}.xml`]), END];
}

const BLOCK = new RegExp(`${START}\\n[\\s\\S]*?${END}\\n?`);
export function withBlock(text, root = ROOT_LANG) {
  return BLOCK.test(text) ? text.replace(BLOCK, ignoreBlock(root).join('\n') + '\n') : text;
}
export const withoutBlock = (text) => text.replace(BLOCK, '').replace(/\n{3,}/g, '\n\n');

/** The folders of languages that are something else: an app's folder, or a folder whose index.html write.mjs did not
 * write (every language page carries data-lang-page). */
export function clashes(codes, apps) {
  const appDirs = new Set(apps.map((a) => String(a.path || '').split('/')[0]).filter(Boolean));
  return codes.filter((c) => c !== ROOT_LANG).map((c) => c.toLowerCase()).filter((d) => {
    if (appDirs.has(d)) return true;
    if (!existsSync(path.join(ROOT, d))) return false;
    const index = path.join(ROOT, d, 'index.html');
    return !existsSync(index) || !/<html[^>]*\sdata-lang-page=/.test(readFileSync(index, 'utf8'));
  });
}
