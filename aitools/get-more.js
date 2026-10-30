/* Slop AI Tools: "Get more" for one model. Opening the dialog fetches nothing. It shows what the model is, its
 * licence (name and link), where it comes from and how big it is. Only the Download button starts a download, and
 * the file is checked (length and SHA-256) before it is stored (models.js). Classic script; exposes window.SlopAIGetMore.
 * Used by the hub and by every tool page. */
(function (root) {
  'use strict';
  const doc = root.document, R = root.SlopAIModels, M = root.SlopAIManager;
  /** The text of an aitools.* key (aitools/i18n), or the English given: other apps' pages may not load these tables. */
  const tr = (k, en, v) => { const I = root.SlopI18n; return I && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  let host = null, onDone = null, onGone = null;

  /** Creates an element; children are nodes or text (never HTML). */
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
  const hostOf = (url) => { try { return new URL(url).hostname; } catch (e) { return 'this site'; } };

  /** Opens the dialog for one model. opts.onInstalled(id) runs after the model is stored; opts.onClose() when the dialog
   *  closes without it (Cancel, Close, Escape), so a caller waiting on the model can stop waiting. */
  function open(modelId, opts = {}) {
    const m = R.byId(modelId);
    if (!m) return null;
    close();
    onDone = opts.onInstalled || null;
    onGone = opts.onClose || null;
    const remote = R.remoteFiles(m), bytes = R.downloadBytes(m);
    // every place a file may come from: a cdn file names jsDelivr and its GitHub fallback (shared/cdn/assets.js)
    const places = (u) => (root.SlopCdn ? root.SlopCdn.candidates(u) : [u]);
    const hosts = [...new Set(remote.flatMap((f) => R.urlsOf(f).flatMap(places).map(hostOf)))].join(', ');
    const status = el('p', { class: 'ai-err', role: 'status' });
    const body = el('div', null,
      el('p', { class: 'ai-meta' }, m.arch),
      el('p', null, el('strong', null, tr('aitools.get.licence', 'Licence: ')), R.LICENCES[m.licence] + ' (' + m.licence + '). ',
        el('a', { href: m.upstream, target: '_blank', rel: 'noopener' }, tr('aitools.get.upstream', 'Upstream project'))),
      el('p', { class: 'ai-meta' }, m.sourceNote),
      el('p', { class: 'ai-meta' }, tr('aitools.get.source', 'Source: {hosts}.', { hosts: remote.length ? hosts : tr('aitools.get.bundled', 'bundled with this site') })),
      el('p', { class: 'ai-meta' }, remote.length ? tr('aitools.get.download_n', `Download: {size} in {n} ${remote.length === 1 ? 'file' : 'files'}. Each file is checked against its SHA-256 before it is stored on this device.`, { size: R.formatSize(bytes), n: remote.length }) : tr('aitools.get.nothing', 'Nothing to download. The model ships with the site.')),
      status);
    const cancel = el('button', { type: 'button', on: { click: close } }, tr('menu.cancel', 'Cancel'));
    const go = el('button', { type: 'button', class: 'ai-pri', on: { click: remote.length ? () => run(m, go, cancel, status) : close } }, remote.length ? tr('aitools.get.download', 'Download {size}', { size: R.formatSize(bytes) }) : tr('menu.close', 'Close'));
    host = el('div', { class: 'ai-ov', on: { click: (e) => { if (e.target === host) close(); } } },
      el('div', { class: 'ai-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'aiGetTitle' },
        el('header', null, el('h2', { id: 'aiGetTitle' }, tr('aitools.get.title', 'Get {name}', { name: m.name })), el('button', { type: 'button', on: { click: close } }, tr('menu.close', 'Close'))),
        el('div', { class: 'ai-body' }, body),
        el('footer', null, cancel, go)));
    doc.body.append(host);
    doc.addEventListener('keydown', onKey, true);
    go.focus();
    return { close };
  }
  function onKey(e) { if (e.key === 'Escape' && host) { e.stopPropagation(); close(); } }
  function close() {
    doc.removeEventListener('keydown', onKey, true);
    if (host) host.remove();
    const gone = onGone;
    host = null; onDone = null; onGone = null;
    if (gone) gone();
  }

  /** Downloads and stores the model. Any failure stores nothing and leaves the dialog open with the reason. */
  async function run(m, go, cancel, status) {
    go.disabled = true; cancel.disabled = true;
    try {
      await M.install(m.id, (p) => { status.textContent = tr('aitools.get.downloading', 'Downloading {file} ({i} of {n})…', { file: p.file, i: p.index, n: p.count }); });
    } catch (e) {
      status.textContent = tr('aitools.get.failed', 'Not installed: {error}. Nothing was stored.', { error: e.message });
      go.disabled = false; cancel.disabled = false;
      return;
    }
    const cb = onDone;
    onGone = null;   // installed: not a cancel
    close();
    if (cb) cb(m.id);
  }

  root.SlopAIGetMore = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);
