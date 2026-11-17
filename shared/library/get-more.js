/* Slopographic "Get more": an opt-in dialog that lists the font packs in shared/library/packs.json.
 * Rules: nothing is downloaded on open, on load or by a timer. A pack downloads only after the person
 * presses its Download button and then Download in the confirmation, which shows the licence and size.
 * Every file must match its manifest SHA-256 and byte length before anything is stored; a pack is written to
 * IndexedDB (slop-library) in one go or not at all (install.js does the download and the checks; load it first).
 * Classic script; exposes window.SlopLibrary. */
(function (root) {
  'use strict';
  const doc = root.document;
  let onDone = null;
  /** Tells the callback of the dialog that is open that the pack set changed (install.js tells every listener). */
  function notify(p) { if (onDone) { try { onDone(p); } catch (e) { /* ignore */ } } }
  let dialog = null, host = null;

  const M = () => root.SlopLibraryManifest, S = () => root.SlopLibraryStore;

  /** Creates an element; children may be nodes or strings (strings are text, never HTML). */
  function el(tag, attrs, ...kids) {
    const n = doc.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'on') for (const ev in attrs.on) n.addEventListener(ev, attrs.on[ev]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }

  /** packs.json and the installed packs come from SlopLibraryInstall (install.js), the one place packs are read and stored. */
  const I = () => root.SlopLibraryInstall;
  const loadManifest = () => I().loadManifest();
  const installedMap = () => I().installed();

  function css() {
    if (doc.getElementById('slop-lib-css')) return;
    doc.head.append(el('style', { id: 'slop-lib-css' }, `
.slop-lib-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000;font:13px system-ui,sans-serif}
.slop-lib{background:#fff;color:#111;border-radius:10px;width:min(560px,calc(100vw - 32px));max-height:80vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.slop-lib header,.slop-lib footer{padding:12px 16px;display:flex;gap:8px;align-items:center;justify-content:space-between}
.slop-lib h2{font-size:16px;margin:0}.slop-lib .body{padding:0 16px 12px;overflow:auto}
.slop-lib .pk{border-top:1px solid #ddd;padding:10px 0;display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.slop-lib .meta{color:#555;font-size:12px;margin-top:2px}.slop-lib .err{color:#a11;margin:6px 0}
.slop-lib button{font:inherit;padding:6px 10px;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer}
.slop-lib button.pri{background:#222;color:#fff;border-color:#222}.slop-lib button:disabled{opacity:.5;cursor:default}
@media (prefers-color-scheme:dark){.slop-lib{background:#1d1d20;color:#eee}.slop-lib .pk{border-color:#3a3a40}.slop-lib .meta{color:#aaa}.slop-lib button{background:#2a2a30;color:#eee;border-color:#555}.slop-lib button.pri{background:#eee;color:#111;border-color:#eee}}
`));
  }

  /** Opens the dialog. opts.onInstalled(pack) runs after a pack is stored. opts.packId opens that pack's confirmation
   * straight away (still no download until the person confirms there). */
  function open(opts = {}) {
    onDone = opts.onInstalled || null;
    css();
    if (host) host.remove();
    host = el('div', { class: 'slop-lib-ov', on: { click: (e) => { if (e.target === host) close(); } } });
    dialog = el('div', { class: 'slop-lib', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'slopLibTitle' });
    host.append(dialog);
    doc.body.append(host);
    doc.addEventListener('keydown', onKey, true);
    if (opts.packId) showPack(opts.packId); else showList();
    return { close };
  }
  /** The confirmation of one listed pack, or the list when the pack is missing or already installed. */
  async function showPack(id) {
    frame('Confirm download', el('p', { class: 'meta' }, 'Loading the pack…'), null);
    const m = await loadManifest(), p = m.packs.find((x) => x.id === id), inst = await installedMap();
    if (!dialog) return;
    if (!p) { showList('That pack is not listed.'); return; }
    if (inst[id]) { showList(`${p.name} is already installed.`); return; }
    showConfirm(p);
  }
  function onKey(e) { if (e.key === 'Escape' && host) { e.stopPropagation(); close(); } }
  function close() {
    onDone = null;
    if (host) host.remove();
    host = null; dialog = null;
    doc.removeEventListener('keydown', onKey, true);
  }
  function frame(title, body, footer) {
    dialog.replaceChildren(
      el('header', null, el('h2', { id: 'slopLibTitle' }, title), el('button', { type: 'button', on: { click: close } }, 'Close')),
      el('div', { class: 'body' }, body),
      el('footer', null, footer || el('span', null)));
  }

  /** Step 1: the list. Shows licence, size and the state of each pack. */
  async function showList(message) {
    frame('Get more', el('p', { class: 'meta' }, 'Optional packs from third-party sources (fonts, and AI models for Slop Upscale). Nothing is downloaded until you press Download and confirm.'), null);
    const body = dialog.querySelector('.body');
    body.append(el('p', { class: 'meta' }, 'Loading the pack list…'));
    const m = await loadManifest(), inst = await installedMap();
    if (!dialog) return;
    body.replaceChildren();
    if (message) body.append(el('p', { class: 'err', role: 'status' }, message));
    for (const e of m.errors) body.append(el('p', { class: 'err' }, e));
    if (!m.packs.length) { body.append(el('p', null, 'No extra packs are listed yet. The bundled fonts are always available.')); return; }
    for (const p of m.packs) body.append(packRow(p, inst[p.id]));
  }
  function packRow(p, rec) {
    const info = el('div', null, el('strong', null, p.name),
      el('div', { class: 'meta' }, 'Licence: ', p.licenceUrl ? el('a', { href: p.licenceUrl, target: '_blank', rel: 'noopener' }, M().LICENCES[p.licence]) : M().LICENCES[p.licence]),
      el('div', { class: 'meta' }, `${M().formatSize(p.size)} · ${p.files.length} ${p.files.length === 1 ? 'font file' : 'font files'}`),
      p.description ? el('div', { class: 'meta' }, p.description) : null);
    const act = rec
      ? el('span', null, el('span', { class: 'meta' }, 'Installed. '), el('button', { type: 'button', on: { click: () => removeInstalled(p) } }, 'Remove'))
      : el('button', { type: 'button', class: 'pri', on: { click: () => showConfirm(p) } }, 'Download…');
    return el('div', { class: 'pk' }, info, act);
  }

  /** Step 2: the confirmation. Nothing has been fetched yet. */
  function showConfirm(p) {
    // a cdn file names every host it may come from (jsDelivr, then GitHub as the fallback: shared/cdn/assets.js)
    const where = (f) => (f.cdn && root.SlopCdn ? root.SlopCdn.urls(f.cdn) : [f.url]);
    const hosts = [...new Set(p.files.flatMap((f) => where(f).map((u) => new URL(u).hostname)))].join(', ');
    const body = el('div', null,
      el('p', null, `Download ${p.name}?`),
      el('p', { class: 'meta' }, `Licence: ${M().LICENCES[p.licence]} (${p.licence}).`),
      el('p', { class: 'meta' }, `Size: ${M().formatSize(p.size)}, ${p.files.length} files, from ${hosts}.`),
      el('p', { class: 'meta' }, 'The files are checked against their SHA-256 before they are stored on this device.'));
    const status = el('p', { class: 'err', role: 'status' });
    const cancel = el('button', { type: 'button', on: { click: () => showList() } }, 'Cancel');
    const go = el('button', { type: 'button', class: 'pri', on: { click: () => install(p, go, cancel, status) } }, 'Download ' + M().formatSize(p.size));
    frame('Confirm download', el('div', null, body, status), el('span', null, cancel, ' ', go));
  }

  /** Downloads, verifies and stores one pack (install.js). Any failure stores nothing. */
  async function install(p, go, cancel, status) {
    go.disabled = true; cancel.disabled = true;
    try { await I().install(p, (t) => { status.textContent = t; }); } catch (e) {
      status.textContent = 'Not installed: ' + e.message + '. Nothing was stored.';
      go.disabled = false; cancel.disabled = false;
      return;
    }
    notify(p);
    showList(`${p.name} is installed. ${p.kind === 'model' ? 'Apps that use it can now load it.' : 'Its fonts are in every font picker.'}`);
  }

  async function removeInstalled(p) {
    try { await S().removePack(p.id); } catch (e) { showList('Could not remove ' + p.name + ': ' + e.message); return; }
    I().changed(null);
    notify(null);
    showList(`${p.name} was removed.`);
  }

  root.SlopLibrary = { open, close, loadManifest, onChange: (fn) => I().onChange(fn) };
})(typeof window !== 'undefined' ? window : globalThis);
