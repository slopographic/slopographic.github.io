# Slop Image to 3D: handoff

Turns one picture into a 3D height-field mesh (textured with the picture), a point cloud, or a splat-like point
render, in a three.js viewport with orbit controls. Runs on the device; nothing is uploaded. App id `img3d`, folder
`img3d/`, name "Slop Image to 3D". Status suggested: `building`, group `creative`.

Not done here (by instruction): no commit or push, no edit to `service-worker.js` or `shared/apps.js`. The registry
text and the precache list are at the end of this file.

## Pipeline

1. **Picture** (`js/app/image.js`): open from disk, drop on the viewport, or Slop Drive (`SlopHub.pickFromDrive`). Capped at
   1024 px on the long side.
2. **Depth** (`js/model/depth.js`, `js/core/prepare.js`):
   - With the depth model installed (Get more): Depth Anything V2 Small through ONNX Runtime Web, WebAssembly, one
     thread. Run once per picture. The input is 518 px high, the width keeps the aspect ratio (multiples of 14).
   - Without it: **brightness fallback** (Rec. 709 luminance, brighter reads as nearer). The UI says it is not real depth.
   - Depth is percentile-stretched to 0..1 (1st to 99th percentile), optionally inverted.
3. **Subject** (optional, "Subject only"): `SlopCutout.removeBackground(…, { model: 'quality' })` from `shared/cutout/`,
   the existing SlopIsolate matting model (IS-Net general use, Apache-2.0, `vendor/models/isnet-general-w8.onnx`).
   The mask is cut to the grid; the mesh drops background triangles and unused vertices; the point cloud and splats drop
   background points.
4. **Output** (`js/core/hfmesh.js`):
   - Height-field mesh: a grid of `gw × gh` vertices, `(gw-1)(gh-1)·2` triangles. Position x = (u − ½)·aspect,
     y = ½ − v, z = depth × **scale** (default 0.30, plane units). **Smoothing** is a box blur on the depth (radius 0 to 8).
     UVs map the picture on the grid.
   - Point cloud: one point per vertex, coloured from the picture.
   - Splats: one point per vertex with a Gaussian footprint (`js/render/view.js`, a small point shader). Radius follows the
     local spacing and shrinks on depth edges. It is not true 3D Gaussian splatting: no fitting, no depth sorting.
5. **Resolution**: 64, 128, 192 or 256 on the long side (`prepare`, `gridFor`).

## Depth model

| Field | Value |
|---|---|
| Model | Depth Anything V2 Small (monocular relative depth, Yang et al., 2024, arXiv:2406.09414) |
| Licence | **Apache-2.0** (the official repo's LICENSE, copy in `vendor/models/depth/LICENSE`, sha256 `c71d239d…0ab4`) |
| Official weights | https://huggingface.co/depth-anything/Depth-Anything-V2-Small (tagged `license: apache-2.0`) |
| Official code | https://github.com/DepthAnything/Depth-Anything-V2 (Apache-2.0) |
| File used | `vendor/models/depth/depth-anything-v2-small.onnx`, the `onnx/model_quantized.onnx` of https://huggingface.co/onnx-community/depth-anything-v2-small (ONNX conversion for Transformers.js, tagged Apache-2.0) |
| Conversion | None by us. Weights int8-quantised by onnx-community (27 MB; fp32 is 99 MB). Not re-derived here. |
| Size | 27 258 801 bytes |
| SHA-256 | `fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d` (checked on download and on every load) |
| I/O | input `pixel_values` [1, 3, H, W] (ImageNet mean and std, H and W multiples of 14); output `predicted_depth` [1, H, W], higher = nearer |
| Checked | Runs in ONNX Runtime (Python 1.29) and ONNX Runtime Web (WebAssembly) in headless Chromium on a 1024×640 picture |

The model is **opt-in**. It is listed in `shared/library/packs.json` as pack `depth-anything-v2-small` (kind `model`,
licence shown before download, size 27 MB, hosts `raw.githubusercontent.com` only). The first-use notice names the
download and its size; Continue is the consent, and the first picture then downloads the pack just in time
(`js/model/jit.js` → `SlopLibraryInstall.install(pack)`, the shared installer: byte length and SHA-256 checked, stored
in IndexedDB `slop-library`). Get more… can add or remove it too. Once the model has been here (localStorage
`slop-img3d:depth-had`), its absence means it was removed in Get more, and it is not downloaded again on its own. A
failed download (offline) is tried once per visit, falls back to brightness and says why. Tests: `tests/img3d/jit.test.html`. The file is served from the repo's
`vendor/models/depth/` after the change is pushed to `main`, so the pack's download works only once it is pushed.
Nothing is fetched at load or in a timer.

Rejected: Depth Anything V2 Base and Large (`license:cc-by-nc-4.0` on their Hugging Face pages, non-commercial). MiDaS
small (MIT) was not evaluated; V2 Small is Apache-2.0 and its ONNX file is on a reachable host.

## Files

- `index.html`, `css/img3d.css` (colours from the shared theme's `--sl-*` tokens, `--i3-*` names).
- `js/core/` (pure, Node-loadable): `hfmesh.js` (blur, resample, percentile stretch, normals, height field, point cloud,
  splats), `prepare.js` (picture to grids, luminance fallback), `s3d.js` (the Slop 3D scene). OBJ and GLB are written by the shared 3D I/O module (`shared/3d-io/write.js`) from `js/app/export.js`.
- `js/model/depth.js`: the depth model (pack, SHA-256 check, ONNX Runtime Web session).
- `js/model/jit.js`: the just-in-time download after the notice (`decide`, `ensure`, `noteInstalled`).
- `js/render/orbit.js` (orbit, pan, zoom, frame; vendor/three has no OrbitControls), `js/render/view.js` (three.js r170
  from `vendor/three`, mesh, points, splats).
- `js/app/image.js` (decode), `js/app/export.js` (OBJ, GLB, Open in Slop 3D), `js/app/main.js` (page controller).
- Shared code used: `shared/cutout/cutout.js` (background remover), `shared/library/*` (Get more, loaded on demand),
  `shared/hub.js` (SlopHub: Drive, `sendTo`, `consumeLaunch`), `shared/slopui.js`, `shared/theme/theme.js`.
- Slop 3D core, loaded by the page for export: `3d/js/core/{xform,snap,geometry,blob,model,ops,obj}.js`. OBJ comes from
  Slop 3D's own writer (`Slop3D.obj.write`), so it matches Slop 3D's OBJ output.

## Export and Open in Slop 3D

- **OBJ**: Slop 3D's writer, the height-field mesh (no texture; OBJ has no MTL here).
- **GLB**: our writer. Mesh: positions, normals, UVs, base colour map (JPEG, 0.9). Points and splats: POINTS, COLOR_0.
  Checked by Slop 3D's own GLB importer in the Node test.
- **Open in Slop 3D**: a `.s3d` scene (`s3d.js`) goes into Slop Drive through `SlopHub.sendTo('3d', …)`, and Slop 3D opens
  it with `?drive=`. The scene holds the mesh with UVs and the JPEG texture (1024 px), plus an ambient and a sun light
  (Slop 3D lights a scene only from its light nodes).
- To make the texture show in Slop 3D, `3d/` now accepts optional `geom.uvs` on imported meshes (`geometry.js` build and
  check, `render/objects.js` `toGeometry`). Meshes without `uvs` are unchanged. Edits in Slop 3D's mesh edit mode drop
  the UVs (the edited form has no UVs), so the texture is lost once the mesh is edited there.

## Tests

- `tests/node/img3d-mesh.test.mjs` (`node tests/run.mjs img3d`): vertex count (w × h), index count ((w−1)(h−1)·6),
  scale (nearest vertex at z = scale), plane aspect, smoothing keeps counts, subject mask drops background triangles and
  unused vertices, a 64×64 picture gives 4096 vertices and 23 814 indices, the fallback is labelled, the `.s3d` passes
  Slop 3D's validator, OBJ through Slop 3D's writer, GLB container and Slop 3D's importer.
- `tests/img3d/app.test.html` + `img3d.spec.js` (browser): a generated 64×64 picture, encoded to PNG and decoded, becomes
  the expected mesh; the depth scale; GLB and `.s3d` output; the mesh, points and splats render in WebGL (skipped
  without WebGL).
- Manual check done during the build (headless Chromium, not a committed test): open, depth model from the library
  store, subject only, Open in Slop 3D. The scene opened in Slop 3D with its texture.

## Registry and service worker (not edited here)

`shared/apps.js`, add to `window.SLOP_APPS` (after `3d`):

```js
A('img3d', 'app', 'Slop Image to 3D', 'img3d/', 'Turn a picture into a 3D model. Runs on your device.', { group: 'creative',
  accepts: ['image/*'], creates: [],
  features: ['Height-field mesh from depth', 'Point cloud and splat view', 'Optional subject-only cut-out', 'OBJ and GLB export, open in Slop 3D'],
  icon: 'spark', status: 'building' }),
```

`service-worker.js`: add to the precache list (the app's own files; the 3d files already listed except the ones above):
`/img3d/index.html`, `/img3d/css/img3d.css`, `/img3d/js/core/hfmesh.js`, `/img3d/js/core/prepare.js`,
`/img3d/js/core/s3d.js`, `/img3d/js/model/depth.js`, `/img3d/js/render/orbit.js`,
`/img3d/js/render/view.js`, `/img3d/js/app/image.js`, `/img3d/js/app/export.js`, `/img3d/js/app/main.js`,
`/3d/js/core/xform.js`, `/3d/js/core/snap.js`, `/3d/js/core/geometry.js`, `/3d/js/core/blob.js`, `/3d/js/core/model.js`,
`/3d/js/core/ops.js` (and `shared/3d-io/`, loaded on first export). Do not precache `vendor/models/depth/` (27 MB, opt-in). Bump the cache version.

Also needs committing: `vendor/models/depth/depth-anything-v2-small.onnx` (27 MB) and `vendor/models/depth/LICENSE`.

## Limits

- Depth is relative (no metric scale), at most 518 px tall; fine detail and thin objects are soft.
- The mesh is a height field: one surface seen from the front. No back side, no occlusion fill.
- Brightness fallback is not depth. It is only a stand-in until the model is installed.
- Splats are a point shader with depth-sized discs, not a fitted Gaussian splat scene, and they are not depth-sorted.
- The depth model runs on one WebAssembly thread (no cross-origin isolation here), so large pictures are slow. Timing not measured.
- The subject cut-out model is about 46 MB and loads on first use (SlopCutout's own download).

## Assistant commands (`js/app/ai-commands.js`)
The page now starts SlopCmd (`main.js commands()`, which also exposes `SlopImg3D.app`); `img3d.ai.*` load on demand:
`new_from_picture` (Slop Drive or this site, through the page's own `openBlob`), `set_options` (mode, grid, scale, smooth, size,
invert, subject: the page's own controls, then `build`), `export_model` (glb, obj, s3d to Slop Drive and/or a download). The page
keeps no undo history; the checkpoint puts the options back. Test: `tests/img3d/ai-commands.test.html`.
