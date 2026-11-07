# Slop CRM (crm/)

Customers, groups and tags, a pipeline board, dated notes, follow-ups, and each customer's orders and invoices. Browser
only, local only. All data is the shared business store (`shared/data/HANDOFF.md`). The customer record, the groups
and the tags are collections there; orders and invoices are read from their shared collections, never copied.

## What works
- **Customers is the first tab and the start screen**, on every size. Columns: Name, Stage, Last activity, Follow-up.
  Click a header to sort; a second click turns it round. On narrow lists a Sort box does the same. Sort and density
  (Comfortable or Compact) are remembered in this browser.
- **Sidebar filter**: All customers, then Groups and Tags, each with its count. Pick a group and a tag together to
  narrow the list. Manage opens the Groups panel or the Tag manager. On a phone the sidebar is a row of chips above the list.
- **Groups** (named sets, many to many): create, rename and delete in the Groups panel. Names are unique ignoring case.
  Bulk "Add to group…" and "Remove from group…" act on the selection. Deleting a group takes it off its customers only.
- **Tags** (coloured labels, one definition each, 8 colours): create, rename, recolour, merge one tag into another
  (customers with both keep it once; the old tag is removed) and delete, with a confirmation for merge and delete.
  Tags show as coloured chips in the list, the detail panel and the form.
- **Categories are kept as they were**: free text, one comma-separated list per customer, not shared. Tags are the
  coloured, shared ones. The Tag manager and the form say so in plain words.
- **Customer form** in a SlopUI dialog, in six sections: Contact (name, photo, phone numbers, email addresses),
  Company (company, department, job title, website), Addresses, Tags and groups (categories, tags, groups), Notes, and
  Follow-up (pipeline stage, follow-up date). Phones, emails and addresses each have a label (mobile, work, home ...)
  and can be added or removed (up to 10). Each bad field shows its own message next to it; a save that fails keeps the
  dialog open at that field. Reset (shared SlopFormReset) puts back the values the form opened with.
- **Photo**: a picked picture is scaled to at most 256 px and kept as a JPEG in the customer record (at most about
  400 000 characters). Without a photo the customer shows initials.
- **Detail panel**: photo and name, every phone, email and address with its label, company facts, website, tags and
  groups (add or remove, saved at once), stage and follow-up, categories, dated notes, orders and invoices.
- **Layout**: on a window 960 px or wider, picking a customer opens the detail in a right pane beside the list. With
  nothing picked the list is full width. Narrower screens show the detail as a bottom sheet (SlopSheet) over the tab it was opened from, Edit details at its foot; its × closes it. The list's own
  layout follows its width (container queries): the sidebar stacks and the date columns drop when the list is narrow.
- **Pipeline**: one column per stage. Drag a card, use its Move button, right-click it, or press the Menu key.
- **Follow-ups tab**: customers with a follow-up date, overdue first, then today, then later. Done clears the date.
- **Import from Slop Contacts**: reads the newest `.scontacts` list from Slop Drive. Groups in Slop Contacts become
  categories on the imported customer (they do not become CRM groups).
- SlopCmd commands (including Manage tags and Manage groups), right-click menus, SlopHub registration, SlopGuard.

## Model and storage
- `customers` (existing) gains `groupIds` and `tagIds` (arrays of ids). The first phone, email and address stay in
  `phone`, `email`, `address` with `phoneLabel`, `emailLabel`, `addressLabel`; the rest are in `phones`, `emails`,
  `addresses` as `{ label, value }`. Blank rows are dropped on save.
- `customerGroups`: `{ id, name }`. `customerTags`: `{ id, name, color }` (colour from `ENUM.tagColor` in
  `shared/data/schema-defs.js`). Both are hard-deleted; deleting one first takes its id off every live customer, in the
  same transaction.
- The store is at version 3 (`shared/data/store.js`): version 3 creates the two new stores. Exports made before this
  read them as empty (`shared/data/bundle-check.js`), so old backups still import.
- `NS.labels.ops` holds the group and tag operations as functions of a store transaction API; `NS.labels` wraps them
  for the browser. Filtering and sorting are pure (`NS.query`), and the form mapping and checks are pure
  (`NS.fields`), so the node test runs them without a browser.
- Notes are one text field in the shared model, so each note is a line `[YYYY-MM-DD] text`. A line without a date
  continues the note above it. An imported contact note has no date and shows as "Earlier". The form's Notes box
  edits this text as a whole; the detail panel adds dated notes.

## Files
- `js/core/`: `labels.js` (groups and tags), `customer-fields.js` (form mapping and checks), `query.js` (filter and sort),
  plus the existing `customers.js`, `notes.js`, `util.js`, `contacts-import.js`.
- `js/ui/`: `list.js` (the Customers tab), `sidebar.js`, `groups-panel.js`, `tag-manager.js`, `form.js`,
  `form-parts.js` (fields, entry rows, photo, tag and group picker), `photo.js`, `detail.js`, `bulk.js`, `app.js`.
- `css/crm.css` (list, layout) and `css/crm-labels.css` (chips, sidebar, form, manager dialogs).

## Limits
- Notes in the detail panel are append-only; the form's Notes box can rewrite the whole text.
- One follow-up date per customer.
- Photos live in the customer record, so a large photo makes that record large. Pictures are not resized again later.
- The Groups panel and the Tag manager do not refresh when another tab changes labels while they are open; close and
  reopen them. The pickers in the form and the detail refresh on each change.
- Deleted (soft-deleted) customers keep their label ids; those ids are ignored because the label is gone.
- Contacts import is one-way and only creates customers. Later edits in Slop Contacts do not update a linked customer,
  and a deleted linked customer is never re-imported.
- Uniqueness of `contactId` is checked when the import is planned, not by a store index.
- Drag and drop needs a mouse or a stylus with HTML5 drag support; on touch, use the Move button.
- No duplicate detection by email or phone.
- Orders and invoices are read-only here (they are made in their own apps).
- **Offline**: `service-worker.js` has a fixed list of CRM files to precache (around lines 47–50). The files added for
  groups, tags and the form (`js/core/labels.js`, `js/core/customer-fields.js`, `js/core/query.js`,
  `js/ui/photo.js`, `js/ui/form-parts.js`, `js/ui/sidebar.js`, `js/ui/groups-panel.js`, `js/ui/tag-manager.js`,
  `css/crm-labels.css`) must be added to that list, or the CRM will not work offline until they are.

## Tests
- `node tests/run.mjs crm` runs all of these:
  - `tests/node/crm-model.test.mjs`: group and tag names, membership and counts, merge, delete, filter, sort, and the
    form's field mapping and checks.
  - `tests/crm/crm.test.html` (390 px, opens on the pipeline): pipeline moves, the form, notes, import, follow-ups.
  - `tests/crm/bulk.test.html` (1100 px): bulk actions, and the two panes (full-width list until a customer is picked).
  - `tests/crm/list.test.html` (390 px, starts on the list): list first, sorting, density, adding a tag to a customer.
  - `tests/crm/labels.test.html` (1100 px): the Groups panel, bulk add and remove from a group, merging tags, and the
    form's messages next to fields.
- `tests/storage/upgrade.test.html` expects store version 3 and the two new stores.
