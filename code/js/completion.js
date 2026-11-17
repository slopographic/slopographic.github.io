/* Slop Code: auto-completion. The language packages supply their own sources (JavaScript keywords and
 * snippets, HTML tags and attributes, CSS properties, Python keywords and builtins, Markdown HTML tags).
 * On top of that: browser globals for JavaScript and TypeScript, JSON literals (lang-json ships no source),
 * and word completion from the open document. Ctrl+Space opens the list, Enter or Tab accepts. */
import { EditorState, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { autocompletion, acceptCompletion, startCompletion, completeAnyWord, ifNotIn } from '@codemirror/autocomplete';
import { javascriptLanguage, typescriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { htmlLanguage } from '@codemirror/lang-html';
import { cssLanguage } from '@codemirror/lang-css';
import { pythonLanguage } from '@codemirror/lang-python';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { snippetSource } from './snippets.js';

/** Every extension that completes for the open document, whatever the language. */
export function completionExtensions() {
  return [
    autocompletion({ activateOnTyping: true, maxRenderedOptions: 120 }),
    EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
    Prec.highest(keymap.of([
      { key: 'Tab', run: acceptCompletion },
      { key: 'Ctrl-Space', run: startCompletion },
    ])),
  ];
}

let globals = null;
/** Names on the page's global object (window, document, console, Array …), read once. */
function globalOptions() {
  if (globals) return globals;
  globals = [];
  const seen = new Set();
  for (let o = globalThis; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const name of Object.getOwnPropertyNames(o)) {
      if (seen.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      seen.add(name);
      let v;
      try { v = globalThis[name]; } catch (e) { v = undefined; }
      globals.push({ label: name, type: typeof v === 'function' ? (/^[A-Z]/.test(name) ? 'class' : 'function') : 'variable' });
    }
  }
  return globals;
}
/** Bare identifiers complete from the globals. After a dot, the language's own property completion applies. */
const globalsSource = (ctx) => {
  const w = ctx.matchBefore(/[\w$]*/);
  if (!w || (w.from === w.to && !ctx.explicit)) return null;
  if (w.from > 0 && ctx.state.sliceDoc(w.from - 1, w.from) === '.') return null;
  return { from: w.from, options: globalOptions(), validFor: /^[\w$]*$/ };
};
const jsGlobals = (lang) => lang.data.of({ autocomplete: ifNotIn(['LineComment', 'BlockComment', 'String', 'TemplateString'], globalsSource) });
const JSON_LITERALS = ['true', 'false', 'null'].map((label) => ({ label, type: 'keyword' }));
/** Literals complete only outside a string: an odd count of quotes before the cursor on this line means inside one
 * (this also covers a string that is not closed yet, which the parser may not report as a String node). */
const jsonSource = (ctx) => {
  const w = ctx.matchBefore(/\w*/);
  if (!w || (w.from === w.to && !ctx.explicit)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  if ((ctx.state.sliceDoc(line.from, ctx.pos).match(/"/g) || []).length % 2) return null;
  return { from: w.from, options: JSON_LITERALS, validFor: /^\w*$/ };
};
const jsonLiterals = jsonLanguage.data.of({ autocomplete: ifNotIn(['String', 'PropertyName', 'LineComment', 'BlockComment'], jsonSource) });

/** The extra completion for a language id (see lang.js). */
export function languageCompletion(id) {
  const snips = SNIPPET_LANGS[id] ? [SNIPPET_LANGS[id].data.of({ autocomplete: ifNotIn(['LineComment', 'BlockComment', 'String', 'TemplateString'], snippetSource(id)) })] : [];
  if (id === 'javascript') return [jsGlobals(javascriptLanguage), ...snips];
  if (id === 'typescript') return [jsGlobals(typescriptLanguage), ...snips];
  if (id === 'json') return jsonLiterals;
  return snips;
}
/** The languages that take snippets (their data facet carries the source). */
const SNIPPET_LANGS = { javascript: javascriptLanguage, typescript: typescriptLanguage, html: htmlLanguage,
  css: cssLanguage, python: pythonLanguage, markdown: markdownLanguage };
