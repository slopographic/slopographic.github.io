/* Google Drive provider: thin fetch wrappers over the Drive v3 REST API, drive.file scope only.
 * Classic script, exposes window.SlopSyncProviders.gdrive.
 * Every method takes an auth object {token} first. HTTP failures throw an Error with .status set.
 * Names are plain file names. opts.folder is an optional top-level folder such as 'Apps'. */
(function () {
  'use strict';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';

  // Quote a value for a Drive query string ('...'), escaping backslash and quote.
  const lit = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

  async function call(token, url, init = {}) {
    const headers = Object.assign({ Authorization: 'Bearer ' + token }, init.headers || {});
    const res = await fetch(url, Object.assign({}, init, { headers }));
    if (!res.ok) {
      const e = new Error(window.SlopI18n ? window.SlopI18n.t('ui.sync.http', { name: 'Google Drive', status: String(res.status) }) : 'HTTP ' + res.status);   // i18n-ignore: service names
      e.status = res.status;
      try { const j = await res.json(); if (j && j.error && j.error.message) e.message += ' ' + String(j.error.message).slice(0, 200); } catch (x) { /* no body */ }
      throw e;
    }
    return res;
  }

  async function findFile(token, name, parent, mime) {
    const q = [`name = ${lit(name)}`, `${lit(parent)} in parents`, 'trashed = false'];
    if (mime) q.push(`mimeType = ${lit(mime)}`);
    const params = new URLSearchParams({ q: q.join(' and '), fields: 'files(id,name)', spaces: 'drive', pageSize: '10' });
    const j = await (await call(token, API + '?' + params)).json();
    return (j.files && j.files[0]) || null;
  }

  // Returns the parent id for a folder option: 'root' when none; creates the folder when create is true.
  async function folderId(token, folder, { create }) {
    if (!folder) return 'root';
    const found = await findFile(token, folder, 'root', FOLDER_MIME);
    if (found) return found.id;
    if (!create) return null;
    const res = await call(token, API + '?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folder, mimeType: FOLDER_MIME, parents: ['root'] })
    });
    return (await res.json()).id;
  }

  // Multipart upload: creates the file, or overwrites the existing file with the same name in that folder.
  async function upload(auth, name, blob, opts = {}) {
    const parent = await folderId(auth.token, opts.folder, { create: true });
    const existing = await findFile(auth.token, name, parent);
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const boundary = 'slopsync' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const meta = existing ? { name } : { name, parents: [parent] };
    const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: ' + (blob.type || 'application/octet-stream') + '\r\n\r\n';
    const body = new Blob([head, blob, '\r\n--' + boundary + '--']);
    const url = (existing ? UPLOAD + '/' + encodeURIComponent(existing.id) : UPLOAD) + '?uploadType=multipart&fields=id,name';
    const res = await call(auth.token, url, {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    });
    const j = await res.json();
    return { id: j.id, name: j.name || name };
  }

  // Returns a Blob, or null when no file with that name exists.
  async function download(auth, name, opts = {}) {
    const parent = await folderId(auth.token, opts.folder, { create: false });
    if (!parent) return null;
    const f = await findFile(auth.token, name, parent);
    if (!f) return null;
    const res = await call(auth.token, API + '/' + encodeURIComponent(f.id) + '?alt=media');
    return res.blob();
  }

  // Lists files whose name starts with prefix. Drive's 'contains' is a word match, so filter here.
  async function list(auth, prefix = '', opts = {}) {
    const parent = await folderId(auth.token, opts.folder, { create: false });
    if (!parent) return [];
    const q = [`${lit(parent)} in parents`, 'trashed = false'];
    if (prefix) q.push(`name contains ${lit(prefix)}`);
    const params = new URLSearchParams({ q: q.join(' and '), fields: 'files(id,name,size,modifiedTime)', spaces: 'drive', pageSize: '100' });
    const j = await (await call(auth.token, API + '?' + params)).json();
    return (j.files || [])
      .filter((f) => f.name.startsWith(prefix))
      .map((f) => ({ id: f.id, name: f.name, size: Number(f.size) || 0, modified: f.modifiedTime || '' }));
  }

  window.SlopSyncProviders = window.SlopSyncProviders || {};
  window.SlopSyncProviders.gdrive = { label: 'Google Drive', upload, download, list };   // i18n-ignore: service names
})();
