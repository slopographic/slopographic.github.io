# Cloud backup (shared/sync): handoff

Opt-in backup of the app's local data to the person's own Google Drive or Dropbox, or to a local or network
folder. Off by default.
Files: `config.js` (settings, provider table), `pkce.js` (OAuth PKCE), `tokens.js` (encrypted token store),
`providers/gdrive.js`, `providers/dropbox.js` (REST wrappers), `providers/local.js` (folder via the File System
Access API), `sync.js` (public API, `window.SlopSync`), `ui.js` (the "Cloud backup" panel, `window.SlopSyncUI`).

## Local or network folder (`providers/local.js`)

- **What it is:** a folder the person picks with `window.showDirectoryPicker({mode: 'readwrite'})`. The backup is
  written as `slopographic-backup.json` in that folder; app files go to an `Apps` subfolder.
- **No network at all.** It makes no fetch and needs no client ID or sign-in. `status`, `connect` and
  `disconnect` never touch the network either.
- **Browsers cannot speak SMB, NFS or WebDAV.** A NAS or network drive works only after the operating system has
  mounted it as a folder (Windows: map the network drive; macOS: Go, Connect to Server; Linux: mount the share).
  Then pick that folder. The panel's help text says this too.
- **Chrome and Edge only.** Without `showDirectoryPicker` (Firefox, Safari) `connect` returns `unsupported: true`
  and the panel offers "Download backup file" and "Upload backup file…" (`SlopData.exportAll` / `importAll`).
- **Handle:** kept in IndexedDB (`slop-sync-local` / `handles`). Each call checks permission with
  `queryPermission` and asks with `requestPermission` when needed. A request needs a button press. A refusal is a
  plain error (`code: 'permission'`) and nothing is written.
- **Writes** use `createWritable`, which replaces the file only on close, so a failed write keeps the old backup.
- **Limits:** no file locking, so two browsers writing the same folder race (last write wins). Names are one path
  segment, up to 200 characters. Subfolders are one level (`opts.folder`). `list` returns plain files only.
  Forgetting the folder deletes nothing in it.

## Settings: the Local folder section (`settings/folder.js`)

- The same folder as Slop Drive's (one handle in `slop-sync-local` / `handles`). Connect in either place and the other shows it.
- Section "Local folder" in `settings/index.html`: Connect folder, Allow access (when the browser asks again), Save config, Load config, Disconnect. Load lists the changes and applies only after Apply. The question after connecting is inline ("Save config" / "Not now").
- Config logic is `window.SlopConfigFolder` in `shared/config/folder.js` (`save`, `preview`, `apply`), shared with Drive. The file is `slopographic.slop.json` at the folder root, kind `settings`, app `slop`.
- `providers/local.js` gained `permission()` (query only, returns `none`, `prompt`, `granted` or `denied`) and `allow()` (request, needs a press). Both read the handle and never prompt on their own.
- Settings loads `shared/config/{schema,validate,io,kinds,folder}.js` and `shared/sync/providers/local.js` after the data scripts. Nothing is fetched. Tests: `tests/node/sync-folder-config.test.mjs`, run by `node tests/run.mjs sync`.

## Privacy behaviour

- Nothing is sent in the background. There are no timers, and nothing is requested at page load unless the
  URL carries an OAuth return (`code` or `error`) from a sign-in this page started.
- Network use happens only on these actions, each started by a button press:
  - `connect(id)`: no network. It saves a pending sign-in (verifier, state, client ID) in sessionStorage and
    navigates this page to the provider's sign-in page.
  - Return from the provider: `handleRedirect()` checks the `state` value (a mismatch is rejected before any
    request) and exchanges the code at the provider's token endpoint.
  - `pushBackup(id)` / `pullBackup(id, {confirmed: true})`: upload or download the backup. `pullBackup`
    refuses unless the person confirmed, because it replaces local data.
  - `pushAppFile` / `pullAppFile`: optional single-file transfers in an `Apps` folder. Not used by the panel.
  - `status`, `configure`, `disconnect`: no network.
- Hosts contacted (allow-list): accounts.google.com, oauth2.googleapis.com, www.googleapis.com,
  www.dropbox.com, api.dropboxapi.com, content.dropboxapi.com. Nothing else is requested by this module.
  This module is the only one in the cloud sync. The ECB exchange-rate download (`shared/data/rates-ecb.js`, host
  `data-api.ecb.europa.eu`) is on the same kind of allow-list: it runs only when the visitor turned on the `rates` consent
  category and pressed the button (or ticked "Update on open"). See `shared/consent/HANDOFF.md`.
- Scope: Google uses `drive.file` (only files this app creates or opens). Dropbox uses
  `files.content.read` and `files.content.write`, which cover the whole Dropbox unless the app is set to
  App folder access. Prefer App folder when creating the Dropbox app.
- Tokens are kept in IndexedDB (`slop-sync` / `kv`), encrypted with a non-extractable AES-GCM key stored in the
  same database. This stops a copied profile file from showing plain tokens. It does not protect against
  JavaScript running on this origin, so the apps must not load third-party scripts.
- Client IDs and last-sync times are kept in localStorage under `slop-sync`. A client ID is not a secret (PKCE,
  no client secret).
- Disconnect deletes the tokens on this device and makes no network call. The provider grant stays until the
  person removes the app in their Google Account or Dropbox settings. The panel says so.
- Cloud files are never deleted by the app.

## Setup

1. Google Drive: in the Google Cloud console, create an OAuth client ID of type "Web application". Add the page
   address (origin and path, no query or hash) as an authorised redirect URI. Enable the Google Drive API for
   the project.
2. Dropbox: in the Dropbox app console, create an app with Scoped access (App folder preferred). In its
   Permissions tab, enable `files.content.read` and `files.content.write`. Add the same page address as a
   redirect URI.
3. In the app, open Cloud backup, choose "Add client ID", paste the client ID, then "Connect" and approve.
4. "Back up now" uploads `slopographic-backup.json`. "Restore from cloud" replaces local data after confirmation.
5. Local or network folder: no setup. Open Cloud backup, press "Choose folder…", and pick the folder. For a NAS,
   mount the share in the operating system first.
6. Call `SlopSyncUI.onLoad()` once at page load and `SlopSyncUI.open()` from the app menu. The data module must
   provide `SlopData.exportAll()` and `SlopData.importAll(blob)`.

## Tests

`node tests/run.mjs sync` runs `tests/node/sync.test.mjs`, `tests/node/sync-providers.test.mjs`,
`tests/node/sync-local.test.mjs` (the local folder, with a fake directory handle: write, read, list, subfolders,
permission denied and re-asked, no folder, unsafe names, no network) and the shared harness
`tests/node/sync-helpers.mjs`. No network: fetch is a recording stub.
