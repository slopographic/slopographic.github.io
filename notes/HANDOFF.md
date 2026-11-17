# Slop Notes: handoff

Slop Notes keeps notebooks, folders and Markdown notes in Slop Drive. It is registered in `shared/apps.js` as `notes` (status `building`, group `business`). Nothing is uploaded. There is no build step and no CDN: the Markdown renderer, the blocks and the exports are in this folder.

## What works
- **Notebooks:** the sidebar lists them with counts. "All notes" shows every notebook. New notebook asks for a name. Right-click (or the Menu key) gives Open, New note, New folder, Rename, Export notebook (zip) and Move to Trash.
- **Folders:** folders sit inside a notebook and nest (the sidebar indents them). A note can be moved to a folder or to the top of its notebook, or to another notebook, from its menu. "Whole notebook" shows every note in the notebook.
- **Notes:** a title, tags (comma separated, shown in the sidebar as filters) and a Markdown body. A pinned note sorts first and shows a star.
- **Rename:** a note, a folder or a notebook is renamed from its right-click menu (Rename…) or with F2 on its row. The new name is saved in the record's `meta.title` (and a note's file name follows it).
- **Live preview:** Write, Split or Preview (the buttons, or Ctrl+Alt+V to cycle). The preview updates as you type.
- **Markdown:** headings, paragraphs, bold, italic, strike, code spans and fenced code, quotes, bullet, numbered and task lists, rules, links (http, https, mailto, `#`, relative), pipe tables and callouts. Typed HTML is escaped, so it shows as text. Images are shown only when they are `data:image/…;base64` (no remote loading). Nested lists are not supported.
- **Blocks:** the Insert block button and the right-click menu of the source offer Heading 1 to 3, Table (rows and columns chosen), Video link, Image, Code block (language), Checklist, Quote, Divider, Callout (Note, Tip, Warning) and Link. Each block is plain Markdown at the caret, so it survives export and reopening (`blocks.js`, `insertAtCaret` in `editor.js`, which uses `execCommand` so undo keeps it).
- **Video link:** a YouTube, Vimeo or direct video file (.mp4, .webm, .ogv, .mov, .m4v) link becomes a `[!VIDEO]` card: the title (optional, else the provider) and links to open the video and, for YouTube, the thumbnail. No iframe is embedded and nothing is requested; the page opens only when the person clicks (`video.js`).
- **Image:** a PNG, JPEG, GIF or WebP picked from the computer (up to 2 MB) is written into the note as a data URL, so it is saved with the note.
- **HTML table paste:** pasting clipboard HTML that contains a `<table>` (a web page or a spreadsheet) inserts a Markdown table, read with `DOMParser` (inert, nothing runs, no image loads). Colspan and rowspan are spread over the grid, the first row is the header, `|` in a cell is written `\|`, and `text-align` or `align` gives the column alignment. Bold, italic, strike, code and http links in a cell are kept. Pasted Markdown or plain text is not changed (`table.js`, `editor.js`).
- **Search:** the search box filters on title, text and tags, across the chosen notebook or all of them.
- **Saving:** every change is written to Slop Drive about 600 ms after the last keystroke (`store.js`, `touch` and `flush`). The indicator reads "Saving…", then "Saved to Slop Drive", or "Not saved: …" on an error (which retries). SlopGuard asks before a reload or close while a change is still waiting.
- **Reading back:** on open the app reads every Drive record with `meta.type === 'notes'` (`store.load`). The note last open is reopened through SlopSession.
- **Export menu:** one choice per format, for the note (the Export button, and Export in the right-click menu):
  - Markdown (.md): the body as written.
  - HTML (.html): one standalone page, styles inline.
  - Plain text (.txt): the title and the text, marks taken off, links as `text (url)`, tables as tab-separated lines (`plain.js`).
  - PDF: the print view. A hidden frame holds the note's page and the print dialog opens; "Save as PDF" gives the PDF.
  - Word (.doc): HTML with the Office namespaces, which Word opens.
  - Whole notebook as a zip of Markdown or HTML files, in folders, through the shared zip writer (`shared/office/zip.js`). Notebook menu: Export notebook.
- **Trash:** Delete moves a note to the Slop Drive Trash. Deleting a notebook or a folder moves everything in it to the Trash. Restore from the Drive Trash.
- **Commands (SlopCmd):** New note (Ctrl+Alt+N), New notebook, New folder, Export as .md or .html, Search notes (Ctrl+Shift+F), Pin or unpin (Ctrl+Alt+P), Move to Trash, Cycle view (Ctrl+Alt+V), Next and Previous note (Ctrl+Alt+Arrow keys).
- **Phone (390 px):** the note list or the editor, one at a time (Back returns to the list). The notebooks, folders and tags are a drawer from the left over them: View ▸ Notebooks opens and closes it (`SlopSheet` from `shared/ui/sheet.js`, `side: 'start'`, attached in `js/main.js`), and the shared ×, Escape, a tap outside, a swipe left or choosing a notebook or folder close it. `S.pane` no longer has a 'side' value.

## Where the data lives
- Each note is a Drive file: `text/markdown`, the body is the blob, the name is `<title>.md`. Its `meta` is `{ type: 'notes', kind: 'note', title, tags, pinned, notebook, folder }`.
- A notebook and a folder are small Drive files (`application/x-slop-notes`) with `meta.kind` `'notebook'` or `'folder'`. A folder has `notebook` and `parent`.
- New files go into the app's own Drive folder, named Slop Notes (`SlopHub.put` with `from: 'notes'`).
- Deleting moves to the Drive Trash, and `list` leaves the Trash out.
- Pictures in a note are inside the note's body (data URLs), not separate files.
- The backup of Slop Drive (Slop Admin, "Export everything") covers these records, because they are Drive files. The app has no separate store.

## Files
- `index.html`: the shell and the shared scripts (apps, slopui, hub, ctxmenu, guard, commands, session).
- `css/notes.css`: tokens (light, dark), the three-pane layout and the phone layout, the Markdown look, tables, callouts and the dialog form.
- `js/main.js`: boot, the top bar, the Insert block and Export buttons, F2, the save indicator, SlopGuard and the reopen of the last note.
- `js/store.js`: the Drive model, the debounced saves and the Trash.
- `js/state.js`: the shared state and the filters the list, tags and folders use.
- `js/actions.js`: every change (new, rename, pin, move, trash, select, export). The views and menus call these.
- `js/side.js`, `js/list.js`, `js/editor.js`: the sidebar, the note list and the editor with the preview, the caret insert and the HTML-table paste.
- `js/menus.js`: right-click menus, the Export items (`exportItems`) and F2 rename. `js/commands.js`: the SlopCmd commands.
- `js/blocks.js`: the block menu and its dialogs. `js/table.js`: the Markdown table builder and the HTML table converter. `js/video.js`: video links and the card.
- `js/markdown.js`: the renderer (tables, callouts). `js/export.js`: the .md, .html, .txt, .doc and print exports and the notebook zip. `js/plain.js`: Markdown to plain text. `js/dom.js`: small DOM helpers.

## Tests
- `node tests/run.mjs notes` runs all of these:
  - `tests/node/notes-table.test.mjs`: the HTML table converts to the expected Markdown (headers, alignment, escaped pipes, colspan, rowspan, inline marks, script text and nested tables), and the Markdown renders back as a table. It runs the real `DOMParser` in headless Chromium, as `pwa-offline` does.
  - `tests/notes/notes.test.html`: notebooks and notes, Markdown and the preview, HTML escaping, the save to Drive and the indicator, pin, search, the right-click menu, a reload, the renderer's link rules, SlopCmd and the phone layout.
  - `tests/notes/blocks.test.html`: the block menu, a table block, a video card (no iframe in the preview), a code block with the caret inside it, checklist, quote, divider, callout, heading, link, the HTML-table paste (and plain text left alone), F2 rename saved to Drive.
  - `tests/notes/export.test.html`: the Export menu's choices, the HTML export of a note with a table block (the table is in the file), the .txt, .doc, .md and notebook .zip files, and the print view.
- Drive is the shared hub on the test origin (its own IndexedDB, fresh per run), as in `tests/code`.

## Known limits
- PDF is the print view, not the shared PDF renderer: `shared/docs/pdf-render.js` draws invoice views (rows and totals), not free text.
- Video is a card with links only. There is no embedded player, so nothing plays inside the note.
- A paste with a table inserts the tables only; other text in the same clipboard HTML is not kept (plain text pastes unchanged).
- Pictures are limited to 2 MB each and are stored as base64 in the note, so a note with many pictures is large to save.
- No nested lists, footnotes or math in the Markdown.
- Notebooks and folders are records in Slop Drive, so they also appear in the Drive app as files of an unknown type. Renaming them in Notes renames the record.
- Only one browser profile sees the notes (Slop Drive is per browser).
- `service-worker.js` precaches the app files and was not regenerated for the new files (`js/blocks.js`, `js/table.js`, `js/video.js`, `js/plain.js`), so offline use of the new blocks and exports needs a regenerated precache.
- The SEO description in `index.html` still says ".md or .html" (it is generated from `shared/seo/copy.mjs`, which was not changed).
- The Commands list does not yet include the new export formats or the blocks.

## Assistant commands (`js/ai-commands.js`)
Imported on demand by `SlopCmd.prepare()` (`commands.js`); `notes.ai.*`, hidden. `new_note` (title, Markdown body, tags,
notebook by name, made when new), `new_notebook`, `insert_text` (end or start), `set_note` (title, body, tags, add_tags,
pinned), `delete_note` (destructive: `actions.remove(n, { ask: false })`, to the Drive Trash), `export_note` (md, html, txt,
doc through `export.blobFor`, to Slop Drive and/or a download). Notes are named by id or title, else the open one. Saves go
through `store.touch` like typing. The checkpoint trashes the notes and notebooks the assistant made and puts changed notes
back. The PDF is the browser's print view, so it is not offered. Test: `tests/notes/ai-commands.test.html`.
