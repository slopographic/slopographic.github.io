/* Cloud sync: the ONE place provider settings live. Classic script, exposes window.SlopSyncConfig.
 * User settings (OAuth client IDs, last-sync times) are kept in localStorage under 'slop-sync'.
 * Tokens are never stored here (see tokens.js). Default client IDs are empty: the person adds their own. */
(function () {
  'use strict';
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup2.js
  const KEY = 'slop-sync';
  const CLIENT_ID_RE = /^[\w.-]{4,200}$/;

  const PROVIDERS = {
    gdrive: {
      id: 'gdrive',
      label: 'Google Drive',   // i18n-ignore: service names
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/drive.file',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      consoleUrl: 'https://console.cloud.google.com/apis/credentials',
      get consoleHelp() { return tr('ui.sync.help_gdrive'); }
    },
    dropbox: {
      id: 'dropbox',
      label: 'Dropbox',   // i18n-ignore: service names
      authUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
      scope: 'files.content.write files.content.read',
      extraAuthParams: { token_access_type: 'offline' },
      consoleUrl: 'https://www.dropbox.com/developers/apps',
      get consoleHelp() { return tr('ui.sync.help_dropbox'); }
    },
    // No sign-in and no network: a folder the person picks (a mounted NAS or network share counts as a folder).
    local: {
      id: 'local',
      get label() { return tr('ui.sync.local_label'); },
      local: true,
      consoleUrl: '',
      get consoleHelp() { return tr('ui.sync.help_local'); }
    }
  };

  const defaults = () => Object.fromEntries(Object.keys(PROVIDERS).map((id) => [id, { clientId: '', lastSync: 0 }]));

  function read() {
    const cfg = defaults();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        for (const id of Object.keys(PROVIDERS)) {
          const r = raw[id];
          if (!r || typeof r !== 'object') continue;
          if (typeof r.clientId === 'string') cfg[id].clientId = r.clientId;
          if (typeof r.lastSync === 'number' && r.lastSync > 0) cfg[id].lastSync = r.lastSync;
        }
      }
    } catch (e) { /* unreadable or blocked storage: fall back to defaults */ }
    return cfg;
  }

  function write(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; }
  }

  function provider(id) { return Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : null; }

  function getClientId(id) { return provider(id) ? read()[id].clientId : ''; }

  // Returns {ok, error?}. An empty value clears the client ID.
  function setClientId(id, value) {
    if (!provider(id)) return { ok: false, error: tr('ui.sync.unknown') };
    const v = String(value == null ? '' : value).trim();
    if (v && !CLIENT_ID_RE.test(v)) return { ok: false, error: tr('ui.sync.bad_id') };
    const cfg = read();
    cfg[id].clientId = v;
    return write(cfg) ? { ok: true } : { ok: false, error: tr('ui.sync.blocked') };
  }

  function getLastSync(id) { return provider(id) ? read()[id].lastSync || 0 : 0; }

  function setLastSync(id, ts) {
    if (!provider(id)) return false;
    const cfg = read();
    cfg[id].lastSync = ts > 0 ? ts : 0;
    return write(cfg);
  }

  // The redirect URI is the page itself (origin + path, without query or hash).
  function redirectUri() { return window.location.origin + window.location.pathname; }

  function consoleUrl(id) { return provider(id) ? provider(id).consoleUrl : ''; }

  window.SlopSyncConfig = { PROVIDERS, provider, providerIds: () => Object.keys(PROVIDERS), getClientId, setClientId, getLastSync, setLastSync, redirectUri, consoleUrl, KEY };
})();
