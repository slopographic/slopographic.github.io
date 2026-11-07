# Slop 3D: handoff

A browser 3D editor for simple models and scenes. Nothing is uploaded: files open from disk or Slop Drive, save to
Slop Drive, and download. Status in `shared/apps.js` is `building`, group `creative`.

## Renderer decision

- **three.js r170, vendored** in `vendor/three/three.module.min.js`, loaded with a dynamic `import()` relative to the page.
  No CDN. Licence: MIT (`vendor/three/LICENSE`, © 2010–2024 three.js authors). The page never fetches it from the network.
- Camera and move gizmo are our own (`js/render/camera.js`, `js/render/gizmo.js`).
- **Model files** go through the shared 3D I/O module (`shared/3d-io/`, the three.js 0.170.0 loaders and exporters in
  `vendor/three/addons/`), the same one File convert uses. `js/app/modelio.js` turns a loaded model into an import tree
  and the scene into three.js objects. Opens OBJ (+MTL), STL, PLY, glTF (separate .bin and pictures picked together),
  GLB, 3MF, DAE and FBX; exports OBJ (+MTL and PNG textures, as a zip), STL, PLY, GLB, glTF and USDZ. Animations are
  not kept (models open in their current pose); point clouds, lines, cameras and lights in a file are left out.
- Shading is `MeshStandardMaterial` (smooth normals, roughness, metallic, opacity, optional embedded image texture).
  Lights are real three.js lights built from the scene's light nodes.

## Files

- `index.html`, `css/app.css`, `css/panels.css`: the page (topbar, outliner, viewport, inspector, status line).
  Top bar: one row from 1260 px (1260 to 1536 px drops the word "slopographic" and packs the buttons; the shared buttons
  are icons there), the scene actions on a row of their own under 1260 px. In edit mode (Vertex, Edge, Face shown) the
  actions still wrap below 1440 px.
- `js/core/` (pure, no DOM, loads in Node): `xform.js` (4×4 maths, Euler XYZ in degrees), `snap.js`, `geometry.js`
  (primitives as parameters), `blob.js` (icosphere plus value noise, seeded), `model.js` (scene and tree), `ops.js`
  (duplicate, group, ungroup, reparent, move, set field, bounds), `history.js` (snapshot undo with merge keys),
  `format.js` (.s3d serialise, parse and validate), and the mesh editing set: `mesh.js` (welded
  polygon working form, bake of primitives, edge map, compact), `meshrender.js` (flat-where-it-bends render arrays),
  `meshsel.js` (element selection, mode conversion, edge loops, screen picks), `meshops.js` (extrude, delete,
  subdivide, merge, flip, fill, hide, reveal), `meshxf.js` (world matrices applied to selected vertices), `config.js`
  (scene3d config: validate, build, export).
- `js/render/` (three.js): `stage.js` (renderer, loop, picking, PNG capture), `camera.js`, `objects.js` (scene to
  three objects, synced by id), `gizmo.js`, `editview.js` (edit overlay: vertices, edges, selected faces).
- `js/app/` (UI): `state.js`, `actions.js` (every edit goes through `commit`), `viewport.js`, `outliner.js`,
  `inspector.js`, `menus.js` (right-click menus), `commands.js` (SlopCmd ids `3d.*`), `files.js`, `main.js`, and the
  edit mode: `edit.js` (edited mesh, element mode, selection, commit path), `editmodal.js` (G, R, S, E transform
  modal), `editpick.js` (clicks and box select), `editcommands.js` (edit keys and the Mesh menu), `configio.js` (config
  import and export).
- Tests: `tests/node/3d-*.test.mjs` (pure logic, via `tests/node/3d-env.mjs`: scene, geometry, mesh, config), and
  `tests/3d/app.test.html` with `3d.spec.js` (browser, same-origin iframe of the real app; WebGL tests report skipped
  when the browser has no WebGL).

## Mesh edit mode

Tab turns edit mode on for the selected mesh (a primitive is baked into an editable mesh first, one undo step). The
status line shows the mode and the count. Object-mode keys that clash (1 to 3 views, F, G, H, W, Delete, Mod+D) work
only outside edit mode.

| Keys | What |
| --- | --- |
| Tab | Edit mode on or off (Edit button) |
| 1 / 2 / 3 | Vertex / Edge / Face mode (toolbar buttons too) |
| Click | Select the nearest vertex, edge or face. Shift adds, Ctrl toggles. Alt-click on an edge selects its loop. |
| Drag on empty space | Box select (Shift adds, Ctrl removes). Alt-drag orbits. |
| A / I / Alt+A or Escape | Select all, invert, clear |
| G / R / S | Move, rotate, scale the selected elements (world space, pivot = selection centre) |
| E | Extrude selected faces, then move along their normal |
| X or Delete | Delete (vertices or edges take the faces that use them) |
| W | Subdivide selected faces once (quads, neighbours kept watertight) |
| M | Merge selected vertices at their centre (Merge by distance in the menu) |
| Shift+F | Flip normals of selected faces |
| F | Fill a face from one closed loop of selected edges or vertices |
| H / Alt+H | Hide selection / show all hidden faces (and select them) |

- Transform modal: the mouse moves it. Type numbers to set it (after X, Y or Z to pick an axis; for rotate, degrees;
  for scale, a factor). Enter or left-click confirms, Escape or right-click cancels. The gizmo arrows also move the
  selection in edit mode, snapped to the Snap step. One gesture is one undo step.
- Mesh menu (toolbar Mesh button, or right-click in edit mode) lists every tool.
- Storage: the mesh stays in the .s3d geom. A `kind: 'mesh'` geom keeps `positions` (welded), `indices` (triangles of the
  visible faces), and optional `faces` (polygon vertex lists, the source of truth) and `hidden` (hidden face indices).
  Files without `faces` read as triangles, as before. Selection is session state only.
- Shading: an edited mesh is drawn flat where neighbouring faces bend more than 35 degrees and smooth elsewhere. The
  imported normals of an OBJ or glTF mesh are dropped on the first edit.
- Limits: no bevel, bridge, knife, loop cut, inset, or edge slide. No vertex colour or sculpt brushes yet (the mesh ops
  in `core/` are pure functions over vertex arrays, so brushes can call them per stroke). Extrude works on faces only
  (vertex and edge selections are converted to the faces they span). Delete refuses to remove every face. Fill needs one
  closed loop. Undo restores the whole mesh; the element selection is clamped to what still exists after undo.

## Config files (scene3d)

File > Import config… and Export config… (the palette has both too). Data is `{ "objects": [...], "lights": [...] }`
(a bare list is read as objects):

- object: `type` cube, sphere, cylinder, cone, torus, plane or group; `name`; `position`, `rotation` (degrees), `scale`
  as three numbers; `material` { `color` #rrggbb, `roughness`, `metallic`, `opacity` 0 to 1 }; `params` (shape
  parameters, as in `core/geometry.js`); `children` (groups only).
- light: `type` directional or ambient; `name`; `color`; `intensity` 0 to 100; `position` (directional).

Import validates everything first and refuses the whole file with the path of each problem (`objects[2].position`).
Valid data is added as ordinary scene nodes in one undo step. Export writes the visible primitives and lights with
world transforms and groups flattened; meshes that are not primitives are counted and left out. The .s3d file is
unchanged by this.

Registration: `shared/config/` did not exist when this was written, so `configio.js` has `registerStub()`, which does
nothing until `SlopConfig` exists. Once it does, register kind `scene3d` for app `3d` there with the same validate,
build and export functions (`S.config` in `core/config.js`).

## The .s3d format (version 1)

The file is the scene JSON itself, UTF-8, with `"format": "slop-3d"` and `"version": 1`.

```
{ format, version, name, seq, background: "#rrggbb", roots: [id…],
  nodes: { id: { id, type: "mesh"|"group"|"light", name, visible, parent: id|null,
                 transform: { p: [x,y,z], r: [x,y,z] /* degrees, XYZ */, s: [x,y,z] },
                 geom:     { kind: "cube"|"plane"|"sphere"|"cylinder"|"cone"|"torus"|"blob", …params }   // mesh
                           | { kind: "mesh", positions: [], normals?: [], indices: [], faces?: [[…]], hidden?: [face…] }   // mesh (imported or edited)
                 material: { color, roughness, metallic, opacity, map?: "data:image/…" }                 // mesh
                 children: [id…]                                                                         // group
                 light:    { kind: "directional"|"ambient", color, intensity }                           // light
  } } }
```

- Parameters: sizes in scene units; `segments` 3–256, `rings` 2–256, `sides` 3–128, `detail` 0–5, `seed` integer.
- Reading: `format.parse(text)` returns `{ ok: true, scene }` or `{ ok: false, errors: [...] }`. It never throws.
  A newer `version` is refused with a clear message, so nothing is half-read.
- Writing: `format.serialize(scene)`. Round trips are exact (tested).

## What works

- Viewport: orbit (drag), pan (Shift-drag or middle drag), zoom (wheel), frame selection (F, double-click), frame all
  (Home), numbered views 1 front, 2 top, 3 side, 4 perspective, wireframe (W), grid (G), axes.
- Primitives: cube, sphere, cylinder, cone, torus, plane, blob, created at the origin, plus groups and lights (sun and
  ambient). Shape parameters are editable in the inspector.
- Mesh edit: Tab, then vertex, edge and face selection with G, R, S, E, X, W, M, F, H and the Mesh menu (see Mesh edit mode).
- Config: File > Import config… and Export config… (scene3d data, see Config files).
- Edit: duplicate (Ctrl+D), delete, group and ungroup (Ctrl+G / Ctrl+Shift+G), undo and redo (Ctrl+Z, Ctrl+Shift+Z),
  select all, hide or show (H), rename (F2 or double-click in the outliner).
- Transform: move by the gizmo arrows (snapped to the Snap step), numeric position, rotation (degrees) and scale
  fields, arrow keys to nudge on X and Z, Shift+Up/Down for Y (the step is the Snap step, or 0.1 when Snap is off).
- Materials: colour picker, roughness, metallic, opacity. Lights are edited the same way as objects.
- Outliner: a tree with eye toggles, click, Shift or Ctrl selection (synced with the viewport), drag onto a group to
  put inside, onto an edge to reorder.
- Right-click on an object: duplicate, delete, group, ungroup, frame, hide, rename, add. On empty space: add, select all,
  views, toggles, undo and redo.
- Import: OBJ (one mesh per object), glTF 2.0 .gltf (embedded data URIs) and .glb (triangle primitives, node hierarchy,
  base colour), and images (a standing textured plane, image stored inside the file, 8 MB limit). From disk or Slop Drive.
- Export: .s3d (Save to Slop Drive, or download), OBJ, PNG at 1× or 2× of the viewport.
- Slop Drive: `?drive=<id>` opens a record; Save updates the linked record or asks for a folder.
- SlopCmd palette and shortcuts, SlopCtx right-click menus, SlopUI dialogs and toasts, SlopGuard unsaved-work warning.

## What is missing

- Rotate and scale gizmos for objects (use the numeric fields). Element rotate and scale have no gizmo yet (R and S).
- GLB export (no exporter in the vendored three.js).
- Boolean operations, sculpting, animation, UV editing, materials beyond the four values plus an image.
- Mesh tools beyond the list above (bevel, bridge, knife, inset, loop cut, slide), and element edits on imported meshes
  beyond what the list covers.
- Multi-object inspector editing (the inspector shows the last selected object).
- Snapping for typed values (only gizmo drags and nudges snap). Camera moves are not in the undo history.
- Clicking a child in the viewport selects the child; select the group in the outliner to move the whole group.

## Notes

- Opening or importing a model from disk or Drive creates a new scene that keeps the model and is marked unsaved.
- Memory: every edit clones the scene as JSON (simple, exact undo). Very large imported meshes (millions of triangles)
  will be slow to edit.

## Image to 3D (added with img3d/)

- The toolbar has an **Image to 3D…** link (`#btnImg3d`, `../img3d/`, new tab). Slop Image to 3D sends a mesh back
  with "Open in Slop 3D" (a `.s3d` in Slop Drive, opened with `?drive=`).
- Meshes may carry optional `geom.uvs` (two numbers per vertex, checked by `geometry.js`). `render/objects.js` sets the
  `uv` attribute, so `material.map` shows on them. Meshes without `uvs` are unchanged. Mesh edit drops the UVs.

## Phone layout (SlopSheet)
Under 900 px the viewport fills the screen and the panels are SlopSheets (`shared/ui/sheet.js`, see
`shared/ui/HANDOFF.md`), attached in `js/app/layout.js`: the Scene outliner is a drawer from the left, Properties a
bottom sheet. The Scene and Properties buttons at the viewport's foot (`.vp-panels`, phone only) open and close them; the
shared ×, Escape, a tap outside and a swipe close them. Before, the panels were stacked under the viewport in a scrolling
page. `window.Slop3DSheets` (`{ scene, props }`) is for the tests: `tests/3d/phone.test.html`.

## Assistant commands (`js/app/ai-io.js`, `js/app/ai-commands.js`)
Loaded on demand by `SlopCmd.prepare()` (`main.js aiPrepare`); all `3d.ai.*`, hidden, each one `actions.commit` (one undo step).
`new_scene`, `build_scene` (objects `[{ kind, name, position, rotation, scale, color, roughness, metallic, opacity, params }]`) and
`delete_object` are destructive; `add_object`, `add_model` (Slop Drive or this site, through `files.importBlob`), `set_transform`,
`set_material`, `set_light`, `set_shape`, `set_background`, `rename_object`, `set_view` (the camera, not in the file), `undo`,
`export_scene` (glb, gltf, obj, stl, ply, usdz, s3d, png, to Slop Drive and/or a download, with the File menu's writers).
`state()` lists the objects; the checkpoint puts the scene back as one more step. Test: `tests/3d/ai-commands.test.html`.
