/* SlopAIKit cloud signin: "Sign in with OpenRouter", the one-click way to a key (OAuth PKCE, no client secret, no server
 * of ours). Classic script; adds SlopAIKit.cloud.signin = { start(p, { remember }), capture(), returned(), finish(),
 * here(), go(url), KEY }. A provider offers it with a `signin` entry in the catalog (cloud/catalog/main.js:
 * { auth, keys, manage }); connect.js shows the button, pick.js and free-guide.js say it is there.
 *   start(p): a PKCE pair and a state from shared/sync/pkce.js (the one PKCE helper), kept in this tab (sessionStorage
 *     KEY, with "Remember on this device"), then go(<p.signin.auth>?callback_url=<this page>&code_challenge=…&state=…).
 *     The callback is this page's own address, so any build of the site (a white-label origin too) gets its sign-in.
 *   capture(): runs as soon as this file is parsed. Back from the provider with ?code= (or ?error=) and a sign-in
 *     started in this tab: the parameters are moved into that tab's record and taken out of the address at once
 *     (history.replaceState), so the code is never left in the address bar, history or a shared link. A page without
 *     a sign-in of its own in this tab is left as it is (?code= may be some other page's).
 *   returned() → the provider id when a sign-in is waiting to finish, else ''. shell/header.js opens the AI panel for
 *     it and panel.js shows the model choice, whose form (connect.js) calls finish().
 *   finish() → { provider }: checks the state (pkce.checkState, so a code that did not start here is refused: CSRF),
 *     then POSTs { code, code_verifier, code_challenge_method } to p.signin.keys, straight from this browser to the
 *     provider, and stores the key it returns exactly like a pasted key (keys.js: this tab, or this device when
 *     "Remember on this device" was on). Throws an Error with a plain message (and .reason: denied, state, used,
 *     offline, failed). Each sign-in finishes once; the same code again says it was used.
 * The key belongs to the person's OpenRouter account: they can cap or revoke it at p.signin.manage. Forget key removes
 * it from this browser, as for a pasted key. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {});
  if (C.signin) return;   // shell/header.js may have loaded it before the panel's kit asks for it
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai9.js
  const KEY = 'slop-ai.signin', TTL = 15 * 60 * 1000, PARAMS = ['code', 'state', 'error', 'error_description'];

  function read() {
    try { const r = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return r && Date.now() - r.at < TTL ? r : null; } catch (e) { return null; }
  }
  function write(r) {
    try { if (r) sessionStorage.setItem(KEY, JSON.stringify(r)); else sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
  }
  /** This page's address without the sign-in's parameters and the fragment: where the provider sends the person back. */
  function here() {
    const u = new URL(location.href);
    for (const k of PARAMS) u.searchParams.delete(k);
    u.hash = '';
    return u.href;
  }

  async function start(p, o = {}) {
    const P = window.SlopSyncPkce, s = p && p.signin;
    if (!s) throw new Error('signin: ' + (p && p.id) + ' has no sign-in');
    if (!P || !window.crypto || !crypto.subtle) throw new Error(T('ui.ai.cloud.or_no_crypto', { name: p.short }));
    const { verifier, challenge, state } = await P.create();
    write({ provider: p.id, verifier, state, at: Date.now(), remember: !!o.remember });
    const u = new URL(s.auth);
    u.searchParams.set('callback_url', here());
    u.searchParams.set('code_challenge', challenge);
    u.searchParams.set('code_challenge_method', 'S256');
    u.searchParams.set('state', state);
    u.searchParams.set('key_label', T('ui.ai.cloud.or_key_label'));
    C.signin.go(u.href);
    return u.href;
  }

  function capture() {
    const r = read();
    if (!r || r.got) return false;
    let sp; try { sp = new URLSearchParams(location.search); } catch (e) { return false; }
    if (!sp.has('code') && !sp.has('error')) return false;
    // a sign-in that already finished in this tab, and its code again (Back, a reload of an old address): it was used
    r.got = r.used ? { again: true } : { code: sp.get('code') || '', state: sp.get('state') || '', error: sp.get('error') || '' };
    write(r);
    const hash = location.hash;
    try { history.replaceState(history.state, '', here() + hash); } catch (e) { /* a sandboxed page: nothing to clean */ }
    return true;
  }
  const returned = () => { const r = read(); return r && r.got ? r.provider : ''; };

  const fail = (reason, vars) => Object.assign(new Error(T('ui.ai.cloud.or_' + reason, vars)), { reason });

  async function finish() {
    const r = read();
    if (!r || !r.got) return null;
    const got = r.got, p = C.byId && C.byId(r.provider), name = p ? p.short : r.provider;
    const no = (reason, vars) => fail(reason, Object.assign({ name }, vars));
    write({ provider: r.provider, at: r.at, used: true });   // once: a second finish (a language change, a reload) has nothing to do
    if (got.again) throw no('used');
    if (got.error || !got.code) throw no('denied');
    if (!window.SlopSyncPkce || !SlopSyncPkce.checkState(r.state, got.state)) throw no('state');
    if (!p || !p.signin) throw no('failed', { why: r.provider });
    if (navigator.onLine === false) throw no('offline');
    let res, json = null;
    try {
      res = await fetch(p.signin.keys, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: got.code, code_verifier: r.verifier, code_challenge_method: 'S256' }) });
    } catch (e) { throw no(navigator.onLine === false ? 'offline' : 'network'); }
    try { json = await res.json(); } catch (e) { json = null; }
    const why = json && ((json.error && (json.error.message || json.error)) || json.message);
    // 403: "Invalid code or code_verifier" or "Authorization code expired" (codes last ten minutes)
    if (res.status === 403) throw no('used');
    if (!res.ok || !json || typeof json.key !== 'string' || !json.key) throw no('failed', { why: String(why || 'HTTP ' + res.status).slice(0, 200) });
    await C.keys.set(p.id, json.key, { remember: !!r.remember });
    return { provider: p.id, remember: !!r.remember };
  }

  C.signin = { start, capture, returned, finish, here, go: (url) => location.assign(url), KEY };
  capture();
})();
