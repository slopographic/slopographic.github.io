/* OAuth 2.0 authorization code flow with PKCE (S256). Classic script, exposes window.SlopSyncPkce.
 * Uses crypto.getRandomValues and crypto.subtle only. Network: the provider token endpoint, and only
 * when exchangeCode / refresh is called (from sync.js, which is itself only called on user action). */
(function () {
  'use strict';
  const tr = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);   // words: shared/i18n/ui/<code>/backup2.js

  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomString(nBytes) {
    const a = new Uint8Array(nBytes);
    crypto.getRandomValues(a);
    return b64url(a);
  }

  // RFC 7636 S256: BASE64URL(SHA256(ASCII(verifier))).
  async function challengeFor(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return b64url(new Uint8Array(digest));
  }

  // 48 random bytes -> 64 unreserved characters (RFC 7636 allows 43 to 128).
  async function create() {
    const verifier = randomString(48);
    return { verifier, challenge: await challengeFor(verifier), state: randomString(24) };
  }

  function authUrl(id, { clientId, redirectUri, state, challenge }) {
    const p = window.SlopSyncConfig.provider(id);
    if (!p) throw new Error(tr('ui.sync.unknown'));
    const u = new URL(p.authUrl);
    const params = Object.assign({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: p.scope,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }, p.extraAuthParams);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  // Constant-time-ish comparison; both values must be non-empty strings.
  function checkState(expected, got) {
    if (typeof expected !== 'string' || typeof got !== 'string' || !expected || expected.length !== got.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
  }

  async function postToken(id, fields) {
    const p = window.SlopSyncConfig.provider(id);
    if (!p) throw new Error(tr('ui.sync.unknown'));
    const res = await fetch(p.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString()
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || !json || !json.access_token) {
      const why = (json && (json.error_description || json.error)) || ('HTTP ' + res.status);
      throw new Error(p.label + ' did not accept the sign-in: ' + String(why).slice(0, 200));
    }
    return {
      access: json.access_token,
      refresh: json.refresh_token || null,
      expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000
    };
  }

  function exchangeCode(id, { clientId, code, verifier, redirectUri }) {
    return postToken(id, {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier
    });
  }

  function refresh(id, { clientId, refreshToken }) {
    return postToken(id, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
  }

  window.SlopSyncPkce = { randomString, challengeFor, create, authUrl, checkState, exchangeCode, refresh };
})();
