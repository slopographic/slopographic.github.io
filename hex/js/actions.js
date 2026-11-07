/* Slop Hex: the app actions (open, save, find, copy, go to, undo). Classic script; exposes window.HexApp.
 * The open file is the current tab (js/tabs.js): app.doc and app.cur follow it. The DOM is read only inside functions,
 * because this script runs before the page body exists. */
(function () {
  'use strict';
  if (window.HexApp) return;
  const $ = (id) => document.getElementById(id);
  const HB = () => window.HexBytes;
  const tabs = () => window.HexTabs;
  const app = { doc: null, cur: null, grid: null, shaTok: 0, findTok: 0, typeTok: 0 };
  /** The Drive file the open tab is linked to (kept by the strip). */
  Object.defineProperty(app, 'driveId', { get: () => (app.cur && tabs().api() ? tabs().api().driveIdOf(app.cur) : null) });
  const MB = 1 << 20;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

  function status(msg) { const el = $('hx-status'); if (el) el.textContent = msg || ''; }
  const bytesN = (n) => t('hex.app.bytes', { n });
  function sizeText(n) { return n >= 1024 ? t('hex.app.size', { bytes: bytesN(n), size: SlopHub.fmtSize(n) }) : bytesN(n); }

  /** The selected range as [lo, hi], or null. */
  function selRange() {
    const s = app.grid ? app.grid.sel() : { anchor: null, cursor: null };
    if (s.cursor === null || s.anchor === null) return null;
    return [Math.min(s.anchor, s.cursor), Math.max(s.anchor, s.cursor)];
  }

  function selText() {
    const r = selRange(), d = app.doc;
    if (!r || !d) return t('ui.none');
    const [lo, hi] = r, n = hi - lo + 1;
    return n === 1 ? t('hex.app.sel_one', { at: HB().formatOffset(lo, d.size) }) : t('hex.app.sel_range', { from: HB().formatOffset(lo, d.size), to: HB().formatOffset(hi, d.size), bytes: bytesN(n) });
  }

  /** Redraw everything that depends on the open file: name, info strip, buttons, the unsaved-changes guard. */
  function refresh() {
    const d = app.doc, T = app.cur, has = !!d;
    // The blank tab the app opens with (nothing in it yet) shows the empty state, not an empty grid.
    const blank = has && d.size === 0 && !d.dirty();
    $('hx-empty').hidden = has && !blank;
    $('hx-scroll').hidden = !has || blank;
    $('hx-info').hidden = !has || blank;
    for (const id of ['hx-save', 'hx-saveas', 'hx-dl', 'hx-goto', 'hx-q', 'hx-next', 'hx-prev']) $(id).disabled = !has;
    if (!has) { $('hx-name').textContent = ''; document.title = 'Slop Hex'; if (window.SlopGuard) SlopGuard.setUnsaved('hex', false); return; }
    const changed = d.changed ? ' · ' + t('hex.app.changed', { n: d.changed }) : '';
    $('hx-name').textContent = `${d.name}${d.dirty() ? ' · ' + t('hex.app.unsaved') : ''}${changed}`;
    document.title = `${d.name} · Slop Hex`;
    $('hx-size').textContent = sizeText(d.size);
    $('hx-sel').textContent = selText();
    const sha = $('hx-sha');
    sha.textContent = T.shaBusy ? t('hex.app.computing') : T.sha ? T.sha + (T.shaStale ? ' ' + t('hex.app.before_edits') : '') : '';
    $('hx-sha-btn').hidden = !T.shaStale;
    if (window.SlopGuard) SlopGuard.setUnsaved('hex', tabs().anyDirty());
    updateType();
  }

  async function updateType() {
    const d = app.doc; if (!d) return;
    const tok = ++app.typeTok;
    const head = await d.readRange(0, Math.min(d.size, 1024));
    if (tok === app.typeTok && app.doc === d) $('hx-type').textContent = HB().guessType(head);   // in the page's language (bytes.js)
  }

  /** The hash of the open file. Each tab keeps its own, so switching back shows the last one. */
  async function computeSha() {
    const T = app.cur; if (!T) return;
    const tok = ++app.shaTok;
    T.shaBusy = true; refresh();
    try {
      const h = await T.doc.sha256();
      T.sha = h; T.shaStale = false;
    } catch (e) { if (tok === app.shaTok) $('hx-sha').textContent = t('hex.app.sha_failed', { error: e.message }); }
    T.shaBusy = false;
    refresh();
  }

  /** Any byte change: the hash is out of date until it is recalculated, and the strip marks the tab. */
  function changed() {
    if (app.cur) app.cur.shaStale = true;
    tabs().changed(app.cur);
    refresh();
  }

  /** The strip showed a tab: its file is on screen, with its own selection. */
  function activate(T) {
    app.cur = T; app.doc = T.doc;
    app.grid.setDoc(T.doc);
    if (T.sel && T.sel.anchor !== null && T.sel.cursor !== null) app.grid.select(T.sel.anchor, T.sel.cursor);
    app.grid.focus();
    refresh();
    if (!T.sha && !T.shaBusy) computeSha();
  }
  function deactivate(T) {
    if (app.grid && T) T.sel = app.grid.sel();
  }

  /** Is a file of this name and size open in a tab? (A drop of the same file again is not opened twice.) The strip's
   *  record holds the tab (t.doc) and the tab holds the HexDoc (t.doc.doc). */
  function isOpen(file) {
    return !!(tabs().api() && tabs().api().tabs().some((tb) => tb.doc && tb.doc.doc && tb.doc.doc.name === file.name && tb.doc.doc.size === file.size));
  }
  /** Opens a file in a new tab. A file already open from the same Drive record is shown instead. */
  async function openBlob(blob, { name = 'untitled.bin', driveId = null, version = 1 } = {}) {
    if (driveId && tabs().api()) {
      const open = tabs().api().tabs().find((tb) => tb.driveId === driveId);
      if (open) { tabs().api().activate(open.doc); return true; }
    }
    const pristine = tabs().current() && tabs().current().doc.size === 0 && !tabs().current().doc.dirty() && !(tabs().api().driveIdOf(tabs().current())) ? tabs().current() : null;
    tabs().open(blob, name, driveId, version);
    if (pristine && tabs().current() !== pristine) tabs().api().close(pristine);
    status(blob.size ? t('hex.app.opened', { name }) : t('hex.app.empty_file', { name }));
    return true;
  }

  /* Open file… and Open from Slop Drive: sources of the one intake (main.js); a Drive file opens linked to its record. */
  const pickComputer = () => window.SlopIntake.pick({ to: 'hex', multiple: false });
  const pickDrive = () => window.SlopIntake.fromDrive({ to: 'hex', title: t('hex.app.drive_title') });

  /** "photo.bin" -> "photo (v2).bin": the version goes before the extension, and an old version tag is replaced. */
  function versionName(name, n) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot) : '';
    const base = (dot > 0 ? name.slice(0, dot) : name).replace(/ \(v\d+\)$/, '');
    return `${base} (v${n})${ext}`;
  }

  /** A new version is a new Drive file beside the one it came from, so nothing is overwritten (this is not the strip's
   * in-place save, which would overwrite the linked file). The tab then follows the new version. */
  async function saveVersion() {
    const T = app.cur; if (!T) return;
    if (!app.driveId) return saveAs();
    const d = T.doc, n = T.version + 1, name = versionName(d.name, n);
    let folderId;
    const prev = await SlopHub.get(app.driveId).catch(() => null);
    if (prev) folderId = prev.folderId;
    const id = await SlopHub.put(d.toBlob(), { name, from: 'hex', folderId, meta: { versionOf: app.driveId, version: n } });
    tabs().api().setDriveId(T, id);
    T.version = n; d.name = name; d.markSaved();
    tabs().changed(T);
    refresh();
    SlopUI.toast(t('hex.app.saved', { name }));
  }

  /** Save as new file: the strip's Save as a new Drive file (drive.js picks the folder). A cancel keeps the link. */
  async function saveAs() {
    const T = app.cur; if (!T) return;
    const api = tabs().api(), prev = api.driveIdOf(T);
    api.setDriveId(T, null);
    const id = await api.saveToDrive(T);
    if (!id) { api.setDriveId(T, prev); return; }
    T.version = 1;
    refresh();
  }

  function download() {
    const d = app.doc; if (!d) return;
    SlopUI.download(d.toBlob(), d.name);
    status(t('hex.app.downloaded', { name: d.name }));
  }

  async function copySel() {
    const d = app.doc, r = selRange();
    if (!d) return;
    if (!r) { status(t('hex.app.select_first')); return; }
    const [lo, hi] = r, n = hi - lo + 1;
    if (n > MB) { status(t('hex.app.copy_max')); return; }
    const bytes = await d.readRange(lo, n);
    const text = Array.from(bytes, (b) => HB().hexOf(b)).join(' ');
    try { await navigator.clipboard.writeText(text); SlopUI.toast(t('hex.app.copied', { n })); }
    catch (e) { SlopUI.toast(t('hex.app.copy_failed', { error: e.message })); }
  }

  function gotoOffset(text) {
    const d = app.doc; if (!d) return false;
    const r = HB().parseOffset(text, d.size);
    if (r.error) { status(r.error); return false; }
    app.grid.select(r.value, r.value);
    status(t('hex.app.at', { at: HB().formatOffset(r.value, d.size) }));
    return true;
  }

  /** Find the next (dir 1) or previous (dir -1) match of the Find box, wrapping at the ends. */
  async function find(dir) {
    const d = app.doc; if (!d) return;
    const q = $('hx-q').value, hex = $('hx-mode').value === 'hex';
    const pat = hex ? HB().parseHex(q) : (q.length ? HB().textBytes(q) : null);
    if (!pat) { status(hex ? t('hex.app.need_hex') : t('hex.app.need_text')); return; }
    if (pat.length > d.size) { status(t('hex.app.not_found')); return; }
    const tok = ++app.findTok, stop = () => tok !== app.findTok;
    status(t('hex.app.searching'));
    const r0 = selRange();
    let from = dir > 0 ? (r0 ? r0[1] + 1 : 0) : (r0 ? r0[0] - 1 : d.size - 1);
    let r = await d.find(pat, from, dir, stop);
    if (r === null) return;
    let wrapped = false;
    if (r < 0) { wrapped = true; r = await d.find(pat, dir > 0 ? 0 : d.size - 1, dir, stop); if (r === null) return; }
    if (r < 0) { status(t('hex.app.not_found')); return; }
    app.grid.select(r, r + pat.length - 1);
    status(t(wrapped ? 'hex.app.found_wrapped' : 'hex.app.found', { at: HB().formatOffset(r, d.size), bytes: bytesN(pat.length) }));
  }

  function undo() {
    const r = app.doc && app.doc.undo();
    if (!r) { status(t('hex.app.no_undo')); return; }
    app.grid.select(r.at, r.at); app.grid.refresh(); changed(); status(t('hex.app.undone'));
  }
  function redo() {
    const r = app.doc && app.doc.redo();
    if (!r) { status(t('hex.app.no_redo')); return; }
    app.grid.select(r.at, r.at); app.grid.refresh(); changed(); status(t('hex.app.redone'));
  }

  // a language change: the facts on the right (size, selection, type) again in the new language
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { if (app.grid && app.cur) refresh(); });

  window.HexApp = {
    app, status, refresh, changed, isOpen, openBlob, pickComputer, pickDrive, saveVersion, saveAs, download, copySel,
    gotoOffset, find, undo, redo, computeSha, selRange, versionName, activate, deactivate,
    doc: () => app.doc, grid: () => app.grid,
  };
  // Convert… in the header (shared/convert/provided.js): the open file with its edits (an empty new tab is nothing).
  addEventListener('slop:convert-files', (e) => e.detail.provide(() => (app.doc && app.doc.size ? [{ name: app.doc.name, blob: app.doc.toBlob() }] : null)));
})();
