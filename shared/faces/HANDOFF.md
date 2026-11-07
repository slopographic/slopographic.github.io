# shared/faces: on-device face detection, faces and people (opt-in)

Face detection for Slop Drive and Slop Gallery. It finds the faces in a picture, shows how many there are, and groups the
faces of the same person into people, which a person can name, merge, split and correct. **Everything runs on this
device. Nothing is uploaded.** It is **off by default**. Groups are faces that look alike; the app never knows who anyone
is, and names are only what the person types.

## The models

- **YuNet** face detector (OpenCV Zoo), `face_detection_yunet_2023mar.onnx`, 232 589 bytes, MIT (`vendor/face/LICENSE`).
  Gives the face box, a score and five landmarks (eyes, nose, mouth corners).
- **SFace** face recogniser (OpenCV Zoo), `face_recognition_sface_2021dec.onnx`, 38 696 353 bytes, Apache-2.0
  (`vendor/face/LICENSE-SFACE`). Gives one 128-value embedding per face, from the face aligned on its landmarks.
  sha256 `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`, from the Hugging Face repository
  `opencv/face_recognition_sface` at revision `3d7082438a6e4551e840c9b2bb60b71e8da4b524`.
  **The file is not in the repository yet.** Until it is placed at `vendor/face/face_recognition_sface_2021dec.onnx`,
  faces are still detected and counted, but they get no embedding and so are not grouped (`rec: 0`, see below).
- **Runtime:** ONNX Runtime Web from `vendor/onnxruntime-web/` (WebAssembly, one thread, no proxy). `recognize.js`
  (`SlopFaces.runtime()`) and `index.js` share it.
- **Checks:** a model is used only after its sha256 matches (`MODEL.sha256` in `index.js`, `RECOG.sha256` in
  `recognize.js`).

## The opt-in

- **The setting:** `faces.detect` in `SlopProfile` (localStorage `slop-profile`, see `shared/profile/HANDOFF.md`).
  `SlopFaces.enabled()` reads it each time. While it is off, `detect()` returns `[]` and loads nothing, `analyse()`
  returns `null` and stores nothing, and the groups and badges do not show.
- **Turn on:** Profile (the "Find faces on this device" switch in the Drive and Gallery sections, one stored value), or
  the first-use dialog (`consent.js`) from Find faces or from Gallery's Faces and people.
- **The threshold:** `faces.threshold` in `SlopProfile`, shown in Settings as "Same person threshold" (a cosine distance,
  default 0.4, kept between 0.2 and 0.8). It sets how alike two faces must be to be grouped (lower is stricter). A new
  value applies to new faces at once; "Regroup" applies it to all faces (the person's own edits stay).
- **Turning it off** stops everything: detection, the Gallery scan, the badges and boxes, and the groups.

## Storage (IndexedDB `slop-faces`, version 2)

- **`results`** (one row per picture, key `scope:id`, `scope` = `drive` or `gallery`): `v: 2`, `stamp` (the Drive file's
  modified time, or the photo's SHA-256), `model`, `rec` (1 when every face has an embedding, 0 when the recogniser could
  not run), `w`, `h` and `faces: [{ x, y, w, h, score, kps, emb }]` in the picture's pixels. A row counts only for the
  stamp, the model and `v: 2` it was made for.
- **`people`** (key = scope): `{ state: { groups: [{ id, name }], assign: { ref: groupId }, out: { ref: true }, manual:
  { ref: true }, seq }, v: 1, time }`. A face's ref is `scope:id#index`.
- **Migration 1 to 2** (in `cache.js`, `onupgradeneeded`): the `results` rows without `v: 2` (no embeddings) are deleted,
  so those pictures are checked again once; the `people` store is created empty. Covered by
  `tests/gallery/faces-migrate.test.html`.
- Derived data: it can be deleted at any time. It is not in the Gallery backup or the Drive file record (the shared backup
  includes the whole origin, so it does include `slop-faces`).

## Files

| File | What |
|---|---|
| `decode.js` | Pure maths: `decodeYunet` (boxes and landmarks in source pixels), `filterBoxes`, `iou`, `scaleFor`. |
| `recognize.js` | SFace: `recognizer.embed` (landmark alignment, 112 px, unit-length 128 values), `embedFaces`, `recogniserReady`, `cosineDistance`, `runtime()`. |
| `cache.js` | IndexedDB `slop-faces`: `results` (`get`, `put`, `all`, `remove`, `clear`) and `people` (`get`, `put`). Falls back to memory. |
| `index.js` | `window.SlopFaces`: the opt-in, the detector's loader, `detect`, `analyse` (detect, embed, store), `status`, `onChange`. |
| `groups.js` | Pure grouping: `empty`, `cluster`, `regroup`, `merge`, `move`, `split`, `notThis`, `rename`, `prune`, `list`, `history` (undo). No DOM, no store. |
| `people.js` | `peopleFor(scope, adapter)`: the groups of one app, loaded from the store, the faces of the pictures as they are now (the stamp matches), saved after each edit, undo, `threshold()`. |
| `view.js` | The Show faces mode (`off` / `count` / `boxes`), the per-photo choice, and `attachPhoto(host, opts)`: the badge and the boxes for one picture. |
| `overlay.js` | `drawBoxes(previewEl, faces)`: boxes in the picture's pixels inside a SlopPreview. |
| `crops.js` | Face thumbnails cut from the photo (one decode per photo, object URLs kept per page). |
| `panel.js` | The Faces and people dialog (People and All faces tabs, the Show faces switch, Merge, Move, Split, Not this person, Undo, Regroup). |
| `faces.css` | The badge and the dialog. |
| `consent.js`, `copy.js` | The first-use dialog and its wording. |

Load order (classic scripts): `profile.js`, `copy.js`, `app-options.js`, `decode.js`, `cache.js`, `index.js`, `consent.js`,
`overlay.js`, `recognize.js`, `view.js`, `groups.js`, `people.js`, `crops.js`, `panel.js`. Drive and Gallery load them in
that order in their `index.html`, and `faces.css` is linked there too.

## The API

```js
SlopFaces.enabled() / setEnabled(on) / status()
await SlopFaces.detect(source)                      // [{ x, y, w, h, score }] (no embeddings), [] when off or failed
await SlopFaces.analyse('drive', id, stamp, blob)   // { w, h, faces: [{ x, y, w, h, score, kps, emb }], rec, cached } or null
SlopFaces.setEmbedder(fn) / setBackend({ detect }) // tests only: a fixed embedding, a stub detector (null restores)
SlopFaces.view.mode() / setMode('off' | 'count' | 'boxes') / shown(scope, id) / setShown(scope, id, on) / onChange(fn)
SlopFaces.view.attachPhoto(host, { scope, id, faces, badgeHost })   // { refresh(faces?), destroy() }
const P = SlopFaces.peopleFor('gallery', adapter)  // adapter: { stampOf(id), blobOf(id), nameOf(id), openPhoto(id) }
await P.load(); P.list(); P.faces(); P.merge(keep, drop, name); P.move(refs, to); P.split(refs, name); P.notThis(refs);
P.rename(id, name); P.regroup(); P.undo(); P.canUndo(); P.subscribe(fn)
SlopFaces.panel.open(adapter) / close() / isOpen()
```

## The groups

- **Clustering** (`groups.cluster`): faces are taken in ref order. A face with no group joins the nearest group whose
  centroid is within the threshold, otherwise it starts a group; a later face can join a group started in the same pass.
  The same faces and threshold always give the same groups.
- **Merge:** one name, one group; both groups' faces are marked manual. **Move:** the selected faces go to another group.
  **Split:** the selected faces go to a new group. **Not this person:** the faces leave their group and are not grouped
  again by themselves. Every edit is undoable (up to 50 edits in this session; the undo history is not saved).
- **Manual** faces (moved, split, merged, not-this-person) keep their place when the groups are rebuilt by Regroup.
- A group is not a person's identity. Two groups of one person are normal (merge them); two people in one group are
  fixed by splitting.

## Show faces

- **Off:** nothing on the photos (no badge, no boxes). The details panel shows the count as text.
- **Count only** (default): a badge "3 faces" on each photo. A click draws that photo's boxes and is remembered for that
  photo (`localStorage` `slop-faces-photos`, `{ v: 1, data: { 'scope:id': true|false } }`).
- **Boxes on photos:** the boxes on every photo; a photo's badge hides them for that photo (its own choice wins).
- The mode is `localStorage` `slop-faces-view`, `{ v: 1, data: { mode } }`. Any other version or a broken value falls back
  to the default.
- Gallery: the viewer's badge (`gallery/js/ui/people-faces.js`), and the People bar's switch. Drive: the Quick look and the
  details panel badge; the switch is in the Faces and people dialog (Drive menu "Faces and people…" and the details panel).

## Tests

- `tests/node/faces-drive-gallery.test.mjs`: the box maths, the opt-in gate.
- `tests/node/faces-groups.test.mjs`: clustering with fixed vectors (order independence, thresholds, no embedding),
  merge, move, split, not-this-person, rename, prune, regroup and undo; YuNet landmark decoding; the alignment transform;
  the threshold clamp; the view envelope (versioned, per photo, the mode).
- `tests/gallery/faces-people.test.html`: one photo's badge draws that photo's boxes only and the choice is kept per photo;
  the modes; the All faces tab; a merge keeps every face once, names the group, and undo takes it back. Stubbed detector and
  stubbed embedder.
- `tests/gallery/faces-migrate.test.html`: a version 1 face database is upgraded; old rows go, the people store works.
- `tests/gallery/faces.test.html`, `tests/drive/faces.test.html`, `tests/drive/faces-optin.test.html`: the earlier stubbed
  tests (the badge is shown first; the boxes come on a click). Drive also opens Faces and people.

## Limits and what to know

- **The recogniser is not verified on real photos here.** Its preprocessing follows OpenCV's FaceRecognizerSF (landmark
  alignment onto the 112 px template, RGB, no mean or scale), and the tests use fixed vectors. Check the grouping on a
  labelled set of your own pictures before relying on it, and tune the threshold in Settings.
- Detection and the embedding run on the page's main thread (about 150 to 250 ms per picture for the detector in
  WebAssembly, plus the embedding per face). The Gallery scan yields between pictures and now picks up photos imported
  while it runs. A Worker would be the next step.
- The face models are not in the service worker's precache list (`tools/pwa-precache.mjs` builds that list from the
  pages). They are fetched from the site on first use.
- Only raster pictures the browser can decode are checked. SVG and most HEIC files are skipped.
- Re-detecting a changed picture can change its faces' indexes. A person's manual edits on that picture may then point at
  a different face; the stale ones are dropped on the next refresh.

## Removing it

1. Turn the setting off (Profile). Nothing loads while it is off.
2. Delete `vendor/face/`, and `shared/faces/`, and remove the `faces` entries from `shared/profile/app-options.js` and
   `SLOP_APP_SHARED`.
3. Remove the face scripts and `faces.css` from `drive/index.html` and `gallery/index.html`, `drive/js/ui/faces.js`, the
   references in `drive/js/ui/info.js`, `menus.js` and `quicklook.js`, `gallery/js/ui/people-faces.js` and the People bar's
   controls, and the face code in `gallery/js/core/people.js` and `gallery/js/ui/people.js`.
4. Delete the IndexedDB database `slop-faces` (or clear this site's data).
