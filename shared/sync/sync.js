/* SlopSync: opt-in cloud backup to the person's own Google Drive or Dropbox. Classic script, window.SlopSync.
 *
 * Privacy contract: data leaves the device ONLY inside pushBackup, pullBackup, pushAppFile and pullAppFile,
 * each called from a button press. connect() only redirects to the provider's sign-in page. handleRedirect()
 * talks to the provider only when the URL carries an OAuth code from our own sign-in. Nothing runs on a timer.
 *
 * Every public function resolves to {ok, ...} or {ok: false, error: 'message'}; none throws into the UI. */
(function () {
  'use strict';
  const BACKUP_NAME = 'slopographic-backup.json';
  const APPS_FOLDER = 'Apps';
  const PENDING_KEY = 'slop-sync-pending';
  const PENDING_MAX_MS = 10 * 60 * 1000;

  const C = () => window.SlopSyncConfig;
  const P = () => window.SlopSyncPkce;
  const T = () => window.SlopSyncTokens;
  const PR = () => window.SlopSyncProviders || {};
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup2.js

  const fail = (error, extra) => Object.assign({ ok: false, error }, extra || {});

  function msg(e) {
    if (e && e.status === 401) return tr('ui.sync.expired');
    return (e && e.message) ? e.message : tr('ui.sync.wrong');
  }

  function providerModule(id) {
    const m = C().provider(id) ? PR()[id] : null;
    if (!m) throw new Error(tr('ui.sync.unknown'));
    return m;
  }

  // Remote names: a single path segment, no separators or control characters.
  function safeName(name) {
    const s = String(name == null ? '' : name);
    if (!s || s.length > 200 || s === '.' || s === '..' || /[\/\\\u0000-\u001f]/.test(s)) {
      throw new Error(tr('ui.sync.bad_cloud_name'));
    }
    return s;
  }

  // Pending sign-in lives in sessionStorage: it survives the redirect in this tab and is gone when the tab closes.
  function savePending(p) { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); }
  function takePending() {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      const p = raw ? JSON.parse(raw) : null;
      if (!p || Date.now() - p.createdAt > PENDING_MAX_MS) return null;
      return p;
    } catch (e) { return null; }
  }

  // What the provider call receives: a token for the cloud providers, nothing for the local folder.
  async function authFor(id) {
    return C().provider(id).local ? {} : { token: await validToken(id) };
  }

  // Returns a usable access token, refreshing it when needed. Throws when not connected.
  async function validToken(id) {
    const rec = await T().load(id);
    if (!rec) throw new Error('Not connected to ' + C().provider(id).label + '. Connect it first.');
    if (!T().needsRefresh(rec)) return rec.access;
    if (!rec.refresh) throw new Error(tr('ui.sync.expired'));
    const clientId = C().getClientId(id);
    if (!clientId) throw new Error(tr('ui.sync.need_id'));
    const t = await P().refresh(id, { clientId, refreshToken: rec.refresh });
    const next = { access: t.access, refresh: t.refresh || rec.refresh, expiresAt: t.expiresAt };
    await T().save(id, next);
    return next.access;
  }

  // The central "Export everything" module (shared/backup/central.js). Loads it on first use.
  async function central() {
    const SC = window.SlopCentral || (window.SlopBackup && await window.SlopBackup.central());
    if (!SC) throw new Error(tr('ui.sync.no_backup'));
    return SC;
  }

  // Builds the local backup file. No network.
  async function exportLocal() {
    const SC = await central();
    const out = await SC.exportEverything();
    if (!out || !out.blob || typeof out.blob.size !== 'number') throw new Error(tr('ui.sync.no_export'));
    return out;
  }

  // Reads, validates and migrates a backup (Blob or File), then applies it all or nothing. No network.
  async function restoreLocal(input) {
    const SC = await central();
    const p = await SC.plan(input);
    if (!p.ok) throw new Error(p.errors[0] || tr('ui.sync.invalid'));
    const r = await SC.apply(p);
    if (!r.ok) throw new Error(r.errors[0] || tr('ui.sync.not_restored'));
    return r;
  }

  const SlopSync = {
    BACKUP_NAME,
    APPS_FOLDER,

    // Stores the person's OAuth client ID. No network.
    configure(id, opts = {}) {
      if (!C().provider(id)) return fail(tr('ui.sync.unknown'));
      if (C().provider(id).local) return fail(tr('ui.sync.no_id_local'));
      return C().setClientId(id, opts.clientId);
    },

    // Starts the PKCE sign-in by navigating this page to the provider. No network from this page.
    async connect(id) {
      try {
        if (!C().provider(id)) return fail(tr('ui.sync.unknown'));
        if (C().provider(id).local) {
          const r = await PR().local.pick();
          return r.ok ? { ok: true, folder: r.name } : fail(r.error, { cancelled: !!r.cancelled, unsupported: !!r.unsupported });
        }
        const clientId = C().getClientId(id);
        if (!clientId) return fail(tr('ui.sync.need_id_panel'));
        const pk = await P().create();
        const redirectUri = C().redirectUri();
        savePending({ id, clientId, redirectUri, verifier: pk.verifier, state: pk.state, createdAt: Date.now() });
        window.location.assign(P().authUrl(id, { clientId, redirectUri, state: pk.state, challenge: pk.challenge }));
        return { ok: true, redirecting: true };
      } catch (e) { return fail(msg(e)); }
    },

    // Call once at page load. Returns null when the URL is not a sign-in return.
    async handleRedirect() {
      let id;
      try {
        const q = new URLSearchParams(window.location.search);
        if (!q.has('code') && !q.has('error')) return null;
        const pending = takePending();
        try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (e) { /* keep URL */ }
        if (!pending) return fail(tr('ui.sync.not_ours'));
        id = pending.id;
        if (q.has('error')) return fail(tr('ui.sync.refused'), { id });
        if (!P().checkState(pending.state, q.get('state'))) return fail(tr('ui.sync.state'), { id });
        const tokens = await P().exchangeCode(id, {
          clientId: pending.clientId,
          code: q.get('code'),
          verifier: pending.verifier,
          redirectUri: pending.redirectUri
        });
        await T().save(id, tokens);
        return { ok: true, id };
      } catch (e) { return fail(msg(e), { id }); }
    },

    // Connection state. Reads local storage only (no network).
    async status(id) {
      const p = C().provider(id);
      const base = {
        label: p ? p.label : '',
        configured: p && p.local ? true : !!C().getClientId(id),
        lastSync: C().getLastSync(id) || null
      };
      try {
        if (p && p.local) {
          const lm = PR().local;
          const c = lm ? await lm.chosen() : null;
          return Object.assign(base, { connected: !!c, folder: c ? c.name : '', supported: !!(lm && lm.supported()) });
        }
        const rec = await T().load(id);
        return Object.assign(base, { connected: !!rec });
      } catch (e) {
        return Object.assign(base, { connected: false, error: msg(e) });
      }
    },

    // Exports the local data and uploads it. The only path that sends the backup.
    async pushBackup(id) {
      try {
        const mod = providerModule(id);
        await central();
        const auth = await authFor(id);
        const { blob } = await exportLocal();
        await mod.upload(auth, BACKUP_NAME, blob);
        const at = Date.now();
        C().setLastSync(id, at);
        return { ok: true, at, bytes: blob.size };
      } catch (e) { return fail(msg(e)); }
    },

    // Downloads the backup and replaces local data. Refuses unless the caller passes confirmed: true
    // after showing the person a warning. Checked before any network call.
    async pullBackup(id, opts = {}) {
      try {
        if (opts.confirmed !== true) return fail(tr('ui.sync.confirm_first'));
        const mod = providerModule(id);
        await central();
        const auth = await authFor(id);
        const blob = await mod.download(auth, BACKUP_NAME);
        if (!blob) return fail(tr('ui.sync.none_cloud'));
        await restoreLocal(blob);
        return { ok: true, bytes: blob.size };
      } catch (e) { return fail(msg(e)); }
    },

    // Local file (no network): the "Download backup file" fallback. Returns { ok, blob, name }.
    async exportFile() {
      try {
        const out = await exportLocal();
        return { ok: true, blob: out.blob, name: out.name };
      } catch (e) { return fail(msg(e)); }
    },

    // Local file (no network): restores a backup file the person chose. Refuses unless confirmed: true.
    async restoreFile(file, opts = {}) {
      try {
        if (opts.confirmed !== true) return fail(tr('ui.sync.confirm_first'));
        const r = await restoreLocal(file);
        return { ok: true, applied: r.applied.length };
      } catch (e) { return fail(msg(e)); }
    },

    // Optional: upload one app file (e.g. a document) into the Apps folder.
    async pushAppFile(id, name, blob) {
      try {
        const mod = providerModule(id);
        if (!blob || typeof blob.size !== 'number') throw new Error(tr('ui.sync.no_upload'));
        const auth = await authFor(id);
        const out = await mod.upload(auth, safeName(name), blob, { folder: APPS_FOLDER });
        return { ok: true, name: out.name || name, bytes: blob.size };
      } catch (e) { return fail(msg(e)); }
    },

    // Optional: download one app file from the Apps folder. Returns it as a Blob; the caller decides what to do.
    async pullAppFile(id, name) {
      try {
        const mod = providerModule(id);
        const auth = await authFor(id);
        const blob = await mod.download(auth, safeName(name), { folder: APPS_FOLDER });
        if (!blob) return fail(tr('ui.sync.not_in_apps'));
        return { ok: true, blob };
      } catch (e) { return fail(msg(e)); }
    },

    // Forgets the tokens on this device. The provider grant stays until the person removes the app in
    // their Google Account or Dropbox settings (no network call here, by design).
    async disconnect(id) {
      try {
        if (!C().provider(id)) return fail(tr('ui.sync.unknown'));
        if (C().provider(id).local) {
          await PR().local.forget();
          C().setLastSync(id, 0);
          return { ok: true, note: tr('ui.sync.forgot') };
        }
        await T().clear(id);
        C().setLastSync(id, 0);
        return { ok: true, note: tr('ui.sync.disconnected') };
      } catch (e) { return fail(msg(e)); }
    }
  };

  window.SlopSync = SlopSync;
})();
