/* Slop Code: the CodeMirror 6 setup shared by every open document. One EditorView shows the active
 * document; each document keeps its own EditorState (text, undo history, selection). */
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { languageFor, extOf } from './lang.js';
import { completionExtensions, languageCompletion } from './completion.js';
import { displayExtension } from './display.js';

/** Colours come from the --cd-* tokens in css/base.css, so light and dark themes both work. */
const HIGHLIGHT = syntaxHighlighting(HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: 'var(--cd-kw)' },
  { tag: [t.string, t.special(t.string), t.link], color: 'var(--cd-str)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cd-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cd-com)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cd-fn)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--cd-tag)' },
  { tag: t.attributeName, color: 'var(--cd-attr)' },
  { tag: [t.propertyName, t.labelName], color: 'var(--cd-prop)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--cd-type)' },
  { tag: [t.operator, t.punctuation, t.separator], color: 'var(--cd-op)' },
  { tag: t.heading, color: 'var(--cd-kw)', fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.invalid, color: 'var(--cd-err)' },
]));

// Everything except Mod+Enter (Run) and the keys the app binds itself.
const KEYS = [
  ...defaultKeymap.filter((b) => b.key !== 'Mod-Enter'), ...historyKeymap, ...foldKeymap,
  ...searchKeymap, ...closeBracketsKeymap, indentWithTab,
];
const wrapCompartment = new Compartment();
const langCompartment = new Compartment(); // the language support, so the mode switcher can change it
const prefs = { wrap: false };
const hooks = { change: null, select: null };

function baseExtensions() {
  return [
    lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(),
    drawSelection(), dropCursor(), EditorState.allowMultipleSelections.of(true), // Ctrl+click adds a cursor
    indentOnInput(), indentUnit.of('  '), HIGHLIGHT, bracketMatching(), closeBrackets(),
    rectangularSelection(), crosshairCursor(), // Alt+drag selects a block
    // A file dragged in from the computer opens in its own tab (the shared intake): CodeMirror would also type its text into this file.
    EditorView.domEventHandlers({ drop: (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files') }), // intake-ok: only stops CodeMirror's own file handling
    highlightActiveLine(), highlightSelectionMatches(), search({ top: true }), keymap.of(KEYS),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && hooks.change) hooks.change(u.view);
      if ((u.docChanged || u.selectionSet) && hooks.select) hooks.select(u.view);
    }),
  ];
}

/** A fresh state for a document: text, the language for its name, completion and the wrap setting. */
export function makeState(text, name) {
  return EditorState.create({
    doc: text,
    extensions: [
      baseExtensions(), langCompartment.of(langParts(languageFor(name), extOf(name))), completionExtensions(),
      wrapCompartment.of(prefs.wrap ? EditorView.lineWrapping : []), displayExtension(),
    ],
  });
}
/** The support and the completion for a language. `ext` picks the variant (jsx, tsx). */
const langParts = (lang, ext) => [lang.support(ext), languageCompletion(lang.id)];
/** A read-only state for the formatted view: the text, line numbers, highlighting for `lang`, wrapping as the editor has it. */
export function readOnlyState(text, lang) {
  return EditorState.create({
    doc: text,
    extensions: [lineNumbers(), highlightSpecialChars(), foldGutter(), HIGHLIGHT, EditorState.readOnly.of(true), EditorView.editable.of(false),
      search({ top: true }), keymap.of(searchKeymap), highlightSelectionMatches(), EditorView.contentAttributes.of({ tabindex: '0' }), // Ctrl+F works in the read-only pane too
      langCompartment.of(langParts(lang, lang.ext)), wrapCompartment.of(prefs.wrap ? EditorView.lineWrapping : [])],
  });
}
/** The effect that gives a document the language `lang`. `extra` is the loaded highlighting of an extra language (lang-load.js). */
export const langEffect = (lang, extra) => langCompartment.reconfigure(extra ? [extra, languageCompletion(lang.id)] : langParts(lang, lang.ext));
/** Change the language of the shown document (highlighting and completion). The text and history stay. */
export function setLanguage(view, lang) {
  view.dispatch({ effects: langCompartment.reconfigure(langParts(lang, lang.ext)) });
}
/** Set the callbacks for edits and cursor moves (the app owns the one view). */
export function setHooks(h) { Object.assign(hooks, h); }
export const newView = (parent, state) => new EditorView({ state, parent });
export const isWrap = () => prefs.wrap;
/** Turn line wrapping on or off in the view's current state (and for every document opened later). */
export function setWrap(view, on) {
  prefs.wrap = !!on;
  view.dispatch({ effects: wrapCompartment.reconfigure(prefs.wrap ? EditorView.lineWrapping : []) });
}
/** Find (Ctrl+F) or replace (Ctrl+H): the same search panel, with the chosen field focused. */
export function showFind(view, replace = false) {
  openSearchPanel(view);
  const r = view.dom.querySelector(replace ? '.cm-search input[name=replace]' : '.cm-search input[name=search]');
  if (r) { r.focus(); if (r.select) r.select(); }
}

/** Put a search into the view's find panel (so Ctrl+F shows it and F3 goes to the next match). q: { find, replace?, regexp?, caseSensitive?, wholeWord? }. */
export function setFindQuery(view, q) {
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: q.find, replace: q.replace || '', regexp: !!q.regexp, caseSensitive: !!q.caseSensitive, wholeWord: !!q.wholeWord })) });
}
