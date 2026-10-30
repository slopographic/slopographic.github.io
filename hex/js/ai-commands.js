/* Slop Hex for the assistant: SlopCmd commands with arguments (shared/commands/args.js), loaded on demand by
 * SlopCmd.prepare() (commands.js). Through HexApp and the document model (doc.js): new_file (bytes from hex or text, in
 * a new tab), open_file (from Slop Drive), set_bytes (overwrite at an offset: one undo step), insert_bytes and
 * append_bytes (the file grows), delete_bytes (it shrinks), find_bytes, save_version (a new Drive file beside the
 * original, as Save version does) and export_file (Slop Drive and/or a download). state() describes the open file;
 * the checkpoint undoes back. */
(function () {
  'use strict';
  const C = window.SlopCmd, A = () => window.HexApp, B = () => window.HexBytes;
  if (!C || C.get('hex.ai.set-bytes')) return;
  const list = [];
  const add = C.aiAdder('hex', list);   // shared/commands/commands.js
  const doc = () => { const d = A().doc(); if (!d) throw new Error('No file is open'); return d; };
  /** Bytes from hex text ("4D 5A") or plain text (UTF-8). */
  function bytesOf(a) {
    if (a.hex != null && a.hex !== '') { const b = B().parseHex(a.hex); if (!b) throw new Error('hex must be whole bytes, like 4D 5A'); return b; }
    if (a.text != null) return B().textBytes(a.text);
    throw new Error('Give hex or text');
  }
  const offset = (v, size) => { const r = B().parseOffset(String(v), size); if (r.error) throw new Error(r.error); return r.value; };
  const BYTES = [{ name: 'hex', type: 'string', maxLength: 200000, description: 'bytes as hex, like 4D 5A 00' }, { name: 'text', type: 'string', maxLength: 100000, description: 'or text, written as UTF-8' }];

  add('new_file', 'New file', [{ name: 'name', type: 'string', maxLength: 200, default: 'untitled.bin' }].concat(BYTES), async (a) => {
    const b = a.hex || a.text ? bytesOf(a) : new Uint8Array(0);
    await A().openBlob(new Blob([b]), { name: a.name });
    return `Opened ${a.name} (${b.length} bytes) in a new tab. Use save_version or export_file to keep it.`;
  });
  add('open_file', 'Open a Slop Drive file', [{ name: 'file', type: 'string', required: true, maxLength: 300, description: 'Slop Drive name or id' }], async (a) => {
    const H = window.SlopHub, s = String(a.file).toLowerCase(), all = await H.list();   // intake-ok: an AI command looks a Drive file up by name or id (a lookup; the person's picker is SlopIntake.fromDrive)
    const hit = all.find((f) => f.id === a.file) || all.find((f) => f.name.toLowerCase() === s) || all.find((f) => f.name.toLowerCase().includes(s));
    if (!hit) throw new Error(`No Slop Drive file “${a.file}”`);
    const rec = await H.get(hit.id);
    await A().openBlob(rec.blob, { name: rec.name, driveId: rec.id });
    return `Opened ${rec.name} (${rec.blob.size} bytes, ${B().guessType(new Uint8Array(await rec.blob.slice(0, 64).arrayBuffer()))}).`;
  });
  add('set_bytes', 'Overwrite bytes', [{ name: 'offset', type: 'string', required: true, maxLength: 20, description: 'decimal or 0x hex' }].concat(BYTES), async (a) => {
    const d = doc(), at = offset(a.offset, d.size), b = bytesOf(a);
    if (at + b.length > d.size) throw new Error(`That runs past the end: the file has ${d.size} bytes and the bytes stop at ${at + b.length}. Bytes are overwritten, not inserted.`);
    await d.load(at, b.length);
    const ok = d.write(Array.from(b, (v, i) => ({ at: at + i, value: v })));
    A().grid().select(at, at + b.length - 1); A().grid().refresh(); A().changed();
    return ok ? `Wrote ${b.length} byte(s) at ${B().formatOffset(at, d.size)}.` : 'Those bytes were already there.';
  });
  /** Insert and/or delete through the document (one undo step), then show the changed bytes. */
  function splice(d, at, remove, b) {
    if (!d.splice(at, remove, b)) return false;
    if (d.size) A().grid().select(Math.min(at, d.size - 1), Math.min(d.size - 1, at + Math.max(1, b.length) - 1));
    A().grid().refresh(); A().changed();
    return true;
  }
  add('insert_bytes', 'Insert bytes', [{ name: 'offset', type: 'string', required: true, maxLength: 20, description: 'where the new bytes go: decimal, 0x hex or end; the bytes from there on move up' }].concat(BYTES), async (a) => {
    const d = doc(), at = /^\s*(end|size)\s*$/i.test(String(a.offset)) ? d.size : offset(a.offset, d.size + 1), b = bytesOf(a);
    if (!b.length) throw new Error('Give at least one byte');
    splice(d, at, 0, b);
    return `Inserted ${b.length} byte(s) at ${B().formatOffset(at, d.size)}. The file now has ${d.size} bytes.`;
  });
  add('append_bytes', 'Append bytes', BYTES, async (a) => {
    const d = doc(), at = d.size, b = bytesOf(a);
    if (!b.length) throw new Error('Give at least one byte');
    splice(d, at, 0, b);
    return `Appended ${b.length} byte(s) at ${B().formatOffset(at, d.size)}. The file now has ${d.size} bytes.`;
  });
  add('delete_bytes', 'Delete bytes', [{ name: 'offset', type: 'string', required: true, maxLength: 20, description: 'the first byte to remove, decimal or 0x hex' },
    { name: 'count', type: 'number', integer: true, required: true, min: 1, description: 'how many bytes to remove; the bytes after them move down' }], async (a) => {
    const d = doc(), at = offset(a.offset, d.size), n = Math.min(Math.floor(a.count), d.size - at);
    splice(d, at, n, new Uint8Array(0));
    return `Deleted ${n} byte(s) at ${B().formatOffset(at, d.size + n)}. The file now has ${d.size} bytes.`;
  });
  add('find_bytes', 'Find bytes or text', BYTES.concat([{ name: 'from', type: 'string', maxLength: 20, default: '0' }]), async (a) => {
    const d = doc(), pat = bytesOf(a), i = await d.find(pat, offset(a.from, Math.max(1, d.size)), 1, () => false);
    if (i < 0) return 'Not found.';
    A().grid().select(i, i + pat.length - 1);
    return `Found at ${B().formatOffset(i, d.size)} (${i}).`;
  }, { macro: false });
  add('save_version', 'Save a version to Slop Drive', [], async () => {
    doc();
    if (!A().app.driveId) {   // a new file: its first Drive record, no folder picker
      const d = doc(), id = await window.SlopHub.put(d.toBlob(), { name: d.name, from: 'hex' });
      const api = window.HexTabs && window.HexTabs.api();
      if (api) api.setDriveId(A().app.cur, id);
      d.markSaved(); A().refresh();
      return `Saved ${d.name} to Slop Drive (id ${id}).`;
    }
    await A().saveVersion();
    return `Saved ${doc().name} to Slop Drive (id ${A().app.driveId}).`;
  });
  add('export_file', 'Export the file', [{ name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'download' }, { name: 'name', type: 'string', maxLength: 200 }], async (a) => {
    const d = doc(), name = a.name || d.name, blob = d.toBlob(), out = [];
    if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'hex' })})`);
    if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  });

  function state() {
    const d = A().doc();
    if (!d) return { app: 'Slop Hex', open: null };
    const r = A().selRange();
    return { app: 'Slop Hex', name: d.name, size: d.size, unsaved: d.dirty(), selection: r ? { from: r[0], to: r[1] } : null, canUndo: d.canUndo() };
  }
  /** The open file as it is now: the rollback undoes back to this depth (one more undo per step the assistant took). */
  function checkpoint() {
    const d = A().doc(), n = d ? d.undoDepth() : 0;
    return () => {
      const cur = A().doc();
      if (!cur || cur !== d) return false;
      while (cur.undoDepth() > n) cur.undo();
      A().grid().refresh(); A().changed();
      return true;
    };
  }
  C.register(list);
  C.provide({ state, checkpoint });
})();
