# Browser storage inventory

Every place the site keeps the person's data in their browser: IndexedDB databases and object stores, and
localStorage keys. Each app's own autosave, drafts and preferences are included. Rules for changing any of
them are in [HANDOFF.md](HANDOFF.md). "Unknown" means the code was not read far enough to name it.

Totals at the time of writing (2026-10-11, working tree):

- 19 IndexedDB databases with 36 object stores (the app databases), plus one generic opener in
  `shared/backup/core.js` (opens the databases named in a backup) and the third-party WebLLM model cache
  (`vendor/web-llm`, not app data).
- 49 localStorage rows below: 39 single keys (18 of them theme keys) and 10 key families (a prefix or an `<app>` suffix).
- Contacts drafts: `contacts/js/store/drafts.js` (database `slop-contacts-drafts`, store `drafts`, key `current`)
  was deleted in commit c94e877. No code opens it now. A device that still has that database keeps it
  untouched; nothing reads it. Listed under "Retired" at the end.

Versions: "v" is the value passed to `indexedDB.open` (IndexedDB), or the envelope version `v` (localStorage).

## IndexedDB: SlopData (`slop-data`, shared/data)

Version 9 (`DB_VERSION` in `shared/data/store.js`). v2 adds `exchangeRates`, v3 `customerGroups` and `customerTags`, v4
`events`, `tasks` and `reminders`, v5 `expenses`, v6 `quotes`, v7 `timeEntries`, v8 `schedules`, v9 `purchases`, v10 `creditNotes`, v11 `bankLines`, v12 `projects` and `projectTasks`. Every step only creates the stores that are missing (`createStores`), so a
database of any earlier version keeps all of its records; `tests/storage/upgrade.test.html` opens a v1 database and checks
every collection exists after the upgrade. SlopData's collections are listed in `schema-defs.js`.

| Owner | Store | Version | Record format | Read by | Upgrade |
|---|---|---|---|---|---|
| shared/data | settings (key `id`, singleton `main`) | 2 | record; base currency is `defaultCurrency` (v1 called it `currency`) | shared/data, invoices, orders, ledger, inventory, crm, settings | v1 `currency` moved once in `seedDefaults`; tested |
| shared/data | customers | 2 | record with stage, categories, phones, emails, addresses | shared/data, contacts, crm, invoices, orders | create-only upgrade; tested |
| shared/data | products | 2 | record with sku, ean, prices | shared/data, inventory, invoices, orders | create-only upgrade |
| shared/data | orders | 2 | record with lines, status | shared/data, orders | create-only upgrade |
| shared/data | invoices | 2 | record with lines, status, payments | shared/data, invoices, ledger | create-only upgrade |
| shared/data | payments | 2 | record | shared/data, invoices | create-only upgrade |
| shared/data | accounts (key `code`) | 2 | chart of accounts record | shared/data, ledger | create-only upgrade; default chart seeded if missing |
| shared/data | journal | 2 | ledger entry with lines, currency, rate | shared/data, ledger | create-only upgrade |
| shared/data | exchangeRates | 2 | rate row (base, quote, date, rate); added in v2 | shared/data (fx), ledger | new in v2; created on upgrade |
| shared/data | stockMovements | 2 | stock movement record | shared/data, inventory | create-only upgrade |
| shared/data | stockCounts | 2 | count record | shared/data, inventory | create-only upgrade |
| shared/data | numbering (key `id`) | 2 | sequence record | shared/data (numbering) | create-only upgrade; default sequences seeded if missing |
| shared/data | customerGroups, customerTags | 3 | label records (name, colour) | shared/data, crm, contacts | new in v3; created on upgrade |
| shared/data | events, tasks, reminders | 4 | calendar event, to-do task and reminder records | shared/data, calendar, todo, reminders, crm | new in v4; created on upgrade |
| shared/data | expenses | 5 | expense record (date, supplier, account, amount, tax, method, status); posted with its journal entry | shared/data (expenses), expenses, ledger, reports | new in v5; created on upgrade |
| shared/data | quotes | 6 | quote (estimate): customer, date, validUntil, lines and totals, status draft/sent/accepted/declined, links to the order or invoice made from it | shared/data (quotes), quotes, orders, invoices | new in v6; created on upgrade; numbers QUO-0001 |
| shared/data | timeEntries | 7 | time worked: date, customer, project, description, minutes, hourly rate, billable, the invoice it was billed on | shared/data (timesheets), timesheets, invoices | new in v7; created on upgrade |
| shared/data | schedules | 8 | repeating invoice: customer, currency, notes, lines and totals, every N weeks or months from nextDate, end date, active, how many made | shared/data (recurring), invoices | new in v8; created on upgrade |
| shared/data | purchases | 9 | purchase order: supplier (a contact flagged supplier), date, expected date, lines and totals, status draft/ordered/received/cancelled, where it was received, the bill's expense | shared/data (purchases), purchases, inventory, expenses | new in v9; created on upgrade; numbers PO-0001 |
| shared/data | creditNotes | 10 | credit note: the invoice and customer, date, amount with its subtotal and tax, the part paid back and how, reason | shared/data (credits), invoices, reports | new in v10; created on upgrade; numbers CN-0001; immutable, posting only |
| shared/data | bankLines | 11 | a bank statement line to reconcile: account, date, text, signed amount, status open/matched/ignored, the journal entry it matches, the file it came from | ledger (bank) | new in v11; created on upgrade; key unique per statement line, so a second import adds nothing |
| shared/data | projects, projectTasks | 12 | Slop Projects: a project (name, colour, dates, board columns with WIP limits, people, CRM customer) and its tasks (column and place, assignee, priority, start/end/due, tags, checklist, the ids of the tasks it waits for, CRM customer) | projects | new in v12; created on upgrade; hard delete (Undo puts the records back) |

## IndexedDB: other databases

| Owner | Database / store | Version | Record format | Read by | Upgrade |
|---|---|---|---|---|---|
| shared/hub.js (Slop Drive) | `slop-drive` / files | 2 | file record `{ id, name, type, size, from, time, folderId, starred, trashedAt, meta, blob }` | every app through SlopHub, Slop Drive | v1 to v2 normalises each record with a cursor (no test yet) |
| shared/hub.js (Slop Drive) | `slop-drive` / folders | 2 | folder record `{ id, name, parentId, ... }` | Slop Drive, SlopHub | created if missing |
| drive/js/core/thumb-cache.js | `slop-drive-thumbs` / thumbs | 1 | cached thumbnail by file id | Slop Drive | create-if-missing |
| shared/session/session.js | `slop-session` / kv | 1 | session values (large values only here; small ones mirrored to localStorage) | shared/session, apps that save sessions | create-if-missing |
| shared/sync/tokens.js | `slop-sync` / kv | 1 | cloud sync tokens | shared/sync | create-if-missing |
| shared/sync/providers/local.js | `slop-sync-local` / handles (key `dir`) | 1 | folder handle for local sync | shared/sync | create-if-missing |
| shared/cutout/loader.js | `slop-cutout` / files | 1 | model file bytes (fallback when the Cache API is unavailable) | Slop Cutout, shared/cutout | create-if-missing |
| ai/js/core/store.js | `slop-ai` / convs | 1 | chat conversation `{ id, title, updated, messages }` | Slop AI | create-if-missing; index `updated` |
| tables/js/ui/template-store.js | `slop-tables-templates` / templates | 1 | template `{ id, ... }` | Slop Tables | create-if-missing |
| tables/js/ui/drafts.js | `slop-tables-drafts` / drafts (key `current`) | 1 | autosaved workbook | Slop Tables | create-if-missing |
| slopedit/js/core/util.js | `slopedit` / kv | 1 | autosaved project | Slop Edit | create-if-missing |
| slopedit/js/core/util.js | `slopedit` / media | 1 | imported files as Blobs (keyPath `id`) | Slop Edit | create-if-missing |
| label/js/io/files.js | `sloplabel` / kv | 1 | label design autosave | Slop Label | create-if-missing |
| press/js/core/store.js | `slop-press` / docs (key `autosave`) | 1 | autosaved layout project | Slop Press | create-if-missing |
| slides/js/io/draft.js | `slop-slides` / drafts (key `last`) | 1 | autosaved deck | Slop Slides | create-if-missing |
| slides/js/io/template-store.js | `slop-slides-templates` / templates | 1 | saved slide template | Slop Slides | create-if-missing |
| gallery/js/core/db.js | `slop-gallery` / photos | 1 | photo record `{ id, name, type, size, sha, w, h, takenAt, fav, liked, tags, addedAt, driveId }` | Slop Gallery (library.js) | create-if-missing; indexes `sha`, `takenAt`; a record with no `tags` loads as `[]` (tested) |
| gallery/js/core/db.js | `slop-gallery` / originals | 1 | `{ id, blob }` original bytes | Slop Gallery | create-if-missing |
| gallery/js/core/db.js | `slop-gallery` / thumbs | 1 | `{ id, blob }` JPEG, long edge 320 px | Slop Gallery | create-if-missing |
| gallery/js/core/db.js | `slop-gallery` / albums | 1 | `{ id, name, photoIds, time }` | Slop Gallery | create-if-missing |
| photoslop/js/io/save.js | `slopshop` / kv | 1 | saved document (Photoslop) | Photoslop | create-if-missing |
| docs/js/ui/files.js | `slop-docs` / drafts (keyPath `key`, `d:<id>` or `untitled`) | 2 | `{ key, ...draft }` autosave | Slop Docs | v1 had drafts only; v2 adds templates only when `oldVersion < 2` |
| docs/js/ui/files.js | `slop-docs` / templates | 2 | template `{ id, ... }` | Slop Docs | added in v2 |
| pdf/js/core/util.js | `slop-pdf` / kv | 1 | autosaved PDF session | Slop PDF | create-if-missing |
| shared/backup/core.js | any database named in a backup (generic) | caller | whatever the database holds | Backup and restore | opens by name, with a version from the backup manifest; creates an empty shell only when it has no stores |

## localStorage: shared (shared/)

Keys marked "unversioned" have no envelope. Their readers accept a missing or partial object (defaults).

| Owner | Key | Version | Record format | Read by | Upgrade |
|---|---|---|---|---|---|
| shared/profile | `slop-profile` | envelope v1 | `{ v: 1, data: { <app>: { <key>: value } } }` | every app through SlopProfile; Settings | v1 envelope; the flat object before it is still read (tested) |
| shared/theme | `slop-profile` (app `theme`, key `mode`) | envelope v1 (same key as above) | `system` (default, stored as no override), `light`, `dark`, `classic` or `lime` | shared/theme (every page), Settings | the choice is the default when unset; the app keys below are the fallback for a person who chose before it existed (tested) |
| shared/consent | `slop-consent` | record `version` = policy version (config.js, now 2) | `{ version, timestamp, categories: { necessary, analytics, ads, rates } }` | consent banner, Settings, rates-ecb, ledger rates | old policy records are kept; they are asked again and shown as the default (tested) |
| shared/nav | `slop-nav` | envelope v1 | `{ v: 1, apps: { <app>: { preset, custom: { from, bindings } \| null } } }` | every app through SlopNav.store; Settings | v1; unknown preset ids fall back to Slop without rewriting (tested) |
| shared/sync/config.js | `slop-sync` | unversioned | `{ <provider>: { clientId, lastSync } }` | shared/sync | unversioned; missing fields take defaults |
| shared/backup/index.js | `slop-backup-last` | unversioned scalar | ms timestamp string | Backup | unversioned scalar |
| shared/pwa.js | `slop-pwa.persist` | unversioned scalar | `granted` or `denied` | PWA storage prompt | unversioned scalar |
| shared/guard.js | `slop-guard-off` | unversioned scalar | `'1'` or absent | Guard (keep-my-files) | unversioned scalar |
| shared/session/session.js | `slop-session.<key>` (prefix) | unversioned | JSON value mirrored from IndexedDB (under 200,000 characters) | shared/session | unversioned; IndexedDB is the source |
| shared/ai/webllm.js | `slop-ai.local-models` | unversioned | JSON array of local model entries | Slop AI | unversioned array |
| shared/buddy/prefs.js | `slop.buddy` | unversioned | `{ apps: { <app>: bool } }` plus global switches | Buddy | unversioned; `apps` defaults to `{}` |
| shared/buddy/store.js | `slop.mascot.v1` | key suffix v1 | `{ xp, hats, ... }` | Buddy (XP and levels) | key suffix v1 |
| shared/commands/keymap.js | `slop.keys.<app>` | unversioned | shortcut map per app (format not read in full) | every app's keyboard map | unversioned; a missing binding takes the default |
| shared/guides/presets.js | `slopguides.presets.v1` | key suffix v1 | custom guide presets, each `{ name, tab, form? \| notation? \| intervals?, unit?, snap? }` | Guides panel | key suffix v1 |
| shared/guides | `slopguides.state` and `slopguides.state.<app>` | unversioned | guide panel state | Guides panel | unversioned; `deepAssign` onto defaults |

## localStorage: apps

The 18 theme keys below are written by `shared/theme/theme.js` whenever the person picks a theme in Settings (JSON string, or the `theme` field of `slop-ai.prefs`, or a plain string for `slopvector.theme`). The value is the app's own name for the theme (`pro` for Dark; `system` where the choice follows the operating system, which the app ignores). An app keeps its own value when it differs from the choice, so a theme changed in that app's menu stays on that page.

| Owner | Key | Version | Record format | Read by | Upgrade |
|---|---|---|---|---|---|
| drive/js/core/util.js | `slop-drive.prefs` | envelope v1 | `{ v: 1, data: { view, usageMode, sorts, cols, info, tree, collapsed } }` | Slop Drive | v1 envelope; the flat object from before envelope (and before `sorts`, `cols`) still loads (tested) |
| drive/js/core/io.js | `slop-drive.openIn` | unversioned | map from file type to remembered app id | Slop Drive "open with" | unversioned map |
| drive/js/ui/info-width.js | `slop-drive.info-width` | unversioned scalar | width in px | Slop Drive info panel | unversioned scalar |
| drive/js/ui/shell.js and drive/index.html | `slop-drive.theme` | unversioned (JSON string) | `'light'`, `'classic'` or `'pro'` | Slop Drive, first paint | unversioned; unknown values fall back |
| shared/ai/panel.js, ai/js/core/util.js | `slop-ai.prefs` | unversioned | JSON object `{ theme, ... }` | Slop AI, first paint | unversioned; `load()` returns `{}` on error |
| ai/js/core/engine.js | `slop-ai.fake-cache` | unversioned | JSON cache object | Slop AI (test sandbox) | unversioned; reads `{}` on error |
| ai/index.html | `slop-ai.theme` (inside `slop-ai.prefs`) | unversioned | see above | first paint | see `slop-ai.prefs` |
| admin/index.html | `slop-admin.theme` | unversioned (JSON string) | `'light'` or `'pro'` | Admin | unversioned |
| cutout/js/core/util.js | `slop-cutout.<key>` (prefix: panel, model, brush, look, export) | unversioned | JSON per key | Slop Cutout | unversioned; `U.store.get` returns the default on error |
| cutout/index.html | `slop-cutout.theme` | unversioned (JSON string) | theme name | Slop Cutout, first paint | unversioned |
| slopedit/js/core/util.js | `slopedit.<key>` (prefix) | unversioned | JSON per key (export options etc.) | Slop Edit | unversioned |
| slopedit/index.html | `slopedit.theme` | unversioned (JSON string) | theme name | Slop Edit, first paint | unversioned |
| photoslop/js/core/util.js | `slopshop.<key>` (prefix) | unversioned | JSON per key | Photoslop | unversioned |
| slides/js/core/util.js | `slop-slides.<key>` (prefix) | unversioned | JSON per key | Slop Slides | unversioned |
| pdf/js/core/util.js | `slop-pdf.<key>` (prefix; includes `signatures`) | unversioned | JSON per key; saved signatures are an array | Slop PDF, Sign | unversioned; signature list defaults to `[]` |
| pdf/index.html | `slop-pdf.theme` | unversioned (JSON string) | theme name | Slop PDF, first paint | unversioned |
| watermark/js/settings.js | `slopwatermark.setup` | envelope v1 | `{ v: 1, data: { cfg, logo } }`, where logo is `{ name, dataUrl }` (under 500 KB) or null | Slop Watermark | v1 envelope; a missing, corrupt or other-version record means the defaults |
| docs/js/ui/outline.js | `slop-docs.outline` | unversioned | outline open state | Slop Docs | unversioned |
| docs/index.html | `slop-docs.theme` | unversioned (JSON string) | theme name | Slop Docs, first paint | unversioned |
| tables/index.html | `slop-tables.theme` | unversioned (JSON string) | theme name | Slop Tables, first paint | unversioned |
| crm/index.html | `slop-crm.theme` | unversioned (JSON string) | theme name | Slop CRM, first paint | unversioned |
| invoices/index.html | `slop-invoices.theme` | unversioned (JSON string) | theme name | Slop Invoices, first paint | unversioned |
| orders/index.html | `slop-orders.theme` | unversioned (JSON string) | theme name | Slop Orders, first paint | unversioned |
| contacts | none | none | Slop Contacts has no theme key; it follows the operating system and its own `data-theme` (light or dark), set by shared/theme | Slop Contacts | n/a |
| contacts/js/app/state.js | `slop-contacts.cc` | unversioned scalar | default country code for phone numbers (E.164), per viewer | Slop Contacts | unversioned scalar; `''` on error |
| ledger/index.html | `slop-ledger.theme` | unversioned (JSON string) | theme name | Slop Ledger, first paint | unversioned |
| press/index.html | `slop.press.theme` | unversioned (JSON string) | theme name | Slop Press, first paint | unversioned |
| press/js/core/store.js | `slop.press.<key>` (prefix) | unversioned | JSON prefs | Slop Press | unversioned |
| gallery/index.html | `slop-gallery.theme` | unversioned (JSON string) | theme name | Slop Gallery, first paint | unversioned |
| 3d/index.html | `slop-3d.theme` | unversioned (JSON string) | theme name | Slop 3D, first paint | unversioned |
| inventory/index.html | `slop-inventory.theme` | unversioned (JSON string) | theme name | Slop Inventory, first paint | unversioned |
| vector/index.html | `slopvector.theme` | unversioned scalar | theme name | Slop Vector, first paint | unversioned |
| vector/js/ui/color.js | `slopvector.recentColors` | unversioned | JSON array of recent hex colours | Slop Vector colour picker | unversioned array; `[]` on error |
| vector/js/core/state.js | `slopvector.*` (other keys) | unknown | not enumerated | Slop Vector | unknown |
| label/js/io/files.js, label/js/ui/view-state.js | label prefs keys (passed to `lsGet`/`lsSet`) | unknown | not enumerated | Slop Label | unknown |

## Retired

| Owner | Name | Notes |
|---|---|---|
| contacts (commit c94e877) | `slop-contacts-drafts` / drafts (key `current`) | File `contacts/js/store/drafts.js` deleted. No open in code. Data on a device stays put; nothing reads it. A reader for it would need the old name. |

## Renamed keys

| Old | New | Status |
|---|---|---|
| SlopData settings `currency` | `defaultCurrency` | Read once in `seedDefaults` and moved; `fx.baseIn` also falls back to `currency` (tested) |
