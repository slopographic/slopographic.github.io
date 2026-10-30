// Unit tests for shared/sync: sign-in, PKCE, config, tokens, refresh and the rule that nothing
// goes over the network without a button press. No network: fetch is a recording stub.
// Provider request construction is in sync-providers.test.mjs. Run: node tests/run.mjs sync
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedTokens, reply, defaultFetch } from './sync-helpers.mjs';
import { setLang } from './ui-i18n-en.mjs';

const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
// ---------- PKCE ----------
test('PKCE verifier is 64 unreserved characters and state is set', async () => {
  const env = await makeEnv();
  const pk = await env.ctx.SlopSyncPkce.create();
  assert.equal(pk.verifier.length, 64);
  assert.match(pk.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(pk.state, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(pk.challenge, await env.ctx.SlopSyncPkce.challengeFor(pk.verifier));
  const pk2 = await env.ctx.SlopSyncPkce.create();
  assert.notEqual(pk.verifier, pk2.verifier);
});

test('S256 challenge matches the RFC 7636 appendix B vector', async () => {
  const env = await makeEnv();
  assert.equal(await env.ctx.SlopSyncPkce.challengeFor(RFC_VERIFIER), RFC_CHALLENGE);
});

test('Google authorization URL carries the required PKCE and offline parameters', async () => {
  const env = await makeEnv();
  const u = new URL(env.ctx.SlopSyncPkce.authUrl('gdrive', { clientId: 'cid.apps', redirectUri: 'https://apps.example.com/pdf/', state: 'S', challenge: 'C' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('client_id'), 'cid.apps');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://apps.example.com/pdf/');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(u.searchParams.get('state'), 'S');
  assert.equal(u.searchParams.get('code_challenge'), 'C');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('access_type'), 'offline');
});

test('Dropbox authorization URL carries offline access and the two file scopes', async () => {
  const env = await makeEnv();
  const u = new URL(env.ctx.SlopSyncPkce.authUrl('dropbox', { clientId: 'dbkey123', redirectUri: 'https://apps.example.com/pdf/', state: 'S', challenge: 'C' }));
  assert.equal(u.origin + u.pathname, 'https://www.dropbox.com/oauth2/authorize');
  assert.equal(u.searchParams.get('client_id'), 'dbkey123');
  assert.equal(u.searchParams.get('token_access_type'), 'offline');
  assert.equal(u.searchParams.get('scope'), 'files.content.write files.content.read');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
});

test('state mismatch is rejected, empty state is rejected', async () => {
  const env = await makeEnv();
  const c = env.ctx.SlopSyncPkce;
  assert.equal(c.checkState('abc123', 'abc124'), false);
  assert.equal(c.checkState('abc123', 'abc12'), false);
  assert.equal(c.checkState('', ''), false);
  assert.equal(c.checkState('abc123', undefined), false);
  assert.equal(c.checkState('abc123', 'abc123'), true);
});

// ---------- config ----------
test('config defaults to empty client IDs and rejects malformed ones', async () => {
  const env = await makeEnv();
  const C = env.ctx.SlopSyncConfig;
  assert.equal(C.getClientId('gdrive'), '');
  assert.equal(C.getClientId('dropbox'), '');
  assert.equal(C.setClientId('gdrive', 'has spaces in it').ok, false);
  assert.equal(C.setClientId('nope', 'abcd').ok, false);
  assert.equal(C.setClientId('gdrive', ' 123-abc.apps.googleusercontent.com ').ok, true);
  assert.equal(C.getClientId('gdrive'), '123-abc.apps.googleusercontent.com');
  assert.match(env.ctx.localStorage.getItem('slop-sync'), /123-abc/);
});

test('redirect URI is the page itself, without query or hash', async () => {
  const env = await makeEnv({ url: 'https://apps.example.com/pdf/?code=1&state=2#frag' });
  assert.equal(env.ctx.SlopSyncConfig.redirectUri(), 'https://apps.example.com/pdf/');
});

// ---------- tokens ----------
test('refresh decision: fresh token kept, near-expiry or expired or missing refreshed', async () => {
  const env = await makeEnv();
  const T = env.ctx.SlopSyncTokens;
  const now = 1_000_000;
  assert.equal(T.needsRefresh({ access: 'a', expiresAt: now + 3600e3 }, now), false);
  assert.equal(T.needsRefresh({ access: 'a', expiresAt: now + 30e3 }, now), true);
  assert.equal(T.needsRefresh({ access: 'a', expiresAt: now - 1 }, now), true);
  assert.equal(T.needsRefresh({ expiresAt: now + 3600e3 }, now), true);
  assert.equal(T.needsRefresh(null, now), true);
});

test('tokens are stored encrypted and wiped on clear', async () => {
  const env = await makeEnv();
  const T = env.ctx.SlopSyncTokens;
  await T.save('gdrive', { access: 'SECRET-ACCESS-TOKEN', refresh: 'SECRET-REFRESH', expiresAt: 5 });
  const stored = [...env.mem.m.entries()].find(([k]) => k === 'tok:gdrive')[1];
  assert.ok(!Buffer.from(stored.ct).toString('latin1').includes('SECRET'), 'ciphertext must not contain the token');
  assert.equal(JSON.stringify([...env.mem.m.keys()]).includes('SECRET'), false);
  const back = await T.load('gdrive');
  assert.equal(back.refresh, 'SECRET-REFRESH');
  await T.clear('gdrive');
  assert.equal(await T.load('gdrive'), null);
});

// ---------- sign-in redirect ----------
test('handleRedirect does nothing and sends nothing when the URL has no OAuth code', async () => {
  const env = await makeEnv();
  assert.equal(await env.S.handleRedirect(), null);
  assert.equal(env.calls.length, 0);
});

test('connect redirects to the provider and handleRedirect rejects a wrong state with no token call', async () => {
  const env = await makeEnv();
  env.ctx.SlopSyncConfig.setClientId('gdrive', 'client-abc.apps');
  const r = await env.S.connect('gdrive');
  assert.equal(r.ok, true);
  assert.equal(env.calls.length, 0, 'connect must not touch the network');
  assert.equal(env.location.assigned.length, 1);
  env.location.search = '?code=the-code&state=WRONG-STATE';
  const back = await env.S.handleRedirect();
  assert.equal(back.ok, false);
  assert.match(back.error, /state mismatch/);
  assert.equal(env.calls.length, 0, 'a rejected state must not exchange the code');
});

test('a valid redirect exchanges the code with the verifier and stores tokens; replay is refused', async () => {
  const env = await makeEnv();
  env.ctx.SlopSyncConfig.setClientId('gdrive', 'client-abc.apps');
  await env.S.connect('gdrive');
  const state = new URL(env.location.assigned[0]).searchParams.get('state');
  env.location.search = `?code=the-code&state=${state}`;
  const back = await env.S.handleRedirect();
  assert.equal(back.ok, true);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].url, 'https://oauth2.googleapis.com/token');
  const body = new URLSearchParams(env.calls[0].body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'the-code');
  assert.equal(body.get('client_id'), 'client-abc.apps');
  assert.match(body.get('code_verifier'), /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal((await env.ctx.SlopSyncTokens.load('gdrive')).access, 'AT-NEW');
  const again = await env.S.handleRedirect();
  assert.equal(again.ok, false, 'pending sign-in is consumed once');
  assert.equal(env.calls.length, 1);
});

test('connect without a client ID refuses and never redirects', async () => {
  const env = await makeEnv();
  const r = await env.S.connect('dropbox');
  assert.equal(r.ok, false);
  assert.match(r.error, /OAuth client ID/);
  assert.equal(env.location.assigned.length, 0);
});

// ---------- token refresh ----------
test('an expired access token is refreshed before a push, and the refresh token is kept', async () => {
  const env = await makeEnv({ fetchImpl: (url, init) => (url.includes('oauth2') ? reply(200, { access_token: 'AT-2', expires_in: 3600 }) : defaultFetch(url, init)) });
  env.ctx.SlopSyncConfig.setClientId('gdrive', 'client-abc.apps');
  await seedTokens(env, { access: 'OLD', expiresAt: Date.now() - 1000 });
  const r = await env.S.pushBackup('gdrive');
  assert.equal(r.ok, true, r.error);
  assert.equal(env.calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(new URLSearchParams(env.calls[0].body).get('grant_type'), 'refresh_token');
  const saved = await env.ctx.SlopSyncTokens.load('gdrive');
  assert.equal(saved.access, 'AT-2');
  assert.equal(saved.refresh, 'RT1');
  assert.equal(env.calls[1].headers.Authorization, 'Bearer AT-2');
});

test('a fresh token is used as is: no token endpoint call', async () => {
  const env = await makeEnv();
  await seedTokens(env);
  await env.S.pushBackup('gdrive');
  assert.equal(env.calls.some((c) => c.url.includes('oauth2')), false);
});

test('an expired token with no refresh token asks the person to connect again, without network', async () => {
  const env = await makeEnv();
  await seedTokens(env, { refresh: null, expiresAt: Date.now() - 1000 });
  const r = await env.S.pushBackup('gdrive');
  assert.equal(r.ok, false);
  assert.match(r.error, /Connect again/);
  assert.equal(env.calls.length, 0);
});

// ---------- nothing is sent without a button ----------
test('nothing calls fetch unless a push or pull button handler runs', async () => {
  const env = await makeEnv();
  const S = env.S;
  assert.equal((await S.configure('gdrive', { clientId: 'client-abc.apps' })).ok, true);
  assert.equal((await S.status('gdrive')).connected, false);
  assert.equal(await S.handleRedirect(), null);
  assert.equal((await S.connect('gdrive')).ok, true);
  assert.equal((await S.disconnect('dropbox')).ok, true);
  assert.equal((await S.pullBackup('gdrive')).ok, false);
  assert.equal((await S.pushBackup('gdrive')).ok, false, 'not connected: refused before any request');
  assert.equal(env.calls.length, 0, 'no fetch from configure, status, redirect check, connect, disconnect or refused actions');
  assert.equal(env.location.assigned.length, 1);
  await seedTokens(env);
  await S.status('gdrive');
  assert.equal(env.calls.length, 0, 'status reads local storage only');
  assert.equal((await S.pushBackup('gdrive')).ok, true);
  assert.ok(env.calls.length > 0, 'a button press does reach the provider');
});

test('disconnect wipes local tokens and makes no network call', async () => {
  const env = await makeEnv();
  await seedTokens(env);
  const r = await env.S.disconnect('gdrive');
  assert.equal(r.ok, true);
  assert.match(r.note, /remove this app/);
  assert.equal(await env.ctx.SlopSyncTokens.load('gdrive'), null);
  assert.equal(env.calls.length, 0);
});

test('lastSync is recorded after a successful push and shown by status', async () => {
  const env = await makeEnv();
  await seedTokens(env);
  assert.equal((await env.S.status('gdrive')).lastSync, null);
  const r = await env.S.pushBackup('gdrive');
  const st = await env.S.status('gdrive');
  assert.equal(st.lastSync, r.at);
  assert.equal(st.connected, true);
});

test('errors come back as messages, and a missing SlopCentral is reported without a request', async () => {
  const env = await makeEnv({ fetchImpl: () => reply(500, { error: { message: 'boom' } }) });
  await seedTokens(env);
  const r = await env.S.pushBackup('gdrive');
  assert.equal(r.ok, false);
  assert.match(r.error, /HTTP 500/);
  env.ctx.SlopCentral = undefined;
  const calls = env.calls.length;
  const r2 = await env.S.pushBackup('gdrive');
  assert.match(r2.error, /not available/);
  assert.equal(env.calls.length, calls);
});

// Covers: shared/i18n/ui/en/backup2.js, shared/i18n/ui/sv/backup2.js, shared/sync/config.js, shared/sync/pkce.js, shared/sync/tokens.js,
//   shared/sync/providers/gdrive.js, shared/sync/providers/dropbox.js, shared/sync/providers/local.js, shared/sync/sync.js
test('the messages and the folder option speak the chosen language (keys ui.sync.*, read when made)', async () => {
  const env = await makeEnv();
  const CF = env.ctx.SlopSyncConfig;
  setLang('sv');
  try {
    assert.equal(CF.setClientId('nope', 'x').error, 'Okänd molntjänst.');
    assert.equal(CF.provider('local').label, 'Lokal mapp eller nätverksmapp');
    assert.equal(env.ctx.SlopSyncProviders.local.label, 'Lokal mapp eller nätverksmapp');
    assert.match(CF.provider('gdrive').consoleHelp, /^Google Cloud-konsolen/);
    assert.equal(CF.provider('gdrive').label, 'Google Drive');
  } finally { setLang('en'); }
  assert.equal(CF.provider('local').label, 'Local or network folder');
});
