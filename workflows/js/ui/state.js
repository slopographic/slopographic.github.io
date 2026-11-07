/* Slop Workflows: one tool instance's state and its one way of changing the workflow (several tools can be on one page:
 * the Workflows page, a dialog over another app). Every edit goes through ctx.edit(label, fn): it records how to undo
 * (SlopUndo, shared/ui/undo.js: one step per edit), keeps the draft in this browser when the tool has one (the page), and
 * tells the tool's views to draw again. ctx.S.doc is the open workflow (a shared/ops/flowdoc.js document), ctx.S.id its
 * saved record or null. Passwords (an operation's 'password' options) live only in S.secrets, never in the document.
 *   createState({ ns, draft }) → ctx: { ns, S, on, emit, edit, setDoc, markSaved, dirty, readDraft, R, F } */
import * as R from '../../../shared/ops/all.js';
import '../../../shared/ops/flowdoc.js';
import { tr } from '../core/text.js';

export { R };
export const F = globalThis.SlopFlowDoc;
const DRAFT = 'slop-workflows:draft';
const emptyDoc = () => F.normalize({ kind: 'slopflow', v: 1, name: tr('workflows.tool.untitled', 'Untitled workflow'), steps: [] }).doc;
const noUndo = () => ({ push() {}, undo: async () => ({ ok: false, message: tr('ui.undo.nothing', 'Nothing to undo.') }), size: 0, next: '', clear() {} });

export function createState({ ns = 'wf', draft = false } = {}) {
  const S = {
    doc: emptyDoc(),
    id: null,            // the saved record this is, or null (not saved yet)
    saved: '',           // the document's text when it was last saved, so "Not saved" can show
    secrets: {},         // { step uid: { key: value } }: password fields, this visit only
    files: [],           // [{ id, name, file, kind, size }]
    run: null,           // { busy, abort, cells, items, result } during and after a run
    history: globalThis.SlopUndo ? globalThis.SlopUndo.create({ limit: 80 }) : noUndo(),
  };
  const handlers = new Map();
  const on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); };
  const emit = (type, data) => { for (const fn of handlers.get(type) || []) try { fn(data); } catch (e) { console.error(e); } };

  const snap = () => JSON.stringify({ doc: S.doc, id: S.id });
  const keepDraft = () => {
    if (!draft) return;
    try { localStorage.setItem(DRAFT, JSON.stringify({ id: S.id, saved: S.saved, doc: S.doc })); } catch (e) { /* storage blocked: no draft */ }
  };
  const readDraft = () => {
    if (!draft) return null;
    try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); if (d && d.doc) { const n = F.normalize(d.doc); if (n.doc) return { id: d.id || null, saved: d.saved || '', doc: n.doc }; } } catch (e) { /* none */ }
    return null;
  };
  const dirty = () => F.toText(S.doc) !== S.saved;
  const restore = (text) => { const o = JSON.parse(text); S.doc = o.doc; S.id = o.id; keepDraft(); emit('doc', { undo: true }); };

  /** One edit: fn(doc) changes S.doc in place (or returns a new doc). Undo puts back the doc from before. */
  function edit(label, fn) {
    const before = snap();
    const out = fn(S.doc);
    if (out && out !== S.doc) S.doc = out;
    if (snap() === before) return;
    S.history.push(label, async () => { restore(before); return { ok: true }; });
    keepDraft();
    emit('doc', { label });
  }
  /** Opens another workflow (saved, a template, a file, a link). With a label, going back to the old one is one Undo. */
  function setDoc(doc, { id = null, saved = null, label = '' } = {}) {
    const before = snap();
    S.doc = doc; S.id = id; S.secrets = {};
    S.saved = saved === null ? (id ? F.toText(doc) : '') : saved;
    if (label) S.history.push(label, async () => { restore(before); return { ok: true }; });
    S.run = null;
    keepDraft();
    emit('doc', { opened: true });
  }
  function markSaved(id) { S.id = id; S.saved = F.toText(S.doc); keepDraft(); emit('saved', id); }

  return { ns, S, on, emit, edit, setDoc, markSaved, dirty, readDraft, R, F };
}
