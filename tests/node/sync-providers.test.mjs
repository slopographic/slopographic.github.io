// Provider request tests for shared/sync (Google Drive and Dropbox). Each request is recorded by a fetch stub.
// Run: node tests/run.mjs sync
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedTokens, reply, textOf } from './sync-helpers.mjs';

// ---------- provider request construction ----------
test('Google Drive push: multipart POST to the upload endpoint with bearer token and the backup name', async () => {
  const env = await makeEnv();
  await seedTokens(env);
  const r = await env.S.pushBackup('gdrive');
  assert.equal(r.ok, true, r.error);
  const find = env.calls[0];
  assert.equal(find.method, 'GET');
  assert.ok(find.url.startsWith('https://www.googleapis.com/drive/v3/files?'));
  // URLSearchParams encodes spaces as '+', so read the q parameter instead of decoding the raw URL.
  assert.equal(new URL(find.url).searchParams.get('q'), "name = 'slopographic-backup.json' and 'root' in parents and trashed = false");
  assert.equal(find.headers.Authorization, 'Bearer AT1');
  const up = env.calls[1];
  assert.equal(up.method, 'POST');
  assert.equal(new URL(up.url).origin + new URL(up.url).pathname, 'https://www.googleapis.com/upload/drive/v3/files');
  assert.equal(new URL(up.url).searchParams.get('uploadType'), 'multipart');
  assert.equal(new URL(up.url).searchParams.get('fields'), 'id,name');
  assert.match(up.headers['Content-Type'], /^multipart\/related; boundary=slopsync[0-9a-f]+$/);
  const body = await textOf(up.body);
  assert.ok(body.includes('"name":"slopographic-backup.json"'));
  assert.ok(body.includes('"parents":["root"]'));
  assert.ok(body.includes('{"docs":[1]}'));
  assert.equal(up.headers.Authorization, 'Bearer AT1');
});

test('Google Drive push overwrites an existing backup with PATCH', async () => {
  const env = await makeEnv({ fetchImpl: (url, init) => ((init.method || 'GET') === 'GET' ? reply(200, { files: [{ id: 'F9', name: 'slopographic-backup.json' }] }) : reply(200, { id: 'F9', name: 'x' })) });
  await seedTokens(env);
  await env.S.pushBackup('gdrive');
  assert.equal(env.calls[1].method, 'PATCH');
  assert.equal(new URL(env.calls[1].url).pathname, '/upload/drive/v3/files/F9');
  assert.equal(new URL(env.calls[1].url).searchParams.get('fields'), 'id,name');
});

test('Google Drive app file push creates the Apps folder first, then uploads into it', async () => {
  const env = await makeEnv({ fetchImpl: (url, init) => (init.method === 'POST' && url.endsWith('/drive/v3/files?fields=id') ? reply(200, { id: 'APPS1' }) : reply(200, { files: [], id: 'U', name: 'a.txt' })) });
  await seedTokens(env);
  const r = await env.S.pushAppFile('gdrive', 'notes.txt', new Blob(['hi'], { type: 'text/plain' }));
  assert.equal(r.ok, true, r.error);
  const folderCreate = env.calls.find((c) => c.method === 'POST' && c.url.endsWith('/drive/v3/files?fields=id'));
  assert.deepEqual(JSON.parse(folderCreate.body), { name: 'Apps', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] });
  const up = env.calls.find((c) => c.url.includes('/upload/'));
  assert.match(await textOf(up.body), /"parents":\["APPS1"\]/);
});

test('Google Drive app file pull never creates folders; a missing file is a message', async () => {
  const env = await makeEnv({ fetchImpl: () => reply(200, { files: [] }) });
  await seedTokens(env);
  const r = await env.S.pullAppFile('gdrive', 'missing.txt');
  assert.equal(r.ok, false);
  assert.match(r.error, /not in the Apps folder/);
  assert.equal(env.calls.some((c) => c.method === 'POST'), false);
});

test('Dropbox push: content endpoint, Dropbox-API-Arg path and overwrite mode, octet-stream body', async () => {
  const env = await makeEnv();
  env.ctx.SlopSyncConfig.setClientId('dropbox', 'dbkey123');
  await env.ctx.SlopSyncTokens.save('dropbox', { access: 'DB-AT', refresh: 'DB-RT', expiresAt: Date.now() + 3600e3 });
  const r = await env.S.pushBackup('dropbox');
  assert.equal(r.ok, true, r.error);
  const up = env.calls[0];
  assert.equal(up.method, 'POST');
  assert.equal(up.url, 'https://content.dropboxapi.com/2/files/upload');
  assert.equal(up.headers.Authorization, 'Bearer DB-AT');
  assert.equal(up.headers['Content-Type'], 'application/octet-stream');
  const arg = JSON.parse(up.headers['Dropbox-API-Arg']);
  assert.equal(arg.path, '/slopographic-backup.json');
  assert.equal(arg.mode, 'overwrite');
  assert.ok(up.body instanceof Blob);
});

test('Dropbox Dropbox-API-Arg escapes non-ASCII names and app files go under /Apps', async () => {
  const env = await makeEnv();
  await env.ctx.SlopSyncTokens.save('dropbox', { access: 'DB-AT', refresh: 'DB-RT', expiresAt: Date.now() + 3600e3 });
  env.ctx.SlopSyncConfig.setClientId('dropbox', 'dbkey123');
  await env.S.pushAppFile('dropbox', 'café.txt', new Blob(['x']));
  const arg = env.calls[0].headers['Dropbox-API-Arg'];
  assert.ok(/^[\x20-\x7e]*$/.test(arg), 'header must be ASCII');
  assert.equal(JSON.parse(arg).path, '/Apps/café.txt');
});

test('Dropbox restore needs confirmation, then downloads and hands the blob to importAll', async () => {
  const backup = new Blob(['{"docs":[9]}'], { type: 'application/json' });
  const env = await makeEnv({ fetchImpl: () => reply(200, backup) });
  await env.ctx.SlopSyncTokens.save('dropbox', { access: 'DB-AT', refresh: 'DB-RT', expiresAt: Date.now() + 3600e3 });
  env.ctx.SlopSyncConfig.setClientId('dropbox', 'dbkey123');
  const refused = await env.S.pullBackup('dropbox');
  assert.equal(refused.ok, false);
  assert.equal(env.calls.length, 0, 'no download before the person confirms');
  const r = await env.S.pullBackup('dropbox', { confirmed: true });
  assert.equal(r.ok, true, r.error);
  assert.equal(env.calls[0].url, 'https://content.dropboxapi.com/2/files/download');
  assert.equal(JSON.parse(env.calls[0].headers['Dropbox-API-Arg']).path, '/slopographic-backup.json');
  assert.equal(env.imported.length, 1);
  assert.equal(env.imported[0], backup);
});

test('Dropbox restore with no backup on the account says so and imports nothing', async () => {
  const env = await makeEnv({ fetchImpl: () => reply(409, { error_summary: 'path/not_found/..' }) });
  await env.ctx.SlopSyncTokens.save('dropbox', { access: 'DB-AT', refresh: 'DB-RT', expiresAt: Date.now() + 3600e3 });
  env.ctx.SlopSyncConfig.setClientId('dropbox', 'dbkey123');
  const r = await env.S.pullBackup('dropbox', { confirmed: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /No cloud backup found/);
  assert.equal(env.imported.length, 0);
});

test('Dropbox list_folder posts JSON to the RPC endpoint and keeps only files with the prefix', async () => {
  const env = await makeEnv({ fetchImpl: () => reply(200, { has_more: false, entries: [
    { '.tag': 'file', id: 'id:1', name: 'pre-a.txt', size: 3 },
    { '.tag': 'folder', id: 'id:2', name: 'pre-folder' },
    { '.tag': 'file', id: 'id:3', name: 'other.txt', size: 1 }
  ] }) });
  await env.ctx.SlopSyncTokens.save('dropbox', { access: 'DB-AT', refresh: 'DB-RT', expiresAt: Date.now() + 3600e3 });
  const list = await env.ctx.SlopSyncProviders.dropbox.list({ token: 'DB-AT' }, 'pre-', { folder: 'Apps' });
  assert.equal(env.calls[0].url, 'https://api.dropboxapi.com/2/files/list_folder');
  assert.equal(env.calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(env.calls[0].body), { path: '/Apps', recursive: false, limit: 200 });
  // Arrays built inside the vm context have another realm's Array prototype, so copy into this realm first.
  assert.deepEqual([...list.map((f) => f.name)], ['pre-a.txt']);
});

