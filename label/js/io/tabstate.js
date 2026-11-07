/* SlopLabel — io/tabstate: one label tab as plain data for the shared tab strip (shared/doctabs). A tab record is
 * T = { doc, hist (History), sel (object ids), rec (record index), prompts, dirty, driveId, view (tool, zoom, pan) | null }.
 * The state keeps the label, its undo history (the last HIST_KEEP steps), selection, record, prompts and view, so a reload
 * brings the tab back as it was. Pure: no DOM. Classic script; uses model.js (History, normalizeDoc) and units.js. */
'use strict';

const TAB_STATE_V = 1;
const HIST_KEEP = 100;

/** A new tab record around a document. opts: { dirty, driveId, label } (label is the undo label of the first step). */
function tabRecord(doc, opts = {}) {
  const T = { doc, hist: new History(), sel: [], rec: 0, prompts: {}, dirty: !!opts.dirty, driveId: opts.driveId || null, view: null };
  T.hist.reset(doc, opts.label || 'Open');
  return T;
}

/** The view part of a tab, when it is sound (a tool name, a positive zoom and finite pan). */
function cleanView(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.tool !== 'string' || !(v.zoom > 0) || !Number.isFinite(v.panX) || !Number.isFinite(v.panY)) return null;
  return { tool: v.tool, zoom: v.zoom, panX: v.panX, panY: v.panY };
}

/** Tab record → plain state (JSON-safe, no functions). */
function tabToState(T) {
  const h = T.hist;
  let from = Math.max(0, h.stack.length - HIST_KEEP);
  if (h.idx < from) from = Math.max(0, h.idx);
  return {
    v: TAB_STATE_V,
    doc: deepClone(T.doc),
    hist: { idx: Math.max(0, h.idx - from), stack: h.stack.slice(from).map((e) => ({ s: String(e.s), label: String(e.label || ''), co: String(e.co || '') })) },
    sel: T.sel.slice(),
    rec: Math.max(0, T.rec | 0),
    prompts: Object.assign({}, T.prompts),
    dirty: !!T.dirty,
    view: cleanView(T.view),
  };
}

/** Plain state → tab record. Throws when the state is not a tab this version wrote; a damaged undo history is replaced by a fresh one. */
function stateToTab(s) {
  if (!s || s.v !== TAB_STATE_V || !s.doc || !Array.isArray(s.doc.objects)) throw new Error('This tab was saved by another version of SlopLabel');
  const doc = normalizeDoc(deepClone(s.doc));
  const T = tabRecord(doc, { dirty: !!s.dirty });
  const hs = s.hist;
  if (hs && Array.isArray(hs.stack) && hs.stack.length && hs.stack.every((e) => e && typeof e.s === 'string')) {
    T.hist.stack = hs.stack.map((e) => ({ s: e.s, label: typeof e.label === 'string' ? e.label : '', co: typeof e.co === 'string' ? e.co : '' }));
    T.hist.idx = clamp(hs.idx | 0, 0, T.hist.stack.length - 1);
  }
  T.sel = Array.isArray(s.sel) ? s.sel.filter((id) => doc.objects.some((o) => o.id === id)) : [];
  T.rec = Math.max(0, s.rec | 0);
  T.prompts = s.prompts && typeof s.prompts === 'object' ? Object.fromEntries(Object.entries(s.prompts).filter(([, v]) => typeof v === 'string')) : {};
  T.view = cleanView(s.view);
  return T;
}
