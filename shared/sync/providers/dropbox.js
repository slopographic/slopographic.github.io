/* Dropbox provider: thin fetch wrappers over the Dropbox HTTP API (files.content.read / write).
 * Classic script, exposes window.SlopSyncProviders.dropbox.
 * Every method takes an auth object {token} first. HTTP failures throw an Error with .status and .summary.
 * Names are plain file names. opts.folder is an optional top-level folder such as 'Apps'. */
(function () {
  'use strict';
  const CONTENT = 'https://content.dropboxapi.com/2/files';
  const RPC = 'https://api.dropboxapi.com/2/files';

  const pathFor = (name, folder) => '/' + (folder ? folder + '/' : '') + name;

  // Dropbox-API-Arg must be ASCII: escape every character above 0x7e as \uXXXX.
  const apiArg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

  async function req(token, url, init = {}) {
    const headers = Object.assign({ Authorization: 'Bearer ' + token }, init.headers || {});
    const res = await fetch(url, Object.assign({}, init, { headers }));
    if (!res.ok) {
      let summary = '';
      try { summary = String((await res.json()).error_summary || ''); } catch (x) { /* no body */ }
      const e = new Error(window.SlopI18n ? window.SlopI18n.t(summary ? 'ui.sync.http_why' : 'ui.sync.http', { name: 'Dropbox', status: String(res.status), why: summary ? summary.trim() : '' }) : 'HTTP ' + res.status);   // i18n-ignore: service names
      e.status = res.status;
      e.summary = summary;
      throw e;
    }
    return res;
  }

  const rpc = (token, endpoint, body) => req(token, RPC + '/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const isNotFound = (e) => e && e.status === 409 && /not_found/.test(e.summary || '');

  // Overwrites the file at the same path (mode 'overwrite'). Dropbox creates missing parent folders.
  async function upload(auth, name, blob, opts = {}) {
    const path = pathFor(name, opts.folder);
    const res = await req(auth.token, CONTENT + '/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': apiArg({ path, mode: 'overwrite', autorename: false, mute: true, strict_conflict: false })
      },
      body: blob
    });
    const j = await res.json();
    return { id: j.id, name: j.name || name, path: j.path_display || path };
  }

  // Returns a Blob, or null when the file does not exist.
  async function download(auth, name, opts = {}) {
    try {
      const res = await req(auth.token, CONTENT + '/download', {
        method: 'POST',
        headers: { 'Dropbox-API-Arg': apiArg({ path: pathFor(name, opts.folder) }) }
      });
      return res.blob();
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  // Lists plain files whose name starts with prefix (single folder, follows pagination).
  async function list(auth, prefix = '', opts = {}) {
    const path = opts.folder ? '/' + opts.folder : '';
    let entries = [];
    try {
      let j = await (await rpc(auth.token, 'list_folder', { path, recursive: false, limit: 200 })).json();
      entries = entries.concat(j.entries || []);
      while (j.has_more) {
        j = await (await rpc(auth.token, 'list_folder/continue', { cursor: j.cursor })).json();
        entries = entries.concat(j.entries || []);
      }
    } catch (e) {
      if (isNotFound(e)) return [];
      throw e;
    }
    return entries
      .filter((e) => e['.tag'] === 'file' && e.name.startsWith(prefix))
      .map((e) => ({ id: e.id, name: e.name, size: e.size || 0, modified: e.server_modified || '' }));
  }

  window.SlopSyncProviders = window.SlopSyncProviders || {};
  window.SlopSyncProviders.dropbox = { label: 'Dropbox', upload, download, list };   // i18n-ignore: service names
})();
