# PWA: install, offline and persistent storage

Slopographic installs as an app and works offline. Installing makes browsers more likely to grant
persistent storage to Slop Drive. It does not guarantee it: Chrome still decides.

## What installs

- `manifest.webmanifest` (site root): name "Slopographic", short name "Slop", `start_url` and
  `scope` "/", `display` standalone, colours `#0a0a0a` (the homepage). Icons: `favicon.svg`
  (any size), `assets/icons/icon-192.png` and `icon-512.png`. Shortcut: "Slop Drive" → `/drive/`.
- Every homepage and app page links the manifest. The homepage and the 15 registry apps (Slop Drive included) load `shared/pwa.js` and call `SlopPWA.mount()`.

## What is cached

- `service-worker.js` (scope `/`, cache `slopographic-<VERSION>`):
  - **Precache** (`PRECACHE`, 685 files, about 6.5 MiB): the homepage, Slop Drive, every app's
    `index.html`, and the CSS, JS and fonts those pages load at boot (followed through `<script>`,
    `<link>`, static ES imports and CSS `url()`). `offline.html`, the manifest and the icons are
    included. The first visit fetches all of it in the background.
  - **HTML navigations**: network first, then the saved copy, then `offline.html`. `/drive/` is
    stored as `/drive/index.html`.
  - **Static files** (js, css, fonts, images, wasm, json, glb): network first (`cache: 'no-cache'`), then the saved
    copy when offline. Files not seen at install are added on first use.
  - Only same-origin GET requests are handled. Other origins and other methods go straight to the
    network and are never cached.
- Old `slopographic-*` caches are deleted when a new worker activates.

## Updating

1. Change the site as usual and commit. The pre-commit hook (`.githooks/pre-commit`; enable once per clone with
   `git config core.hooksPath .githooks`) runs `node tools/pwa-precache.mjs` and stages its output: the `PRECACHE` list
   (`sw-precache*.js`) and `VERSION` in `service-worker.js`.
2. **`VERSION` is never edited by hand.** It is `v-` and the first 12 hex digits of a SHA-256 over the worker's code and
   every precached file (path and bytes). A release that changes a cached file gets a new `VERSION`, so returning visitors
   get a new cache (the old one is deleted on activate) and the browser installs the new worker. A release that changes no
   cached file keeps the same `VERSION`, and nobody downloads the precache again.
3. `node tools/pwa-precache.mjs --check` writes nothing and exits 1 when the list or `VERSION` is out of date.
   `tests/node/pwa-version.test.mjs` runs it, so a commit made without the hook fails the tests.
4. Run `node tests/run.mjs pwa`. The offline test checks that the homepage and Slop Drive open
   with the server stopped.
5. **Run `node tests/run.mjs storage` before publishing.** It opens a real version 1 database and
   old-shape localStorage fixtures against the new code, and checks that the service worker never
   clears IndexedDB or localStorage. Any failure blocks the release. Rules: `storage/HANDOFF.md`.

## Loading the newest release in a browser

- `SlopPWA.refresh()` deletes this site's `slopographic-*` caches, asks the browser for the newest worker
  (`registration.update()`) and reloads the page without `?fresh`. Files are fetched from the network (the worker uses
  `cache: 'no-cache'`). IndexedDB and localStorage are not touched: Drive files, documents, settings and downloaded packs
  stay.
- **`?fresh` on any page** does the same: `shared/theme/theme.js` (in every app page's head) loads `shared/pwa.js` when the
  address has `?fresh`, and `pwa.js` runs `refresh()` on load. Example: `https://slopographic.com/pdf/?fresh`.
- **Settings ▸ Updates** shows the release the worker serves (`SlopPWA.version()`, answered by the worker's `message`
  handler) and has **Load the latest version** (`settings/updates.js`).

`tools/pwa-icons.mjs` regenerates the PNG icons from `favicon.svg`. Run it only if the icon changes.

## Install button and storage note

- `SlopPWA.mount({ install: '#pwa-install' })` shows the "Install Slopographic" button only after the
  browser offers an install (`beforeinstallprompt`). The button hides after the click, after
  `appinstalled`, and when the app runs standalone.
- Persistent storage: after `appinstalled`, or once when the page is running standalone, `mount()`
  calls `navigator.storage.persist()` and records the answer in localStorage (`slop-pwa.persist`:
  `granted`, `denied` or `unsupported`). Slop Drive's "Storage" note shows the answer in plain
  words. A "no" points to Backup & restore.
- `SlopPWA.mount()` does nothing (returns false) when the browser has no service worker support.

## Limits

- Chrome, not the site, decides whether storage persists. Installing raises the chance of a "yes"
  but does not guarantee it. Clearing site data always deletes everything. Export a backup
  (Backup & restore) for anything that matters.
- Safari and Firefox have their own rules. The install button may never appear there.
- The precache follows static references. Files loaded only with dynamic `import()` or
  `createElement('script')` are cached on first use instead.

## Tests

- `tests/pwa/`: manifest and icons, app-page wiring, the service worker (fake `self`, `caches`
  and `fetch`), the mount no-op, the install button, the persistent-storage answer and message,
  and the Slop Drive note.
- `tests/node/pwa-offline.test.mjs`: the real offline check, run with `node tests/run.mjs pwa`.
