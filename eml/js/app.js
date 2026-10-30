/* Slop EML: app state and actions. Classic script; exposes window.EmlApp. Nothing is uploaded: files are read in this page.
 * Each open message is a doc: { id, name, size, bytes (the original file), msg (EmlMime.parse result), summary, time (the
 * Date header in ms, or null), attachments, view: 'html' | 'text', cids: bool, pinned: bool, rev: how often replace() changed it }. A mailbox (.mbox) opens as
 * one doc per message (eml/js/mbox.js). A message opened on its own is pinned (it gets a tab); a batch goes to the list.
 * The list's state: the ticked messages (checked), the sort and the search (eml/js/batch.js does the work).
 * Listeners (subscribe) run after every change, and the view redraws. */
(function () {
  'use strict';
  const M = window.EmlMime, B = window.EmlBatch, X = window.EmlMbox;
  const listeners = [];
  let seq = 0, curId = null, quiet = 0;
  const docs = [];
  const checked = new Set();
  const list = { sort: 'date', dir: 'desc', query: '' };
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const notify = () => { if (quiet) return; listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); };

  const find = (id) => docs.find((d) => d.id === id) || null;
  const current = () => find(curId);
  /** Is a message of this name and size open? (The same file again is not opened twice.) */
  function isOpen(name, size) { return docs.some((d) => d.name === name && d.size === size && !d.fromMbox); }

  function add(bytes, name, extra) {
    const msg = M.parse(bytes), summary = M.summary(msg), d = window.EmlCodec.parseDate(summary.date);
    const doc = Object.assign({
      id: ++seq, name, size: bytes.length, bytes, msg, summary, time: d ? d.getTime() : null, attachments: msg.attachments,
      view: msg.html != null ? 'html' : 'text', cids: false, pinned: false,
    }, extra);
    docs.push(doc);
    return doc;
  }
  /** Reads one .eml or .mbox file. Resolves with the (first) doc. Throws when the file cannot be read at all.
   *  opts.pin: give it a tab (default: true for a single .eml). */
  async function openFile(file, opts = {}) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name || 'message.eml';
    let first;
    if (X.isMbox(name, bytes.subarray(0, 8))) {
      const parts = X.split(bytes);
      if (!parts.length) throw new Error(t('eml.err.no_messages'));
      const stem = name.replace(/\.(mbox|mbx)$/i, '') || 'mailbox', w = String(parts.length).length;
      parts.forEach((p, i) => { const d = add(p, stem + ' ' + String(i + 1).padStart(w, '0') + '.eml', { fromMbox: name }); if (!first) first = d; });
    } else {
      first = add(bytes, name, { pinned: opts.pin !== false });
    }
    curId = first.id;
    notify();
    return first;
  }
  /** Opens several files in turn; two or more are a batch (not pinned), redrawn once. Returns { opened, failed }. */
  async function openFiles(files) {
    const all = Array.from(files), res = { opened: [], failed: [] };
    quiet++;
    try {
      for (const f of all) {
        try { await openFile(f, { pin: all.length === 1 }); res.opened.push(f.name); } catch (e) { res.failed.push({ name: f.name, reason: (e && e.message) || t('eml.err.unreadable') }); }
      }
    } finally { quiet--; }
    notify();
    return res;
  }
  /** The list as shown: searched and sorted. */
  function visible() { return B.sort(B.search(docs, list.query), list.sort, list.dir); }
  function select(id) { if (find(id)) { curId = id; notify(); } }
  function close(id) {
    const i = docs.findIndex((d) => d.id === id);
    if (i < 0) return;
    docs.splice(i, 1);
    checked.delete(id);
    if (curId === id) curId = docs.length ? docs[Math.min(i, docs.length - 1)].id : null;
    notify();
  }
  /** The same message with new bytes (the assistant added a recipient or an attachment): read again, same id and place. */
  function replace(id, bytes) {
    const doc = find(id);
    if (!doc) return null;
    const msg = M.parse(bytes), summary = M.summary(msg), d = window.EmlCodec.parseDate(summary.date);
    Object.assign(doc, { size: bytes.length, bytes, msg, summary, time: d ? d.getTime() : null, attachments: msg.attachments, rev: (doc.rev || 0) + 1 });
    if (doc.view === 'html' && msg.html == null) doc.view = 'text';
    notify();
    return doc;
  }
  function closeAll() { docs.length = 0; checked.clear(); curId = null; notify(); }
  function step(dir) {
    const v = visible();
    if (!v.length) return;
    const i = Math.max(0, v.findIndex((d) => d.id === curId));
    select(v[(i + dir + v.length) % v.length].id);
  }
  function setView(view, doc = current()) {
    if (!doc) return;
    if (view === 'html' && doc.msg.html == null) return;
    if (view === 'text' && doc.msg.text == null) return;
    doc.view = view;
    notify();
  }
  function toggleCids(doc = current()) { if (!doc) return; doc.cids = !doc.cids; notify(); }
  function togglePin(doc = current()) { if (!doc) return; doc.pinned = !doc.pinned; notify(); }
  function attachmentBlob(doc, index) {
    const a = doc.msg.attachments[index];
    return a ? { blob: new Blob([a.bytes], { type: B.typeOf(a.name, a.type) }), name: a.name } : null;
  }
  /* Ticks */
  function check(id, on) { if (on) checked.add(id); else checked.delete(id); notify(); }
  function checkMany(ids, on) { for (const id of ids) { if (on) checked.add(id); else checked.delete(id); } notify(); }
  function checkAll(on) { checked.clear(); if (on) for (const d of visible()) checked.add(d.id); notify(); }
  const checkedDocs = () => visible().filter((d) => checked.has(d.id));
  function setList(patch) { Object.assign(list, patch); notify(); }

  window.EmlApp = {
    docs: () => docs.slice(),
    current, find, isOpen, openFile, openFiles, replace, select, close, closeAll, step, setView, toggleCids, togglePin, attachmentBlob,
    visible, check, checkMany, checkAll, checkedDocs, isChecked: (id) => checked.has(id), listState: () => Object.assign({}, list), setList,
    subscribe(fn) { listeners.push(fn); },
    /** The file name of a doc without .eml, for the PDF and the print title. */
    baseName(doc) { return String(doc.name || 'message').replace(/\.(eml|mail|msg)$/i, '') || 'message'; },
  };
})();
