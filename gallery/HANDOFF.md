# Slop Gallery: handoff

A photo library that runs entirely in the browser. Classic scripts, no build step, no network. Open `gallery/index.html`.

## What works (tested)

Run `node tests/run.mjs gallery`: the checks in `tests/gallery/` (library and I/O page, an app page that boots the real UI in an iframe, `reel.test.html`, which runs the gallery and SlopCut in iframes for Make reel, `viewer.test.html`, the viewer's preview, wheel, drag and arrow keys, and `drive-source.test.html`, the Drive source with stubbed Slop Drive calls).

## The panel on the right (the suite rule, shared/frame/HANDOFF.md)

`js/ui/panel.js` mounts SlopFrame on `.body`: the photos are the view, `#gPanel` (in index.html) the panel. Views, albums and
filters stay on the left (`#side`, a drawer on a phone). The panel holds the selection (Sort, Make reel, More actions),
Add photos (a folder, from Slop Drive, keep duplicates) and the library tools (sort deck, duplicates, backup, restore);
Import photos, the main button, is at its foot. On a phone the panel is a bottom sheet whose closed state shows Import
("Library" opens it). Test: `tests/gallery/panel.test.html`.

## Viewer

The picture is `SlopPreview` (`shared/preview/`, the component Slop Drive uses), made for each photo with `chrome: false`, so the gallery keeps its own header and footer. Zoom is the wheel (around the pointer), `+ − 0 1`, the toolbar with the percentage, drag, pinch and double-tap. The viewer adds: `← →` for previous and next, Space for the slideshow (3, 5 or 10 s), `I` for the info panel, `L` and `D` for like and dislike, `F` for favourite, Delete for remove (after a confirmation), and the counter. The footer holds Info, Like, Dislike, Favourite and Remove. `Z` (fit or 100%) is gone: `0` and `1` do the same. When the viewer moves to another photo or closes, the old preview leaves the page and its blob URL is revoked.

## Drive source

The **Library / Drive** switch above the grid shows every file in Slop Drive (the Trash excluded) instead of the photo library. It reads Slop Drive only through `SlopHub.list()` and `SlopHub.get()`, plus the Drive's thumbnail cache, and writes nothing to Drive.

- **Tiles:** the Drive's own thumbnail when one is cached, else a card with the file's kind and extension. The thumbnail is read through `shared/drive/thumb-read.js` (the one reader, also used by the shared Drive picker) from `slop-drive-thumbs` (read only: the database is never created here) as the tile scrolls into view. A record is used only while its modified time matches and its version is `VER` in thumb-read.js (3). That number mirrors `VER` in `drive/js/core/thumbs.js`, so change both together.
- **Kind chips** (multi-select: a file shows when its kind is in any chip that is on): Media (image, video, audio), Photos, Videos, Audio, Documents, Code and text, 3D, Archives, Other. The counts follow the name search and ignore the chips, so each chip still says what it would add.
- **Search** by name (case-insensitive). **Sort:** date added, newest first (default), or name.
- **Opening:** image or video opens in the Gallery viewer (SlopPreview for images, a native player for video; ← → step through the images and videos on screen). Audio plays in the audio strip under the grid. 3D opens in Slop 3D. Documents, code and the rest open in the app the Drive's rule picks: the registry's `accepts` (SlopHub's `appsAccepting`), a specific MIME pattern before a wildcard, tools never. So a `.js` file opens in Slop AI, which accepts `text/*`, as it does in Drive. A file no app takes gets a note.
- **Limits:** `SlopHub.list()` reads every file, blobs included, each time the source is opened. The grid draws every matching tile (no virtual list), with thumbnails loaded as they scroll into view.

**Kind table:** `shared/kinds/kinds.js` (`window.SlopKinds`). It is the one table for the kinds: `kindOf(name, type)` checks the extension first, then the MIME type, else Other. `CHIPS` lists the chips, and `countChips`, `chipMatch` and `label` serve the UI. Slop Drive does not use it yet (it has its own kind logic in `drive/js/ui/preview-kinds.js`).

## Make reel (Gallery to SlopCut)

Select two or more photos, then **Make reel**: the toolbar button (shown while something is selected), the Actions menu, the right-click menu on a selected photo, or "Make reel from selection" in the command palette. The dialog sets:

- **Template:** Random edit (default), Single photo, Split screen, Grid, 9:16 reel. The 9:16 reel also sets the aspect to 9:16.
- **Target length:** 5 to 600 seconds (under 5 s is refused, and the dialog stays open with the reason).
- **Pace:** slow, medium or fast. **Aspect:** 16:9, 9:16 or 1:1 (the sizes SlopCut knows).
- **Order:** oldest first (default), newest first, or selection order.
- **Cut out subjects first:** runs each photo through SlopIsolate's engine (`shared/cutout/cutout.js`, loaded on first use) with the Fast model, as it is.

The hand-off (`ui/reel.js` `run()`, `io/reel-drive.js`):

1. A Slop Drive folder named `Reel YYYY-MM-DD HH.MM`.
2. One Drive file per photo, with its original bytes and name, in play order.
3. With the cut-out option, each photo's PNG with alpha is stored as `<name> (cutout).png` in the same folder. A progress dialog shows the stage. **Cancel** (or Escape) removes every record and the folder the reel wrote. A photo that cannot be cut out is left out of the overlays and listed at the end.
4. The manifest, `<folder>.reel.json`, type `application/x-slop-reel+json`.
5. SlopCut opens in a new tab with `?drive=<manifest id>`. The tab is opened inside the click, so pop-up blockers allow it. If no tab can be opened, this tab navigates.

**Manifest (format `slop-reel`, version 1):**

```json
{
  "format": "slop-reel", "version": 1, "created": "2026-10-11T12:05:00.000Z", "from": "gallery",
  "template": "random | single | split | grid | reel",
  "length": 30, "pace": "slow | medium | fast", "aspect": "16:9 | 9:16 | 1:1",
  "order": "oldest | newest | selection",
  "files": ["<drive id of photo 1>", "<drive id of photo 2>"],
  "overlays": [{ "id": "<drive id of a cut-out PNG>", "of": "<drive id of its photo>" }]
}
```

`files` are in play order. `overlays` may be empty.

**SlopCut side** (`slopcut/js/io/reel.js`, reached from `io/session.js` when the launch record is a manifest):

- Asks before replacing an open project, then starts a new project.
- Imports the files one at a time, so the bin lists them in the manifest's order.
- Maps the template (`single` → single, `split` → split-h, `grid` → grid2, `reel` → reel, `random` → one slot) and calls `SE.random.plan` and `SE.random.build` with the manifest's length, pace and aspect. It uses the templates' `SE.templates.get`, `SE.layout.fit` and `SE.layout.ensureTrack`.
- Puts each cut-out on the track above the template's slots, over the beat after its photo's (the photo's own beat for the last one), in the slot the photo used. This placement rule is in `overlayClips()` and is a choice to revisit.
- Without `SE.random` (for example, the random edit removed), it appends the photos to the timeline in order.

**Limits:** photos only, because the gallery has no video. Cut-outs use the Fast model, so the mask is only as good as the model on that photo. The cut-outs are written to Drive one at a time, so the full-resolution PNGs are not all in memory at once.

- **Import.** Files (picker), a folder dropped on the window (recursive via `webkitGetAsEntry`), a folder via `showDirectoryPicker` where the browser has it (Chromium), and one file from Slop Drive (`SlopHub.pickFromDrive`). Originals are stored as-is. Thumbnails are JPEG with the long edge at most 320 px, and EXIF orientation is applied by hand.
- **Storage.** IndexedDB, database `slop-gallery`. Why not OPFS: photos are stored as Blobs, IndexedDB writes are transactional (a restore lands whole or not at all), indexes on SHA and date serve duplicate and timeline queries, and Slop Drive already uses it. OPFS would need a worker for fast sync access and would split the metadata across two places.
- **Metadata.** EXIF `DateTimeOriginal` (then `DateTimeDigitized`, then `DateTime`), orientation, Make and Model, read from the JPEG APP1 segment by hand. Falls back to `lastModified`. Width and height are the upright size. EXIF has no time zone, so it is read as local time.
- **Duplicates.** Import skips bytes the library already has, by SHA-256 (`crypto.subtle`). The "Keep exact duplicates" checkbox keeps them on purpose. The Duplicates dialog keeps one copy per group (oldest by default, or the one you pick) and removes the rest after confirmation.
- **Timeline.** Months, newest first, with a sticky month header. A virtual list renders only the visible rows (the test asserts fewer than 160 tiles in the DOM for 5,000 photos). Arrow keys move between tiles, Enter opens, Space selects.
- **Albums.** Create, rename, delete. Adding a photo links its id and never copies the bytes (tested).
- **Favourites, likes and tags.** Liked, disliked and free-text tags live on the photo record. Photos from Slop Drive also have them written to their Drive record under `meta.gallery`, so the tags travel with the Drive file.
- **Sort mode (swipe deck).** Up likes and moves on. Down dislikes and moves on. Left goes back with no tag. Right skips ahead with no tag. Enter (or any letter or number) opens a tag field under the photo: Enter adds the tag(s), comma-separated, and moves on; Escape cancels. The queue is the timeline's visible list when the deck opens (or the selection). The deck itself is shared/deck/deck.js (SlopDeck, also used by Slop Photo Sorter); `js/ui/sortmode.js` gives it the library.
- **Filters.** Name, year, month, camera, favourites, album, and tag (liked only, disliked only, untagged only).
- **Viewer.** Full screen, on the shared preview. See the Viewer section above.
- **Export.** One photo downloads as its original file. Several photos download as one store-only zip (`js/io/zip.js`, CRC-32 checked on read). The whole library backs up to one zip with a manifest, originals and thumbnails. Restore validates the manifest and every SHA-256 before writing, then writes in one transaction.
- **Right-click menus** on photos, albums, month headers and the empty grid (SlopCtx and SlopUI).
- **SlopCmd commands** for the main actions (`js/ui/commands.js`).
- **Layout.** Checked at 390 px: no horizontal page scroll. Under 700 px the side panel is a drawer from the left: `SlopSheet.attach({ side: 'start', toggles: [Filters] })` in `js/ui/sidebar.js` (`shared/ui/sheet.js`, see `shared/ui/HANDOFF.md`). Filters opens and closes it; the shared ×, Escape, a tap outside and a swipe left close it; a view picked in it closes it (`G.sidebar.closeDrawer()`). There is no `drawer-open` class or close button of Gallery's own any more. The Escape command (Clear selection) waits while the drawer is open. Test: `tests/gallery/phone-drawer.test.html`.

## Test hook

`?db=<name>` (or `window.SLOP_GALLERY_DB`) picks the database name. The tests use it so they never touch a real library.

## What is missing

- **Face and object recognition** are not built. They would need a local model (for example ONNX or WebGPU), which is a separate piece of work.
- **HEIC and RAW** files are refused, because Chromium cannot decode them here. They are reported as "could not be read" and not stored.
- **Videos** are not in the library. The Drive source shows and plays them.
- **Editing** (crop, rotate on disk, adjust) is not built. Viewer and deck are read-only apart from tags.
- **Similar, not identical, photos** are not grouped. Duplicates are exact bytes only.
- **Zip64** is not supported. The zip and backup writers refuse archives over 4 GB.
- **Drive tags** flow one way, into the Drive record, for photos that came from Drive. Changes made in Slop Drive's own UI are not read back.
- **Drive import** takes one file at a time.
- **Folder import** via `showDirectoryPicker` is Chromium only. Dropping a folder works wherever the browser exposes `webkitGetAsEntry`.
- **No screenshot** exists yet for the home page card (`assets/shots/gallery.jpg`). The catalog falls back to a generated tile.

## Next steps

1. Decode HEIC through a local WebAssembly decoder, if the licence allows it.
2. Add a local model for face and object tags, with the results written to the photo's `tags`.
3. Move thumbnail generation to a worker, so large imports do not block the page.
4. Add a "similar photos" view based on a perceptual hash, next to the exact-match view.
5. Read Drive tag edits back into the gallery.

## Files

- `index.html`, `css/gallery.css`, `css/viewer.css`, `css/drive.css`
- `shared/kinds/kinds.js`: the file-kind table (see Drive source)
- `js/io/`: `hash.js`, `exif.js`, `zip.js`, `source.js`, `backup.js`, `export.js`, `reel-cutout.js`, `reel-drive.js`
- `js/core/`: `db.js`, `thumb.js`, `library.js`, `import.js`, `query.js`, `urls.js`, `reel.js` (reel spec, validation, manifest), `drive-query.js` (Drive search, chips, sort, counts)
- `js/io/drive-source.js`: the Drive source, read only (`load`, `thumb`)
- `js/ui/drive-view.js`, `drive-bar.js`, `drive-open.js`, `drive-viewer.js`: the Drive grid and switch, its bar, the open rules and the Drive viewer
- `js/ui/`: `state.js`, `vlist.js`, `rows.js`, `timeline.js`, `viewer.js`, `sortmode.js`, `actions.js`, `albums.js`, `dupes.js`, `menus.js`, `commands.js`, `sidebar.js`, `reel.js` (Make reel dialog and run), `main.js`
- Tests: `tests/gallery/` (`gallery.test.html`, `app.test.html`, `reel.test.html`, `helpers.js`, `spec-io.js`, `spec-core.js`, `spec-app.js`, `spec-reel.js`, `viewer.test.html`, `spec-viewer.js`)

## People (face counts, opt-in, `shared/faces/`)
- **Off by default.** Turn it on in Profile (the Gallery section, "Find faces on this device"), or the first time you open
  the People view (the same dialog as Slop Drive). Nothing is uploaded and no one is identified.
- **People view** (`data-view="people"`): photos grouped as **One face**, **Two or more faces** and **No faces**. Empty groups
  are left out. Photos not checked yet are not shown; the bar says how many are checked.
- **Background scan** (`core/people.js`): when the setting is on, every photo without a result is checked, newest first, one
  at a time, with idle time between photos. A photo added later is checked too. The bar (`ui/people.js`) shows the
  progress, with **Stop** (and **Resume**). Turning the setting off stops the scan after the photo in hand and hides the groups.
- **Results:** `SlopFaces.analyse('gallery', photo id, photo SHA-256, original)`, kept in IndexedDB `slop-faces`. They are
  derived data and are not in the Gallery backup.
- **Viewer:** the face boxes are drawn over the photo (`G.people.overlay`) while the setting is on.
- **View state:** `people` is restored by `ui/view-state.js` (the view list).
- **No identity:** groups are counts of faces only. Nothing is named, matched or recognised.
- **Tests:** `tests/gallery/faces.test.html` (stubbed detector: the picture's width sets its faces), and the Node file
  `tests/node/faces-drive-gallery.test.mjs`. `node tests/run.mjs gallery` runs them with the rest of the suite, all green at the time of this change.

## Camera RAW (uses `shared/raw/`)
- `io/source.js` keeps RAW files by extension (a RAW often has no MIME type); `core/thumb.js` makes the thumbnail from the embedded preview, upright (a half-size develop, after the engine notice, when there is none); `core/import.js` reads the date and camera with `SlopRaw.meta` and stores orientation 1 (the thumbnail is upright). The original bytes are stored unchanged.
- `core/urls.js` hands the viewer the upright preview as a JPEG for a RAW photo. Test: `tests/gallery/raw.test.html`.

## Assistant commands (`js/ui/ai-commands.js`)
Loaded on demand by `SlopCmd.prepare()` (`ui/commands.js`); `gallery.ai.*`, hidden. `new_album` (name, photos), `add_photos`
(Slop Drive names or ids through `shared/commands/sources.js`, then `SlopIntake.take`, the one way in; optional album, made
when new), `set_tags` (tags, add_tags, remove_tags, liked, favourite), `add_to_album`, `reorder_album` (`library.reorderAlbum`),
`remove_from_album`, `remove_photos` and `delete_album` (destructive; `actions.removeIds(ids, { ask: false })`),
`export_photos` (an album or photos through `export.packOf`: one photo as itself, several as a zip, to Slop Drive and/or a
download). Photos are named by id or file name. The checkpoint removes what the assistant added and puts tags back. There
are no captions in the library, so there is no caption command. Test: `tests/gallery/ai-commands.test.html`.
