/* Slop Tables: the open workbooks as tabs (the shared strip, shared/doctabs). A tab T = { wb, si, sel, scroll, file, hist,
 * untouched }: the engine Workbook, the sheet and selection on screen, the scroll position, the file (name, folder, dirty),
 * its undo steps, and whether nobody has edited it yet. The open one is S.wb, S.si, S.sel, S.file and S.hist; switching
 * copies them out to the old tab and in from the new one, and every change copies out and tells the strip (session.js
 * keeps the tab on this device; drive.js saves it to Slop Drive). The format is the .stab file (io/native.js). Exposes
 * functions for storage.js and main.js; no globals. */
import { S, on, emit, redraw, $ } from './state.js';
import { Workbook } from '../engine/index.js';
import { toBlob, fromBlob, fromNative, toNative, MIME } from '../io/native.js';
import { t } from '../i18n.js';

let api = null, session = null, switching = false;
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '-').trim() || t('tables.app.untitled');
const toast = (m) => { if (window.SlopUI) window.SlopUI.toast(m); };

function makeT(wb, file = {}, view = {}, untouched = false) {
  return {
    wb,
    si: Math.min(Number.isInteger(view.si) ? view.si : (wb.active || 0), wb.sheets.length - 1),
    sel: view.sel || { r: 0, c: 0, er: 0, ec: 0 },
    scroll: view.scroll || { top: 0, left: 0 },
    file: { name: file.name || t('tables.app.untitled'), driveId: null, folderId: file.folderId ?? null, dirty: !!file.dirty },
    hist: { undo: [], redo: [] },
    untouched,
  };
}
function copyOut(T) {
  T.wb = S.wb; T.si = S.si; T.sel = S.sel; T.file = S.file; T.hist = S.hist;
  const vp = $('vp');
  if (vp) T.scroll = { top: vp.scrollTop, left: vp.scrollLeft };
}
function copyIn(T) {
  S.wb = T.wb; S.si = T.si; S.sel = { ...T.sel }; S.edit = null; S.file = T.file; S.hist = T.hist;
  const vp = $('vp');
  if (vp) { vp.scrollTop = T.scroll.top || 0; vp.scrollLeft = T.scroll.left || 0; }
}
function setUrl(id) {
  try {
    const u = new URL(location.href);
    if (id) u.searchParams.set('drive', id); else u.searchParams.delete('drive');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch (e) { /* not a real URL (file://) */ }
}
const current = () => (api ? api.current() : null);

const adapter = {
  newDoc: () => makeT(new Workbook(), { name: t('tables.app.untitled') }, {}, true),
  serialize: (T) => ({
    native: toNative(T.wb), name: T.file.name, folderId: T.file.folderId == null ? null : T.file.folderId,
    dirty: !!T.file.dirty, si: T.si, sel: T.sel, untouched: !!T.untouched,
  }),
  restore(s) {
    if (!s || !s.native || typeof s.native !== 'object') throw new Error('not a workbook');
    const wb = fromNative(s.native); // throws on a damaged workbook: the strip reports it and opens a blank tab
    return makeT(wb, { name: s.name, folderId: s.folderId, dirty: s.dirty }, { si: s.si, sel: s.sel }, !!s.untouched);
  },
  title: (T) => safe(T.file.name),
  dirty: (T) => !!T.file.dirty,
  activate(T) {
    switching = true;
    try {
      copyIn(T);
      T.file.driveId = api.driveIdOf(T);
      setUrl(T.file.driveId);
      emit('open');
      redraw();
    } finally { switching = false; }
  },
  deactivate(T) { copyOut(T); },
  saved(T) {
    T.file.dirty = false;
    if (T === current()) emit('saved');
    redraw();
  },
  drive: {
    ext: '.stab',
    mime: MIME,
    toBlob: (T) => toBlob(T.wb),
    fromBlob: async (blob, name) => makeT(await fromBlob(blob), { name }),
  },
};

/** Every change to the open workbook: its tab takes the new state, the strip redraws, the session saves the tab. */
function syncChange() {
  if (switching || !api || !S.wb || !current()) return;
  const T = current();
  copyOut(T);
  T.untouched = false;
  api.changed(T);
}

export const tabs = {
  /** Mounts the strip and its session. Call restore() once the page is up; the launch is read before that. */
  init() {
    api = SlopDocTabs.mount($('doc-tabs'), adapter, { appId: 'tables' });
    session = SlopDocTabs.session('tables', api, { notice: (m) => toast(m) });
    on('change', syncChange);
    api.on((why, tab) => {
      if (why === 'drive' && tab && tab.doc.file) tab.doc.file.driveId = tab.driveId; // the file keeps the Drive id its tab is linked to
      guard();
    });
    return session;
  },
  restore: () => (session ? session.restore() : Promise.resolve(0)),
  flush: () => (session ? session.flush() : Promise.resolve(false)),
  api: () => api,
  current,
  /** A new blank workbook in a new tab (File ▸ New workbook, + on the strip). */
  newTab: () => api.newTab(),
  /** A workbook in a new tab. driveId links it to a Drive record; without it the tab is an unsaved workbook. */
  open(wb, file = {}, driveId = null) { return api.openDoc(makeT(wb, file), { driveId, origName: file.origName || null }); },
  /** The tab that shows this Drive record, if one is open. */
  tabFor: (driveId) => api.tabs().find((tab) => tab.driveId === driveId) || null,
  /** A tab nobody has edited and that is not linked to a file: a launch may replace it. */
  isPristine: (T) => !!T && !!T.untouched && !api.driveIdOf(T),
  /** Writes the open tab's state before a save or a close. */
  sync() { if (current()) copyOut(current()); },
  anyDirty: () => (api ? api.tabs().some((tab) => tab.dirty) : false),
  setUrl,
};

function guard() {
  if (window.SlopGuard) window.SlopGuard.setUnsaved('tables', tabs.anyDirty());
}
