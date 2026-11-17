# Export everything: format and how an app joins

One file holds the whole suite's data: `slopographic-backup-YYYY-MM-DD.slop-backup.json`. It is made and read by
`shared/backup/central.js` (with `central-format.js`, `central-idb.js`, `central-apps.js`, `central-ui.js`).
Entry points: Admin (Data tab, "Export or import everything"), Slop Drive (Backup & restore dialog, "Export or import
everything"), and `SlopBackup.openEverything()` anywhere. Apps never call the central module directly; they register.

## The format (version 2)

```
{
  "format": "slop-backup",
  "version": 2,
  "created": "2026-10-11T09:00:00.000Z",
  "apps":     { "<app id>": { "version": 1, "data": { ... } } },
  "settings": { "profile": { "version": 1, "data": { ... } } },
  "registry": ["data", "drive", "gallery", ...],   // app ids registered when the file was made
  "excluded": [ { "source": "...", "reason": "..." } ]  // what is not in the file, and why
}
```

- Only the keys above are allowed. Anything else makes the whole file invalid.
- Each section holds its own `version` (the app's data version when it was written) and `data`.
- `settings` holds per-browser settings (the profile). `apps` holds app data.
- IndexedDB apps use one shared shape: `data = { stores: { <name>: { keyPath, indexes, records: [{ k?, v }] } }, blobs: [base64...] }`.
  Values are structured-clone values encoded by SlopBackupCodec. Binary parts (Blobs, files) are base64 entries of `blobs`.
- Secrets never go in: keys named like tokens, secrets, passwords or API keys are refused on read and never written.
  Sync tokens, the consent record and caches are listed under `excluded`.

## How an app registers

In the page that owns the storage (or in the central built-ins, `central-apps.js`):

```js
SlopBackup.registerApp('notes', {
  label: 'Slop Notes',
  version: 2,                       // this app's data version
  mode: 'merge',                    // or 'replace': what import does to what is here
  exportData: async () => ({ ... }),          // plain data, or the IndexedDB shape above
  importData: async (data, fromVersion, ctx) => {
    // write data, then register how to undo it:
    ctx.undo(async () => { /* put back what was there */ });
  },
  check: (data) => [],              // optional: problems as strings, checked before anything is written
  migrations: { 2: (data) => newData },   // required for every version from 2 up
});
```

Rules:
- `importData` must be all or nothing: throw before a partial write, or write in one transaction. Register undo with
  `ctx.undo(fn)` after each write that succeeds. When any app fails, every registered undo runs in reverse, and the
  result says "Nothing was changed".
- `exportData` throws if the data cannot be read. The app is then listed under `excluded`, and the file is still made.
- `registerApp` throws at once for a bad id, a duplicate, or a version above 1 with a missing migration.
- Use the `settings` part (`part: 'settings'`) only for per-browser preferences.

## The migration rule

**A new version always comes with a migration.** `migrations[n]` turns data at version n-1 into version n. Version 1 has
no migration. When an app goes from version 2 to 3, add `migrations: { 2: ..., 3: ... }` in the same change. `registerApp`
refuses the registration otherwise. On import, the chain runs from the file's version up to the current one, before
`importData` sees the data. A file from a newer version than this browser reads is refused.

## Version 1 files still import

- A version 1 Slop Data bundle (`format: "slop-data"`, what Admin's old backup downloaded) becomes the `data` section at
  version 1. Migration 2 gives every collection a list (older exports had no exchangeRates).
- A version 1 Slopographic `.slop` ZIP (the old Backup & restore dialog) is converted: its `slop-drive`, `slop-gallery`,
  template, session and playlist databases become sections, and `slop-profile` becomes the profile settings. Other
  localStorage keys are not carried over, and the file says so under `excluded`.

## Import flow

1. `plan(file)`: read (JSON, ZIP or a version 1 bundle), validate the envelope, then the sections' versions, then migrate
   and check each section. Nothing is written. A failure refuses the whole file.
2. The dialog shows the plan: each app with its item counts, "left alone" for apps the file does not hold, "skipped" for
   apps this browser does not know, and what is excluded. Slop Data is marked as replaced.
3. `apply(plan)`: Slop Data first, then the apps in registration order, then the settings. Any failure rolls back.

## Behaviour to know

- Slop Data is `replace` (its records must balance and number in one piece). The others are `merge`: the file wins where
  an item matches, and nothing is deleted.
- An app missing from the file is reported and left alone. It is never deleted.
- The file is JSON, so binary data is about a third larger. Very large libraries make large files.

## Tests

`tests/backup/central.test.html` (round trips, empty-state counts, version 1 files, the dialog) and
`tests/backup/central-safety.test.html` (rollback, shape refusal, missing apps, secrets, the envelope, migrations).
Run with `node tests/run.mjs backup`.

## Files

- `shared/backup/index.js`: the loader, `registerApp`, `openEverything`. (The ZIP backup that already existed is unchanged.)
- `shared/backup/central.js`, `central-format.js`, `central-idb.js`, `central-apps.js`, `central-ui.js`.
- `shared/backup/ui.js`: the Drive dialog's "Export or import everything" section.
- `admin/index.html`, `admin/js/ui/data.js`, `admin/js/ui/commands.js`: the Admin entry point.
