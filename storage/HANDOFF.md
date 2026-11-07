# Storage upgrade rules

The goal: every piece of data a person has stored in their browser still opens after an update. The
inventory of every store and key is in [INVENTORY.md](INVENTORY.md). Read this before you change
how any app saves data, and before you publish.

## The rules

### 1. IndexedDB

- Every `indexedDB.open` names an explicit version: a literal, or a constant set in the same file.
  A version-less open is allowed only in `shared/backup/core.js`, the generic opener for a backup.
- Every open has an `onupgradeneeded`. It creates what is missing and never deletes data.
- A version above 1 is a migration: the upgrade reads `e.oldVersion` and does its work for the
  versions it passes. For SlopData, `UPGRADES` in `shared/data/store.js` has one entry per version.
  Add an entry for each new version in the same file as the bump.
- Nothing calls `deleteObjectStore`. Whole-database deletes are allowed only in the erase paths:
  `SlopData.store.erase`, `SlopGallery.db.destroy` and the backup restore. The rules test enforces this.
- Test the old shape: write a fixture of the previous format in the test, open it with the new code,
  and check the records are read and nothing is lost. See `tests/storage/upgrade.test.html`.

### 2. localStorage

- Each key with a structure has a versioned envelope: `{ v: 1, data }`. Its reader also accepts the
  unversioned shape from before the envelope, and writes the envelope from then on.
  Examples: `slop-profile` (shared/profile/profile.js), `slop-drive.prefs` (drive/js/core/util.js).
- A key may instead carry a version in its name (`slop.mascot.v1`, `slopguides.presets.v1`). A new
  shape gets a new name (`...v2`), and the reader reads the old one once.
- Every reader handles a missing key, a corrupt value and a partial object: fall back to defaults,
  never throw, never write back on read.
- Readers wrap every access in try/catch. Storage can be blocked, full or disabled.

### 3. Renamed keys and fields

- Read the old name once, write the new name, and remove the old one only after the new one is written.
  Never drop the old key first.
- SlopData's `settings.currency` became `defaultCurrency`. `seedDefaults` moves it once and
  `fx.baseIn` also reads the old field. Tested.

### 4. Consent and policy versions

- A consent record from an older policy version is not a choice. The person is asked again, and
  their earlier categories are shown as the default. Nothing turns on until they press Save.
  `SlopConsentState.previous()` gives the earlier categories. Tested.
- Bump `policyVersion` in `shared/consent/config.js` only when the categories or the banner text change.

### 5. Service worker and caches

- The service worker deletes only caches named `slopographic-*` that are not the current one, on
  `activate`. It never touches IndexedDB or localStorage. The source must not even mention them.
  Both are tested in `tests/node/storage-sw.test.mjs`.
- Bump `VERSION` in `service-worker.js` on every release that changes a precached file
  (see `shared/pwa/HANDOFF.md`).

## Adding a store or key

1. Add it to [INVENTORY.md](INVENTORY.md) with owner, name, version, format and readers.
2. For IndexedDB: pick the version, add the store in `onupgradeneeded` guarded by
   `objectStoreNames.contains`, and add an upgrade step if the version is above 1.
3. For localStorage: use the envelope `{ v: 1, data }`, or a `.vN` name. Write a reader that accepts
   anything, and test it against the shape it replaces.
4. Add a test in `tests/node/storage-legacy.test.mjs` (Node) or `tests/storage/` (browser).

## Release steps

1. Make the change. Bump the service-worker `VERSION` if a precached file changed.
2. Run `node tests/run.mjs storage`. Every test must pass before the release goes out.
3. Run the app tests you touched (for example `node tests/run.mjs data` or `drive`).
4. Publish as usual.

## Tests

| Test | What it checks |
|---|---|
| `tests/storage/upgrade.test.html` | a real v1 `slop-data` database with records opens as v2; currency moves; an unknown store survives |
| `tests/node/storage-legacy.test.mjs` | consent old policy record; profile flat shape; drive prefs before sorts and cols; gallery photo with no tags; nav v1 with an unknown preset |
| `tests/node/storage-sw.test.mjs` | activate deletes only old `slopographic-*` caches; service worker never touches storage |
| `tests/node/storage-rules.test.mjs` | every IndexedDB open has a version and an upgrade; no store deletes; each SlopData version has an upgrade step |

## Known gaps

- Many single-value localStorage keys (theme names, scalar flags) are unversioned. Their readers
  already fall back to defaults, so an update cannot lose data. Migrating them to envelopes is
  left for the next time each app is touched. They are marked "unversioned" in the inventory.
- Some key families are not enumerated in the inventory (`slopvector.*` and the label keys).
- The Gallery library and the Drive hub have no version-bump test yet. They have only the v1 shape today.
