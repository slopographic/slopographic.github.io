/* SlopLabel — ui/tabs: each label is a tab on the shared document strip (shared/doctabs). The live state (the label, its
 * undo history, selection, record, prompts, unsaved flag, Drive link, tool and view) lives in App. A tab record keeps it while
 * the tab is not on screen: syncIn copies a tab into App when it is shown, syncOut copies App back, and tabChanged() hands the
 * tab to the strip, whose session saves it in this browser. The strip's rename also renames the label (strip 'content' events).
 * Classic script; uses App and the helpers of ui/app.js, io/tabstate.js and io/files.js. */
'use strict';

const LabelTabs = { api: null, session: null };

/** The strip's adapter: a tab record T is the strip's doc. */
const TAB_ADAPTER = {
  newDoc: () => tabRecord(normalizeDoc(newDoc({ name: 'Untitled label' })), { label: LT('label.dlg.new_label') }),
  serialize: (T) => { if (T === App.T) syncOut(); return tabToState(T); },
  restore: (s) => stateToTab(s),
  title: (T) => T.doc.name,
  dirty: (T) => (T === App.T ? App.dirty : !!T.dirty),
  activate: (T) => syncIn(T),
  deactivate: (T) => { if (T === App.T) syncOut(); },
  saved: (T) => { T.dirty = false; if (T === App.T) App.dirty = false; },
  drive: {
    ext: '.sloplabel',
    mime: 'application/json',
    toBlob: (T) => projectBlob(T.doc),
    fromBlob: async (blob) => tabRecord(parseProject(await blob.text()), { label: LT('label.form.open') }),
  },
};

/** Copies App's live state into the current tab record. */
function syncOut() {
  const T = App.T;
  if (!T || !App.doc) return;
  Object.assign(T, {
    doc: App.doc, hist: App.hist, sel: App.sel.slice(), rec: App.rec, prompts: App.prompts, dirty: App.dirty, driveId: App.driveId,
    view: { tool: App.tool, zoom: App.zoom, panX: App.panX, panY: App.panY },
  });
}
/** Shows a tab record: App takes its label, history, selection and view. A tab with no saved view is fitted to the stage. */
function syncIn(T) {
  App.T = T;
  App.doc = T.doc; App.hist = T.hist;
  App.rec = Math.min(T.rec, Math.max(0, recordCount(T.doc) - 1));
  App.prompts = T.prompts; App.dirty = T.dirty; App.driveId = T.driveId;
  App.sel = T.sel.filter((id) => objById(id));
  if (T.view) { App.zoom = T.view.zoom; App.panX = T.view.panX; App.panY = T.view.panY; }
  setTool(T.view && toolById(T.view.tool) ? T.view.tool : 'select');
  document.title = T.doc.name + ' — SlopLabel';
  rebuildScene();
  if (T.view) refresh(); else fitView();
  preloadImages(T.doc).then(() => { if (App.T === T) refresh({ keepProps: true }); }).catch(() => {});
}
/** The current label changed (an edit, an undo, a rename, a save): the strip redraws its tab and the session saves it. */
function tabChanged() {
  syncOut();
  if (LabelTabs.api && App.T) LabelTabs.api.changed(App.T);
}
/** Strip events: a rename renames the label; a Drive link is kept on the tab. */
function onTabEvent(why, t) {
  const T = t.doc; // the tab record; T.doc is the label
  if (why === 'content' && t.name && T.doc.name !== t.name) {
    T.doc.name = t.name;
    if (T === App.T) { document.title = T.doc.name + ' — SlopLabel'; updateChrome(); }
  }
  if (why === 'drive' || why === 'open') {
    T.driveId = t.driveId;
    if (T === App.T) App.driveId = t.driveId;
  }
}

/** Mounts the strip and reopens the tabs saved in this browser. With none, the label of the last version or the starter label. */
async function startTabs() {
  if (LabelTabs.api) return;
  LabelTabs.api = SlopDocTabs.mount($('tabs'), TAB_ADAPTER, { appId: 'label', toast: (m) => SlopUI.toast(m, 4200) });
  LabelTabs.session = SlopDocTabs.session('label', LabelTabs.api, { notice: (m) => SlopUI.toast(m, 4200) });
  LabelTabs.api.on(onTabEvent);
  const n = await LabelTabs.session.restore();
  if (n) return;
  const old = await loadAutosave();
  if (old) { setDoc(old.doc, LT('label.tabs.restore')); App.dirty = true; tabChanged(); }
  else setDoc(starterDoc(), LT('label.dlg.start'));
}
/** Opens a label in a new tab after the current one. o: { label (undo label), dirty, origName, driveId }. Returns the tab record. */
function openDocTab(doc, o = {}) {
  const T = tabRecord(normalizeDoc(doc), { dirty: !!o.dirty, driveId: o.driveId || null, label: o.label || LT('label.form.open') });
  LabelTabs.api.openDoc(T, { driveId: T.driveId, origName: o.origName || null });
  return T;
}
/** File ▸ New tab: a blank label in a new tab. */
function newBlankTab() { if (LabelTabs.api) LabelTabs.api.newTab(); }
/** Closes the current tab (asks first when it has unsaved changes). */
function closeCurrentTab() { if (LabelTabs.api) LabelTabs.api.close(); }
/** The current label was saved to a file (or to Drive): its tab is no longer unsaved. */
function markSaved() { if (App.T && LabelTabs.api) LabelTabs.api.markSaved(App.T); else App.dirty = false; }
/** The current label is now the Drive file id (Save writes back to it). */
function linkDrive(id) {
  App.driveId = id;
  if (App.T && LabelTabs.api) LabelTabs.api.setDriveId(App.T, id);
  tabChanged();
}
/** The label's name changed in Label setup: a renamed tab follows it. */
function syncTabName() {
  if (!App.T || !LabelTabs.api) return;
  const t = LabelTabs.api.tabs().find((x) => x.doc === App.T);
  if (t && t.name) LabelTabs.api.rename(App.T, App.doc.name);
}
/** Writes the open tabs to this browser now (they are also written a moment after each change, and when the page is left). */
function flushTabs() { return LabelTabs.session ? LabelTabs.session.flush() : Promise.resolve(false); }
