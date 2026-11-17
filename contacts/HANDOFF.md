# Slop Contacts: handoff

Status: **building** (kept in shared/apps.js). Slop Contacts is an address book over the shared customer records
(SlopData `customers`, see shared/data/HANDOFF.md). The same customers are the CRM's and Orders' customers. There is
no separate contact store and no autosave draft: each change is written to the shared store at once. Nothing is
uploaded.

## Layout
- **Wide (960 px and up): three columns.** Left: Library (All Contacts, Recent), Groups (the categories, with counts;
  drag contacts onto one to move them, or hold Alt or Ctrl to copy), Pipeline (Lead, Contacted, Customer, Lost, with
  counts), then Filter (six facets, see "Filters"). Middle: a Cards / Table switch, a search field, the filter chips,
  the count, then the list under letter headers (A to Z, # last). Each row has an avatar (photo or initials), the name,
  and one line: the company, or the stage when there is no company. Right: the card.
- **Splitter:** a draggable bar between the list and the card. Its width is kept in localStorage
  (`slop-contacts.list-width`, read and written in a try/catch). Arrow keys move it, a double-click resets it.
- **Table view** (Table in the switch, or the palette): every shown contact in one table with the columns name,
  organisation, e-mail, phone, groups and notes. The card column and the splitter hide and the table takes the width;
  it scrolls sideways inside its own box, so the page does not. Header click sorts (again reverses; empty values last).
  A double click or Enter on a cell edits it: Enter saves, Shift+Enter is a line break in notes, Escape cancels. A
  multi-value cell takes a list separated by commas or semicolons (entries kept in place keep their label). A row click
  selects; Cmd or Ctrl adds one; Shift takes a range; the checkboxes do the same. The bar under the header adds to a
  group, removes from one, exports, deletes and clears the selection. Rows drag onto groups.
- **The card, read:** a large avatar, the name, company and title; rows for phone, e-mail and address (each with its
  label: mobile, work, home, other), birthday and website; the groups as chips; Notes (the plain notes); Pipeline
  (stage picker and next follow-up date, saved at once); Orders and Invoices (read from the shared `orders` and
  `invoices` collections, with links to `../orders/#o/<id>` and `../invoices/#i/<id>`); Activity (dated notes, with a
  form to add one); Duplicate and Delete at the foot.
- **The card, edit:** Edit turns the card into a form in place, in a fixed frame: a header with the title, a body that
  scrolls (sections: Name with the photo, Contact details with the phone and e-mail rows and birthday and website,
  Address, Notes, Pipeline and groups), and a footer with Cancel and Save that is always in view. Each add button sits at
  the top of its section, so it does not move as rows appear; a new row takes the focus and is scrolled into view only if
  needed. Enter saves; Cmd or Ctrl+Enter saves from notes; Escape cancels (asks first when something changed). The first
  field has the focus. The scrollbar gutter is reserved, so a scrollbar does not change the width.
- **390 px (below 960):** the list is the screen. A contact opens the card as a bottom sheet over the list (SlopSheet, js/app/card.js; its ×, Escape, a tap outside or a swipe down closes the contact), Edit, Duplicate and Delete at its foot. Groups
  open as a sheet from the ☰ button at the top of the list. The top bar keeps New, Import and Export. A test checks there
  is no horizontal scroll.
- **Style:** the system font, generous spacing, subtle separators, one accent (the Slopographic lime). Light and dark
  follow the system setting (`prefers-color-scheme`); `data-theme="light"` or `"dark"` on `<html>` overrides it.

## Files
- `index.html`: the page and the script order.
- `css/contacts.css` (tokens, shell, the columns and the 390 px rules), `css/contacts-list.css` (groups, list,
  search, bulk bar), `css/contacts-card.css` (the card and the edit form), `css/contacts-ui.css` (the SlopUI dialogs),
  `css/contacts-panel.css` (filters, chips, splitter, import dialogs; `--sl-*` tokens), `css/contacts-table.css` (the
  switch and the table).
- `js/core/` (also `bundle.js`: the Slop Drive copy, see "Slop Drive copy") (pure, no DOM, under `SlopContacts.*`):
  - `text.js`, `model.js` (the contact shape the codecs use; `stage`, `followUp` and `tagIds` pass through),
    `photo.js`, `phone.js`, `vcard-read.js`, `vcard-write.js` (3.0 or 4.0), `csv-read.js`, `csv-write.js` (Google,
    Outlook, the plain layout and the XLSX rows), `csv-map.js` (the column guess and the mapping), `import-plan.js`
    (reading a file, matching duplicates, skip, merge or add), `filters.js` (the facets, chips and the URL form),
    `table-model.js` (the table columns, sorting and cell edits), `dedupe.js`, `bulk.js`, `zip.js`, `format.js` (the
    `.scontacts` JSON and the export table).
  - `customer-map.js`: a customer record to a contact and back. See "The shared record" below.
  - `activity.js`: splits a customer's notes into plain notes and dated notes (`[YYYY-MM-DD] text` lines), and joins them.
- `js/app/`:
  - `state.js`: the screen state (`SlopContacts.state`, S). `setList()` writes the difference unless `{ write: false }`.
  - `records.js`: the link to SlopData. Loads the customers, writes each list change as one transaction (changed
    contacts are put over the stored record, removed ones are soft-deleted), runs writes one after another, and reloads
    when another tab or app changes a customer while nothing is pending.
  - `list.js` (the middle column), `select.js` (click, Shift and Cmd click, select mode, arrows, Enter, Space, drag, the
    bulk bar, `remove()` with the confirm dialog), `groups.js` (the left column, the sheet, drops that move or copy).
  - `table.js` (the table view and its inline edits), `layout.js` (the splitter and the Cards / Table switch),
    `filter-panel.js` (the Filter section and the chips), `url-place.js` (the group, filters and view in the URL).
  - `drop-import.js` (files dropped on the list), `import-flow.js` (one import: CSV mapping, then the preview),
    `import-map.js` (the column mapping dialog), `import-preview.js` (the preview, the duplicate choice, Import and Undo).
  - `card.js` (chooses the card view), `card-read.js`, `card-edit.js`, `new-contact.js` (the quick form: name, phone,
    e-mail, company).
  - `io-dialogs.js` (the import picker and the export dialog), `tools-dialogs.js` (duplicates, clean up, find and replace,
    add or remove a group, default country code), `photo-ui.js` (picking a photo, the avatar markup).
  - `keys.js` (Ctrl+Alt+N, which is Cmd+Option+N on a Mac: Chrome keeps Ctrl+N for a new window; Cmd+F, Cmd+A, Delete and Backspace asking first, Escape), `commands.js` (SlopCmd commands and
    `data-cmd`), `main.js` (boot, and a `.scontacts` handed over from Slop Drive is imported).

## The shared record
- The list holds contacts (the codec model). `customer-map.js` is the only place that maps them to records:
  - `name` is the display name (the contact's full name). A vCard N field is split on the last word on export.
  - `phone`, `email`, `address` with `phoneLabel`, `emailLabel`, `addressLabel` are the first value of each kind. The
    rest are in `phones`, `emails`, `addresses` as `{ label, value }`. The first values are the ones other apps read.
  - `company`, `department`, `title`, `website`, `birthday`, `photo`, `notes`, `categories` (the groups), `stage`,
    `followUp`. `contactId` and any other field the screen does not show are kept on the record when a contact is saved.
  - Labels: mobile, work, home, other, or any text. Codec types map to labels (CELL to mobile, WORK, HOME, OTHER).
- Notes: the record's `notes` text holds the plain notes, then dated lines `[YYYY-MM-DD] text`. The card's Activity
  is those dated lines; Notes is the rest. The same format as Slop CRM.
- The contacts and the CRM show the same records. A contact added here appears in the CRM's Customers at once, and
  the other way round.

## Import and export
- **Import:** drop `.vcf`, `.vcard` or `.csv` files on the contact list, or use Import (toolbar, palette), which also takes
  `.tsv`, `.txt` and `.scontacts`. A `.scontacts` handed over from Slop Drive (`?drive=`) comes in the same way.
  - **vCard** (2.1, 3.0, 4.0; any number of cards per file; folded lines, quoted-printable and UTF-8). Photos are
    skipped on import. `tel:` and `mailto:` values lose their scheme; `PREF` and `VOICE` are not types.
  - **CSV** goes through a mapping step first: each column is guessed (name, first and last name, company, job title,
    e-mail, phone, address, notes, groups, birthday, website, or do not import) and can be changed. Several e-mail or
    phone columns each add a value; address columns join into one line; a Google "* myContacts ::: Friends" labels
    cell becomes its groups.
  - **Preview:** every contact is listed as new or as a duplicate. A duplicate matches a contact already in the list on
    a phone (digits, with the default country code) or an e-mail (any case). The choice for duplicates is skip (the
    default), merge (the existing contact keeps its id, stage, follow-up date and shared tags, and gains the other
    values) or add. Import applies it in one change.
  - **Undo** is offered in the toast after an import (about ten seconds). It puts the list back, and is refused once
    anything else has changed the contacts (`S.rev` in state.js counts the person's changes).
- **Export:** vCard 3.0 or 4.0 as one `.vcf`, or one vCard per contact in a `.zip`; CSV (one column per e-mail and
  phone); Excel `.xlsx` (one sheet, bold header; written by the shared writer, `shared/sheets/write.js`, loaded when
  used); Google or Outlook CSV; or `.scontacts`. The scope is the selection when there is one, otherwise every contact.
  Downloads, except the Slop Drive copy (below).
- `.scontacts` stays a file format for import and export. It is not the storage any more.

## Slop Drive copy
- The whole list is one file, `contacts.vcf` (vCard 4.0, UTF-8, CRLF; `core/bundle.js`), in the app's own Drive folder
  (Slop Contacts). Each contact is one VCARD block with the standard properties (N, FN, ORG, TITLE, TEL, EMAIL, ADR, BDAY,
  URL, NOTE) and these custom ones, which other apps ignore: `X-SLOP-ID` (the stable id), `X-SLOP-GROUP` (one line per
  group), `X-SLOP-STAGE`, `X-SLOP-FOLLOWUP` (ISO date), `X-SLOP-TAGS` (one line, comma separated). Photos are not written.
  The file is the Drive copy's source of truth; the local records are the same contacts as the CRM sees them.
- **Save** (`app/drive-save.js`): each change the person makes marks the list dirty, and a save follows after about 3
  seconds. Save (toolbar, File menu, palette) writes at once. A save is a new version of the same Drive record, never a
  second file. Saves run one at a time, and a change made during one is saved after it. The status line (`#driveStatus`)
  says Saving, Saved to Slop Drive at a time, or Could not save with the reason. Without Slop Drive (file:, offline build)
  the Save button and the status line are hidden.
- **Open** (`app/drive-load.js`): at start-up, an empty list is offered `contacts.vcf`. File > Open contacts from Slop
  Drive does the same, and asks before merging into a list that has contacts. Either way the file goes to the import
  preview (`importPreview.show` with `keepIds`, the same plan and apply as a dropped .vcf).
- **Matching**: an incoming contact matches an existing one on `X-SLOP-ID` first, then on phone or e-mail, as for any
  import. A new contact from the bundle keeps its id, unless a record with that id exists in the store (a deleted one
  cannot be written over), in which case it gets a new one. `customerMap.toRecord` now writes the list id into the
  record, so a new contact keeps the id it shows.
- A second import of the same file changes nothing (every contact matches by id; skip or merge leave it as it was).
- `X-SLOP` values are read by the vCard reader too, so a bundle dropped on the list works like any .vcf. A stage that is not
  a pipeline stage, or a follow-up that is not a date, is dropped on read.

## Filters
- Six facets in the Filter section, combined with AND: **group** (every group chosen), **organisation** (exact, ignoring
  case), **e-mail** and **phone** (has, or has none), a **created** or **updated** date range (inclusive, local days; a
  contact with no date is left out of the range), and **tag** (the CRM's shared tags, `customerTags`, by id; the tags
  are read here, not changed). Each set facet is a chip above the list; click a chip to remove it; Clear all removes
  every one.
- The selected group, the filters and the view live in the page URL (`group`, `f` as JSON, `view`) through
  `window.SlopUrlState`. A URL that names a place wins over the saved session place at start-up.

## Actions
- New contact (the quick form, Ctrl+Alt+N). Duplicate (a copy under a new id, opened in the form). Delete (a SlopUI dialog;
  Delete and Backspace ask too).
- Selection: a click opens the contact; Cmd or Ctrl click adds or removes a row; Shift click selects the range; Select
  mode makes every click a toggle (for touch). The bulk bar: add to group, set stage, delete, done.
- Drag a row (or a selection) onto a group in the left column to move it there (out of the open group, when that is a
  group); hold Alt or Ctrl to copy. Dropped from All, Recent or a stage, the contacts are added.
- Keyboard: arrows move through the list and open each contact; Enter opens the card; Space toggles a row; Escape clears
  the selection, then closes the card or the sheet; Cmd+F searches; Cmd+A selects every shown contact (in the list).

## Tests
- `node tests/run.mjs contacts`: `tests/contacts/app.test.html` (the codec specs: vCard, CSV, duplicates, photos; and
  the app specs `contacts.spec-app.js` and `contacts.spec-card.js` on the real page and the shared store), and
  `tests/contacts/import-table.test.html` (`contacts.spec-import-table.js`): a vCard dropped on the list through a
  simulated drop event, the duplicate flagged, merged and undone; the table view (sort, inline edit, selection, the bulk
  bar); a drag onto a group that moves (and copies with Alt); an organisation filter chip in the URL; the splitter by
  keyboard and its width after a reload; the XLSX and vCard 4.0 exports read back.
- `node --test tests/node/contacts-*.test.mjs`: the vCard reader and writer (`contacts-vcard`), the CSV parser, the
  column guess, the mapping and the plain CSV round trip (`contacts-csv`), the import plan, the filters and the table
  model (`contacts-model`), and the Slop Drive bundle (`contacts-bundle`: every field and X-SLOP property round trips,
  the file layout, a second import changes nothing). They load the core through `tests/contacts/contacts.node-env.mjs`.
- `tests/contacts/drive.test.html` (`contacts.spec-drive.js`): the app runs with a stubbed SlopHub (set on the iframe
  after boot). A change is saved after the delay, Save writes at once as a new version, a failed save shows its reason,
  an empty list is offered the file and Import brings back the id, groups, stage and follow-up, and a non-empty list is
  asked before a merge.
- `contacts.spec-app.js`: letter headers in order with # last; a row's second line; a new contact in its letter section
  and in the CRM's Customers; the orders and invoices of a customer from the shared collections with links; a contact
  with no orders; the 390 px layout (no horizontal scroll, list first, full-page card with back); arrows, Enter, Delete
  asking first; Ctrl+Alt+N.
- `tests/contacts/form.test.html` (`contacts.spec-form.js`): the edit form at 390 and 1280 px: its box, the content width
  and the fields above the rows do not move while two phone rows and an address row are added (for a new and an existing
  contact); Save and Cancel are on screen and not covered; the first field has the focus; Escape cancels; Cmd+Enter saves.
- `contacts.spec-card.js`: edit in place (CRM-only fields kept); Cancel asks; stage and follow-up saved at once; a dated
  note in Activity with the plain notes kept; shift, Cmd click and the bulk stage; drag onto a group; duplicate; a vCard
  import becomes customer records (labelled phones and e-mails, birthday, groups).
- Replaced in this change: `contacts.spec-app.js` (old Drive save and reopen, autosave draft, export to Drive, and the
  panel layout) and `contacts.spec-panel.js` (removed; its behaviour is in the card specs). The codec specs are unchanged.
- The shared `shared/data` schema gained the contact fields; the data tests were not run in this change.
- `contacts.spec-card.js`: the vCard import test now confirms the preview before the contacts are added.

## Known limits
- **Structured names are not kept**: a vCard N field becomes the display name. Name prefixes, middle names and
  suffixes are dropped on import. Export splits the name on its last word.
- **Addresses are one line**: the codec model flattens whitespace, so a line break in an address becomes a space when a
  contact is saved from here. Other apps' addresses keep their line breaks until a contact is saved.
- **Department and URL** are kept on the record (`department`, `website`); the vCard ADR parts beyond the street text
  are joined into one line.
- **Photos**: a vCard import skips them. JPEG and PNG only where they are kept (a `.scontacts` file, or a photo picked
  in the form, which is at most 256 px). A link photo is kept as text and shows as
  initials. Photos are stored in the customer record. A photo over about 290 KB (390,000 characters as a data URI) is not kept
  when the contact is saved, and a value over another record limit (notes 5,000 characters, 10 phones, 10 e-mails, 10
  addresses, 20 groups) is cut, so one large contact cannot stop a whole import or bulk change.
- **Labels**: a custom Apple label becomes its letters as one type (for example `DADMAIL`) and shows lower case.
- **Outlook CSV** has fixed slots (see the codec); extra values are not written.
- **No undo** for bulk changes or deletes (deletes are soft in the store, so the CRM keeps the record out of view).
  The one exception is an import: its Undo works while nothing else has changed the contacts.
- **Table**: a cell edit changes the first e-mail or phone of its kind and the list of values after it; the labels of
  entries past the list's length are not kept. Edits go through the same save as the card, so the CRM sees them.
  Narrow screens scroll the table sideways inside its box.
- **Tags** are read from the CRM and used to filter; they are not changed here.
- **Merging** (the import's merge and the Duplicates tool) keeps the richest contact's id, the stage and follow-up date
  (the first contact that has one), and the union of the shared tags.
- **Rendering**: every row is in the DOM; fine for a few thousand contacts.
- **Two tabs** writing at once: each write is a transaction, but a change made in another tab while this tab has a write
  pending is picked up on the next reload, not at once.
- **Not verified in the real apps**: exported files were not imported into iOS, Android, Google Contacts or Outlook here.

## Not done
- `service-worker.js` precaches the app's scripts by an explicit list. It does not yet list `contacts/js/core/bundle.js`,
  `contacts/js/app/drive-save.js` and `contacts/js/app/drive-load.js`; add them there (outside this change's scope).
- Photos are not in the Drive file (the bundle skips them), so a photo does not survive a save-and-open round trip.
- Undo and redo for bulk changes.
- Column choice in the table; a per-field merge chooser; "keep these two separate" for duplicates.
- A per-contact duplicate choice in the import preview (the choice is one for every duplicate in the file).
- Per-contact vCard files are a .zip, not loose files (a browser download makes one file at a time).
- Tag editing on a contact (tags are filter-only here).
- Contacts import from Google or Outlook accounts (files only).
- `view-state.js` in `js/app/` is left from an earlier design (it refers to `storage.js`, which is gone) and is not loaded
  by the page. It should be deleted or rewritten when the place-keeping for this layout is built.
