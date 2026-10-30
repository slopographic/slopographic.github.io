# Paste: handoff

Paste keeps pastes (text, code and images) in Slop Drive. It is registered in `shared/apps.js` as `paste` (status `building`, group `business`). Nothing is uploaded: no server, no network request, no CDN.

## What works
- **Paste anywhere:** paste text outside a field and it becomes a new text paste. Paste an image (or use Image in the list header) and it becomes an image paste. Typing in a field is left alone.
- **New paste:** the New paste button (Ctrl+Alt+N) starts an empty text paste that saves as you type.
- **Listing:** every paste shows its title (or "Untitled paste"), the first line of its text, the language, the expiry label and the date. Search filters on title, text and language. Newest first.
- **Languages:** plain text, JavaScript, Python, HTML, CSS, JSON and Markdown. The choice sets the highlighting. Highlighting uses `js/highlight.js`. The Code app's highlighter (CodeMirror in `code/js`) is not in `shared/`, so this small one is kept here.
- **Highlighted view:** beside the source (stacked on a phone). Each token is a `<span class="tok-…">` (com, str, num, kw, fn, prop, tag, attr, head, quote, link). HTML in the paste is escaped.
- **Expiry:** Never, 1 hour, 1 day, 1 week or 1 month. It is a label only, stored with the paste. Nothing is deleted or hidden by time.
- **Copy:** text goes to the clipboard as text; an image is copied as an image where the browser allows it.
- **Download:** a text paste downloads with an extension for its language (`.js`, `.py`, `.md`, …, `.txt` for plain text). An image downloads in its own format.
- **Share link:** a link to the paste inside the app, `…/paste/index.html?paste=<link ID>`. It is built in the page and copied to the clipboard. It opens the paste in the same browser only, because the pastes are in this browser's Slop Drive. Nothing is sent anywhere.
- **Random link ID:** 16 characters from `crypto.getRandomValues`, from a 32-character alphabet without look-alike letters (`store.js`, `randomId`). It is stored as `meta.pasteId`, separate from the Drive id.
- **Saving:** each change is written to Slop Drive about 600 ms after the last keystroke. The indicator reads "Saving…", then "Saved to Slop Drive". SlopGuard asks before a reload or close while a change is still waiting.
- **Reading back:** on open the app reads every Drive record with `meta.type === 'paste'`. With `?paste=`, it opens that paste. Without it, the paste open last is reopened (SlopSession). An unknown link says so and opens nothing.
- **Trash:** Trash moves a paste to the Slop Drive Trash, after a confirmation.
- **Commands (SlopCmd):** New paste, Add image paste, Copy, Download, Copy share link (Ctrl+Alt+L), Move to Trash, Search pastes (Ctrl+Shift+F), Next and Previous paste (Ctrl+Alt+Arrow keys).
- **Right-click menu** on a list item: Open, Copy, Download, Copy share link, Move to Trash.
- **Phone (390 px):** the list or the paste, one at a time. Back returns to the list.

## Where the data lives
- Each paste is one Drive file. A text paste is a `text/plain` blob, and an image paste is the image itself.
- `meta` is `{ type: 'paste', pasteId, title, language, expiry, kind }`, where `kind` is `text` or `image`.
- New files go into the app's own Drive folder, named Paste (`SlopHub.put` with `from: 'paste'`).
- Trash moves the Drive record to the Trash. The Drive backup (Slop Admin, "Export everything") covers these records. The app has no separate store.

## Files
- `index.html`: the shell and the shared scripts.
- `css/paste.css`: tokens (light, dark), the layout, the code block and the token colours.
- `js/main.js`: boot, the top bar, the save indicator, SlopGuard, the `?paste=` link and the reopen of the last paste.
- `js/store.js`: the Drive model, random link IDs, debounced saves and Trash.
- `js/state.js`: the shared state and the list filter.
- `js/actions.js`: new pastes, paste handling, copy, download, the share link, Trash and step.
- `js/view.js`: the list, the open paste, the highlighted view and the editor controls.
- `js/highlight.js`: the highlighter and the language list. `js/commands.js`: SlopCmd commands and the list menu. `js/dom.js`: DOM helpers.

## Tests
`node tests/run.mjs paste` (`tests/paste/paste.test.html`): pasting text anywhere lists it with its title line, the language sets the highlight class and token spans, the paste is saved to Drive and says so, the expiry label is kept as a label, the share link is `?paste=<id>` on this origin and opens the same paste, an unknown link opens nothing, an image paste shows, the last paste reopens, the highlighter escapes markup, and the SlopCmd commands are registered. Drive is the shared hub on the test origin (its own IndexedDB, fresh per run), as in `tests/code`.

## Known limits
- The highlighter is small: it handles comments, strings, numbers, keywords, function names and the listed languages' markup. It is not a full parser.
- Share links only open in the browser that holds the paste. There is no server, by design.
- The expiry is a label. Nothing expires.

## Assistant commands
`js/ai-commands.js` (imported by `SlopCmd.prepare()` from `commands.js`): `paste.ai.new_paste` (title, text, language, expiry), `insert_text` (paste, text, where), `set_paste` (paste, title, text, language, expiry), `delete_paste` (destructive: Drive Trash), `export_paste` (paste, to, name: a file with its language's extension). The checkpoint trashes pastes made since and puts changed ones back. Test: `tests/paste/ai-commands.test.html`.
