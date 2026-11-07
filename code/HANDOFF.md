# Slop Code: handoff

Slop Code is a code editor that runs entirely in the browser, with its files in Slop Drive. It is registered in `shared/apps.js` as `code` (status `building`, group `creative`). Nothing is uploaded, and nothing is fetched at run time: CodeMirror 6 is vendored under `vendor/codemirror/`.

## What works
- **Editor:** CodeMirror 6 with line numbers, fold gutters, bracket matching, auto-close brackets, active-line highlight, undo history, search and replace (Ctrl+F, Ctrl+H), multiple cursors (Ctrl+click adds one, Alt+drag selects a block), and a line-wrap toggle. Each open file keeps its own undo history.
- **Languages:** JavaScript, TypeScript (also TSX), HTML, CSS, JSON, Markdown, Python and plain text. The language follows the file extension.
- **Completion:** Ctrl+Space opens the list. Enter or Tab accepts. Sources, in the order they are merged:
  - JavaScript and TypeScript: the package's keywords and snippets, plus the names in the local scope (`localCompletionSource`).
  - JavaScript and TypeScript globals: `window` names (`document`, `console`, `Array` and so on), read once from `globalThis` (`js/completion.js`).
  - HTML: the package's tags and attributes. CSS: property names and values. Python: keywords and builtins. Markdown: the HTML tags inside it.
  - JSON: `true`, `false` and `null`, outside strings. `@codemirror/lang-json` ships no completion source, so this is added here.
  - Word completion from the open document, for every language.
- **Explorer (left sidebar):** the Slop Drive folder tree (folders and files as Drive shows them, Trash hidden), with its own sections (see below).
  - Click a folder to open or close it. The clicked folder is selected (highlighted) and is where File and Folder put new items.
  - Click a file to open it. The sidebar stays open on desktop; only the phone drawer closes after a choice.
  - Drag a row onto a folder to move it there. Drop on the empty list to move it to the root. A folder cannot go into itself or one of its folders. A file that clashes with a name in the target gets a free name, as New does.
  - Right-click (or the Menu key) for New, Open, Rename, Move to… (a Drive folder picker, for touch), Copy path and Delete. Delete moves to the Trash through a SlopUI dialog.
- **Sidebar layout:** the width is dragged on the right edge, or set with the arrow keys (160 to 480 px, double-click resets to 232). Each section (Explorer, Open editors, Extensions) collapses from its header. Width and collapsed sections are kept per viewer (see Storage below). Ctrl+B shows or hides the whole sidebar.
- **Open editors:** a list of the open files, under the tree. The active file is marked, unsaved files have a dot, and × closes a file (the same as its tab).
- **Extensions:** a panel of built-in helpers, nothing downloaded. Each has an On/Off switch, kept per viewer:
  - **Formatter:** Format document (Ctrl+Shift+F, or its button). JSON is parsed and printed with two-space indents. JavaScript, TypeScript and CSS are re-indented by brace depth; lines inside a block comment or template literal are not changed. Every language loses trailing spaces. Bad JSON is reported and the text is kept.
  - **Language mode switcher:** Set language mode (palette, or its button) changes highlighting and completion for the open file. The name and the Drive record do not change. The choice lasts for the session (it is kept with the open tab, not after a reload).
  - **Snippets:** Ctrl+Space offers snippets for JavaScript, TypeScript, HTML, CSS, Python and Markdown (for example `log`, `fn`, `html5`, `flex`, `def`, `table`). They are not offered inside strings or comments. The templates are in `js/snippets.js`.
- **Storage (per viewer, localStorage):** `slop-code.layout` (the sidebar width and collapsed sections) and `slop-code.extensions` (the helper switches). Both are versioned envelopes, `{ v: 1, data }`, read and written in try/catch, so a blocked or full storage just means the defaults apply. Slop Drive storage and its keys are unchanged.
- **Open, save, save as, new:**
  - Ctrl+O opens from Drive. `?drive=<id>` opens a file (used by Send to and Open with).
  - Ctrl+S writes back to the same Drive record (same id, same name, a new blob).
  - Save as writes a copy to a folder you pick, then opens it.
  - New asks for a type (which sets the extension and language) and a name.
  - Pictures, audio, video and PDFs open in their own tab as views (see Files and views below). A file that is not text, and has no viewer, opens as a "Not text" view with an Open in an app list.
- **Markdown preview:** a Markdown tab has a Preview button (Edit switches back). The rendered view is built from the editor text, so unsaved edits show. Only the view changes; the file and its Drive record do not.
- **Drafts:** unsaved text autosaves per file in IndexedDB (`slop-code` / `drafts`, about 400 ms after an edit). Reopening a file restores the draft as unsaved. Saving or discarding removes it.
- **Unsaved tabs:** a dot marks an unsaved tab. Closing one asks Save, Discard or Cancel in a SlopUI dialog. `SlopGuard.setUnsaved` makes a reload ask too.
- **Tabs** are remembered per viewer (localStorage `slop-code.tabs`).
- **Run:** an HTML file shows its page in the preview. A JavaScript file runs alone. Project CSS, JS and images come from the file's Drive folder (subfolders too). Open tabs use their unsaved text. Console output and uncaught errors show under the preview.
- **Commands (SlopCmd):** Open, New, New folder, Save, Save as, Close tab, Find, Replace, Toggle wrap, Show or hide Explorer, Show Extensions, Set language mode, Format document, Run. Shortcuts show in the palette and menus. Without SlopCmd, the same shortcuts are handled in `js/commands.js`.
- **Phone (390 px):** the sidebar (Explorer, Open editors, Extensions) is a drawer from the left behind the Files button: `SlopSheet.attach({ side: 'start' })` from `shared/ui/sheet.js` (`initDrawer` in `js/ui.js`; see `shared/ui/HANDOFF.md`). Files again, its ×, Escape, a tap outside and a swipe left close it; Ctrl+B toggles it. There is no scrim or `cd-drawer-open` class of Code's own any more. It closes after a file is opened. `tests/code/tree.test.html` checks it at 390 px. The resize handle is hidden. The preview covers the screen.

## Files and views
- A tab is either a **text** tab (the editor; saved with Ctrl+S) or a **view** tab (`doc.kind` is `image`, `audio`, `video`, `pdf` or `binary`). A view tab is read only: Save, Save as and Run are off, and the status bar says so. Its editor state stays empty.
- Kinds come from the extension (`mediaKind` in `js/viewers.js`). Any other file is text if it has no NUL byte in its first 8 KB (`readText`), and binary otherwise.
- **Image:** the shared SlopPreview viewer (`shared/preview/chrome.js` and `preview.js`, loaded as classic scripts): zoom, pan, fit.
- **Audio and video:** native `<audio controls>` and `<video controls>` on a blob URL.
- **PDF:** the browser's own PDF view in an `<iframe>` on a blob URL, opened at page 1 (`#page=1`). PDF.js is not used, so there is no page thumbnail strip, and the browser decides the controls.
- **Binary:** a "not a text file" message, and an Open in an app button. It lists the apps that accept the file's type (`SlopHub.appsAccepting`, the same list Slop Drive uses) and opens the chosen one with `SlopHub.sendTo(app, null, name, { id })`.
- **Markdown:** a text tab with a Preview button (`js/markdown.js`, DOM-built, so no raw HTML from the file is shown). Supported: headings, paragraphs, lists, block quotes, fenced code, rules, `code`, bold, italic and links (http, https, mailto, relative and `#` only). Images show their alt text.
- Object URLs for view tabs are revoked when the tab closes (`closeDoc`).

## Shortcuts
| Action | Keys |
|---|---|
| Open | Ctrl+O |
| New file | Ctrl+Alt+N |
| Save / Save as | Ctrl+S / Ctrl+Shift+S |
| Close tab | Ctrl+Alt+W |
| Find / Replace | Ctrl+F / Ctrl+H |
| Toggle wrap | Ctrl+Alt+Z |
| Show or hide Explorer | Ctrl+B |
| New folder | Ctrl+Alt+Shift+N |
| Format document | Ctrl+Shift+F |
| Run | Ctrl+Enter |
| Complete | Ctrl+Space (Enter or Tab accepts) |

Ctrl+Alt is used instead of Alt alone. SlopCmd only passes Ctrl or Cmd shortcuts through while the editor has focus, because the editor is a text field.

## The run preview and its sandbox
- The preview is an iframe with `sandbox="allow-scripts"`. It has no `allow-same-origin`, so it cannot read storage or the app.
- Its document has `Content-Security-Policy: default-src 'none'; ... connect-src 'none'; ...`. Scripts and styles are allowed inline (`unsafe-inline`, `unsafe-eval`). Images and media are allowed as `data:` and `blob:` only. Every network request (fetch, XHR, WebSocket, beacon) is refused.
- Project files are inlined when the page references them by a relative path: stylesheets and scripts as text, images as data URLs. Other references are left alone, and the policy stops them loading.
- A console hook (inside the preview) posts `console.*` and uncaught errors to the app with `postMessage`. The app takes messages only from this frame.
- Each run builds a new srcdoc, so the frame reloads and the console clears.

## Vendored packages and licences
Vendored by `tools/vendor-codemirror.mjs` from `cdn.jsdelivr.net/npm/` (build time only). Version table, the licence texts (MIT, all packages) and the import map: `vendor/codemirror/README.md`, `vendor/codemirror/LICENSES.txt`, `vendor/codemirror/import-map.json`. The map is also inlined in `code/index.html`, and `tests/code/vendor.test.html` checks that the two match. Key packages: `@codemirror/state`, `view`, `language`, `commands`, `autocomplete`, `search`, `lint`, the `lang-*` packages, and the `@lezer/*` parsers.

## Files
- `index.html`: the shell, the import map and the scripts.
- `css/base.css`, `css/editor.css`: tokens (light and dark), layout, tree, tabs, status bar, preview and the CodeMirror theme.
- `js/main.js`: boot and the action table. `js/commands.js`: SlopCmd commands and fallback.
- `js/editor.js`, `js/completion.js`, `js/lang.js`: the CodeMirror setup (the language is in a compartment, so `setLanguage` can change it), completion sources (snippets are added here), language table and `langOf` (the language of an open document).
- `js/docs.js`: open documents (one view, one state per document). `js/ops.js`: open, save, save as, new, close, drafts, tab restore.
- `js/drafts.js`: IndexedDB drafts. `js/drive.js`: reads and writes records, the folder tree, unique names, project files.
- `js/tree.js`: the Explorer's folder tree, its drag and move, selection, and its menu. `js/explorer.js`: the sidebar layout (width, collapsed sections, resize) and the Open editors list. `css/explorer.css`: the sidebar styles.
- `js/extensions.js`: the Extensions panel and its actions (format, language mode). `js/format.js`: the formatter (a pure function). `js/snippets.js`: the snippet sets and their completion source. `js/prefs.js`: the versioned localStorage envelope and the helper switches.
- `js/tabs.js`, `js/ui.js`, `js/dialogs.js`, `js/dom.js`: tabs, chrome, dialogs (including the language dialog).
- `js/viewers.js`: the view tabs (image, audio, video, PDF, binary) and the Markdown preview sync. `js/markdown.js`: the Markdown renderer. `css/viewers.css`: their styles.
- `js/run.js`, `js/preview-doc.js`: Run, the srcdoc builder, the CSP and the console hook.

## Tests
`node tests/run.mjs code` runs `tests/code/*.test.html` (open-save, completion, preview, unsaved, commands, tree, explorer, extensions, vendor, viewers) and `tests/node/code-local.test.mjs`. `viewers.test.html` covers the picture, audio, video, PDF and binary views, the Markdown preview toggle, and that view tabs are read only. `explorer.test.html` also checks that clicking a file leaves the desktop sidebar open. `explorer.test.html` covers drag and move, Move to…, selection, the width and sections (kept across a reload), the Open editors list and the phone layout. `extensions.test.html` covers the formatter (pure and in the app), the switches (a v1 envelope, and a blocked storage), snippets in completion, the language dialog and the new SlopCmd commands. The last one fails if `code/` makes a network call (fetch, XMLHttpRequest, http(s) URLs, WebSocket) outside comments, or if a file in `code/` is over 300 lines. `tests/run.mjs` ignores the browser's CSP refusal messages, because the sandbox test triggers one on purpose.

## Limits
- No language server: no type checking, go-to-definition, rename or diagnostics beyond the parsers' own. The completion is what the packages and word matching give.
- No git, no projects beyond the Drive folder tree, no terminal, no linter. The formatter is a small brace-depth re-indent, not a parser: it is not Prettier.
- The Explorer shows every visible Drive file, not only the ones Slop Code made. Touch devices have no drag: use Move to… there.
- The language set with the mode switcher is not saved with the file, and it is lost on a reload (the name decides the language again).
- The editor works on one Drive record per tab. If another app or tab changes a file that is open here, Save overwrites it. The app does not watch for that yet.
- Run uses the folder of the file. A `../` path in an HTML file is not resolved, and a path that is not in Drive is not found.
- Delete moves to the Drive Trash (it does not remove the record).
- View tabs are not edited or saved, so a picture or PDF cannot be changed here. The Open in an app list is shown for binary files only, not for pictures, media or PDFs.
- The Markdown renderer covers the common syntax only: no tables, no nested lists, no footnotes, and no images from the file (their alt text is shown).
- The service worker's PRECACHE list does not include `code/` or `vendor/codemirror/`, so offline use is not set up. Regenerate the list with `node tools/pwa-precache.mjs` when this app is ready to ship.
- Vendored CodeMirror files are the unminified upstream modules, so some exceed 300 lines. The limit applies to code Slop writes.

## Assistant commands (`js/ai-commands.js`)
Imported on demand by `SlopCmd.prepare()` (`js/commands.js`). `code.ai.*`, hidden, none destructive: `new_file` (name, code, folder),
`open_file`, `insert_text` (cursor, start, end or before a line), `replace_text`, `set_text`, `format_document`, `run_preview`,
`save_file` (its own Drive record) and `export_file` (a copy to Slop Drive and/or a download). Each edit is one CodeMirror
transaction (one Ctrl+Z); the checkpoint puts the open files' text back. Test: `tests/code/ai-commands.test.html`.
