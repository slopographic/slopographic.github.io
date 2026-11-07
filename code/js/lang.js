/* Slop Code: the languages. Each entry maps file extensions to a CodeMirror support (highlighting, parser)
 * and to the MIME type a Slop Drive record gets. Built-in completion is wired in completion.js. */
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';

export const LANGS = [
  { id: 'javascript', label: 'JavaScript', ext: 'js', exts: ['js', 'mjs', 'cjs', 'jsx'], mime: 'text/javascript', support: (x) => javascript({ jsx: x === 'jsx' }) },
  { id: 'typescript', label: 'TypeScript', ext: 'ts', exts: ['ts', 'tsx', 'mts'], mime: 'text/typescript', support: (x) => javascript({ typescript: true, jsx: x === 'tsx' }) },
  { id: 'html', label: 'HTML', ext: 'html', exts: ['html', 'htm'], mime: 'text/html', support: () => html() },
  { id: 'css', label: 'CSS', ext: 'css', exts: ['css'], mime: 'text/css', support: () => css() },
  { id: 'json', label: 'JSON', ext: 'json', exts: ['json'], mime: 'application/json', support: () => json() },
  { id: 'markdown', label: 'Markdown', ext: 'md', exts: ['md', 'markdown'], mime: 'text/markdown', support: () => markdown() },
  { id: 'python', label: 'Python', ext: 'py', exts: ['py'], mime: 'text/x-python', support: () => python() },
  { id: 'text', label: 'Plain text', ext: 'txt', exts: ['txt', 'text', 'log'], mime: 'text/plain', support: () => [] },   // i18n-ignore (shown through langLabel)
];
const TEXT = LANGS[LANGS.length - 1];

/** The extension of a file name, lower case, without the dot ('' when there is none). */
export function extOf(name) {
  const s = String(name || ''), i = s.lastIndexOf('.');
  return i > 0 && i < s.length - 1 ? s.slice(i + 1).toLowerCase() : '';
}
/** The language for a file name. Unknown extensions are plain text. */
export function languageFor(name) {
  const x = extOf(name);
  return LANGS.find((l) => l.exts.includes(x)) || TEXT;
}
export const languageById = (id) => LANGS.find((l) => l.id === id) || TEXT;
export const mimeFor = (name) => languageFor(name).mime;
/** The CodeMirror support for a file name (a LanguageSupport, or [] for plain text). */
export const supportFor = (name) => languageFor(name).support(extOf(name));
/** Give a name the extension of a language, unless it already has one of that language's extensions. */
export function withExt(name, lang) {
  const base = String(name || '').trim() || 'untitled';
  return languageFor(base).id === lang.id && extOf(base) ? base : base.replace(/\.[^.]*$/, '') + '.' + lang.ext;
}
/** The language of an open document: the one the mode switcher chose (doc.langId), else the one for its name. */
/** The name a person reads for a language: the names of the languages stay, Plain text is a word. */
export const langLabel = (l) => (l.id === 'text' && window.SlopI18n ? window.SlopI18n.t('code.lang.text') : l.label);
export const langOf = (doc) => (doc && doc.langId ? languageById(doc.langId) : languageFor(doc ? doc.name : ''));
