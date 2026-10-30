/* Slop Docs for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), the state summary and
 * the checkpoint for "Undo all AI changes". An ES module imported on demand by SlopCmd.prepare() (ui/commands.js), never
 * at boot. Each command is one SlopDocs.edit, so one step in the document's own undo history. The commands are hidden
 * from the palette (the menus have the same actions) and none is destructive: all of them undo. The commands that make
 * documents and their content (new, build from outline, lists, tables, pictures, export) are in ai-create.js. */
import { para, paraText, paraLen, wordCount } from '../model/doc.js';
import { setParas, setMarks, ordered, collapsed, textBetween } from '../model/ops.js';
import { STYLE_ORDER, STYLE_NAMES, headingLevel } from '../model/styles.js';
import { insertParas, findAll, replaceMatches } from '../model/ai-edit.js';
import { commands as createCommands, made, closeMade } from './ai-create.js';

const S = window.SlopDocs, C = window.SlopCmd;
const WHERE = { name: 'where', type: 'enum', values: ['caret', 'end', 'start'], default: 'caret', description: 'caret puts it after the paragraph with the caret' }; // i18n-ignore: assistant tool text (API)
const STYLES = STYLE_ORDER.filter((s) => s !== 'List');
const Str = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 500, description }, extra);
const Bool = (name, description, def) => ({ name, type: 'boolean', default: def, description });
const short = (t, n = 60) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const nth = (b) => `paragraph ${b + 1}`;
const list = [];
const add = (tool, title, args, run, extra) => list.push(Object.assign({ id: 'docs.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI',
  hidden: true, destructive: false, args, when: () => !!S.doc, run: (a) => run(a || (window.SlopCmdArgs ? window.SlopCmdArgs.defaults(args) : {})) }, extra));

/** Put paragraphs at a place in one undo step and move the caret to the end of the last one. */
function put(paras, where) {
  const res = insertParas(S.doc.blocks, S.sel, paras, where);
  S.edit(res.blocks, { a: res.pos, f: res.pos }, 'ai');
  return res.pos.b - paras.length + 1;
}
const needText = (t, what) => { const s = String(t || '').trim(); if (!s) throw new Error(`Give the ${what} text`); return s; };

add('insert_heading', 'Insert heading', [Str('text', 'the heading words', { required: true, maxLength: 300 }),
  { name: 'level', type: 'number', min: 1, max: 6, default: 1, integer: true, description: '1 is the largest' }, WHERE], // i18n-ignore: assistant tool text (API)
(a) => {
  const text = needText(a.text, 'heading').replace(/\s*\n\s*/g, ' ');
  const b = put([para(text, 'H' + a.level)], a.where);
  return `Added Heading ${a.level} “${short(text)}” as ${nth(b)}.`;
}, { description: 'Add a heading (level 1 to 6) as its own paragraph.' }); // i18n-ignore: assistant tool text (API)

add('insert_paragraph', 'Insert paragraph', [Str('text', 'the words; a line break starts a new paragraph', { required: true, maxLength: 5000 }), WHERE,
  { name: 'style', type: 'enum', values: STYLES, default: 'Normal', description: 'paragraph style' }], // i18n-ignore: assistant tool text (API)
(a) => {
  const parts = needText(a.text, 'paragraph').split(/\r?\n/);
  const b = put(parts.map((t) => para(t, a.style)), a.where);
  return parts.length === 1 ? `Added a ${STYLE_NAMES[a.style]} paragraph as ${nth(b)}.` : `Added ${parts.length} paragraphs from ${nth(b)}.`;
}, { description: 'Add text as new paragraphs.' }); // i18n-ignore: assistant tool text (API)

add('find_replace', 'Find and replace', [Str('find', 'the text to look for', { required: true }), Str('replace', 'the new text; empty removes the matches', { default: '' }),
  Bool('match_case', 'upper and lower case must match', false), Bool('whole_word', 'only whole words', false), Bool('all', 'every match; false replaces the next one after the caret', true)],
(a) => {
  if (!a.find) throw new Error('Give the text to find');
  const res = replaceMatches(S.doc.blocks, S.sel, a.find, a.replace, { matchCase: a.match_case, wholeWord: a.whole_word, all: a.all });
  if (!res.count) return `0 replacements: “${short(a.find)}” was not found.`;
  S.edit(res.blocks, res.sel, 'ai');
  return `${res.count} replacement${res.count === 1 ? '' : 's'}: “${short(a.find)}” → “${short(a.replace || '')}”.`;
}, { description: 'Replace text in the document; returns how many were replaced.' }); // i18n-ignore: assistant tool text (API)

/** The paragraphs a style or format command acts on: a numbered paragraph, or the selection (the caret's paragraph). */
function targetSel(n) {
  if (n == null) return S.sel;
  const b = n - 1, p = S.doc.blocks[b];
  if (!p || p.type !== 'p') throw new Error(`There is no paragraph ${n} (the document has ${S.doc.blocks.length})`);
  return { a: { b, o: 0 }, f: { b, o: paraLen(p) } };
}
const PARA = { name: 'paragraph', type: 'number', min: 1, max: 100000, integer: true, description: 'paragraph number from the state; the selection when empty' };

add('set_paragraph_style', 'Set paragraph style', [{ name: 'style', type: 'enum', values: STYLES, required: true, description: 'H1 to H6 are headings' }, PARA], // i18n-ignore: assistant tool text (API)
(a) => {
  const sel = targetSel(a.paragraph), blocks = setParas(S.doc.blocks, sel, (p) => ({ ...p, style: a.style }));
  if (blocks.every((p, i) => p === S.doc.blocks[i] || p.style === S.doc.blocks[i].style)) return `Already ${STYLE_NAMES[a.style]}.`;
  S.edit(blocks, S.sel, 'ai');
  const [x, y] = ordered(sel);
  return `${x.b === y.b ? 'Paragraph ' + (x.b + 1) + ' is' : 'Paragraphs ' + (x.b + 1) + '–' + (y.b + 1) + ' are'} now ${STYLE_NAMES[a.style]}.`;
}, { description: 'Change the style (Normal, Title, Heading 1–6, Quote, Code) of the selected paragraphs or of one paragraph.' }); // i18n-ignore: assistant tool text (API)

add('format_text', 'Format text', [Bool('bold', 'true or false; unchanged when empty'), Bool('italic'), Bool('underline'), Bool('strike'),
  { name: 'color', type: 'color', description: 'text colour such as #c00000 or red' }, Str('match', 'format every occurrence of this text instead of the selection', { maxLength: 200 }), PARA], // i18n-ignore: assistant tool text (API)
(a) => {
  const change = {};
  for (const k of ['bold', 'italic', 'underline', 'strike']) if (a[k] != null) change[{ bold: 'b', italic: 'i', underline: 'u', strike: 's' }[k]] = a[k] || null;
  if (a.color) change.color = a.color;
  if (!Object.keys(change).length) throw new Error('Nothing to change: give bold, italic, underline, strike or color');
  let ranges;
  if (a.match) {
    ranges = findAll(S.doc.blocks, a.match, { matchCase: true }).map((h) => ({ a: { b: h.b, o: h.s }, f: { b: h.b, o: h.e } }));
    if (!ranges.length) throw new Error(`“${short(a.match)}” was not found`);
  } else {
    ranges = [targetSel(a.paragraph)];
    if (collapsed(ranges[0])) throw new Error('Nothing is selected: give match or paragraph');
  }
  const blocks = ranges.reduce((bl, r) => setMarks(bl, r, change), S.doc.blocks);
  S.edit(blocks, S.sel, 'ai');
  const what = Object.entries(change).map(([k, v]) => (k === 'color' ? 'colour ' + v : (v ? '' : 'not ') + { b: 'bold', i: 'italic', u: 'underlined', s: 'struck through' }[k])).join(', ');
  return a.match ? `Made ${ranges.length} × “${short(a.match)}” ${what}.` : `Made the ${a.paragraph ? nth(a.paragraph - 1) : 'selection'} ${what}.`;
}, { description: 'Bold, italic, underline, strike or colour the selection, one paragraph, or every occurrence of a text.' }); // i18n-ignore: assistant tool text (API)

add('undo', 'Undo', [{ name: 'steps', type: 'number', min: 1, max: 20, default: 1, integer: true }],
(a) => { let n = 0; while (n < a.steps && S.canUndo()) { S.undo(); n++; } return `Undid ${n} step${n === 1 ? '' : 's'}.`; });

/** A small summary of the open document for the assistant. Paragraph numbers count every top-level block from 1. */
function state() {
  const blocks = S.doc.blocks, wc = wordCount(S.doc), [x, y] = ordered(S.sel), cur = blocks[S.sel.f.b];
  const outline = [];
  blocks.forEach((p, i) => { const l = p.type === 'p' ? headingLevel(p.style) : 0; if (l && outline.length < 60) outline.push({ level: l, text: short(paraText(p), 80), paragraph: i + 1 }); });
  return {
    app: 'Slop Docs', title: S.displayName(), unsaved: !!S.file.dirty,
    pages: S.layout ? S.layout.pages.length : 0, paragraphs: blocks.length, words: wc.words, characters: wc.chars,
    outline,
    caret: { paragraph: S.sel.f.b + 1, offset: S.sel.f.o, style: cur && cur.style || 'Normal', text: cur && cur.type === 'p' ? short(paraText(cur), 120) : '' },
    selection: collapsed(S.sel) ? null : { from: { paragraph: x.b + 1, offset: x.o }, to: { paragraph: y.b + 1, offset: y.o }, text: short(textBetween(blocks, S.sel), 200) },
    canUndo: S.canUndo(),
  };
}
/** The document as it is now; the rollback puts it back as one more undo step. False when another tab or document is open. */
function checkpoint() {
  const hist = S.undoStack, blocks = S.doc.blocks, sel = S.sel, mark = made.length;
  return () => {
    closeMade(mark);
    if (!S.doc || S.undoStack !== hist) return false;
    if (S.doc.blocks !== blocks) S.edit(blocks, sel, 'ai');
    return true;
  };
}

if (!window.SlopCmdSources) await new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
  { src: new URL('../../../shared/commands/sources.js', import.meta.url).href, onload: res, onerror: () => rej(new Error('Could not load sources.js')) })));
createCommands(add);
C.register(list);
// what the AI panel's ready-made prompts fill in (shared/ai/quick/context.js): the page has no DOM selection to read
C.provide({ state, checkpoint, context: () => ({ document: S.displayName(), selection: collapsed(S.sel) ? '' : textBetween(S.doc.blocks, S.sel) }) });
