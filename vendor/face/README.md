# Face detection model (vendored)

The on-device face detector used by Slop Drive and Slop Gallery (`shared/faces/`). It is opt-in and off by
default. The app loads this file from the site itself; it never fetches the model from a CDN at run time.

| File | Size (bytes) | sha256 | Licence |
|---|---|---|---|
| `face_detection_yunet_2023mar.onnx` | 232 589 | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | MIT |
| `LICENSE` | | | MIT, the licence text from the upstream repository |

## Source

- Model: **YuNet** face detector, by Shiqi Yu and the OpenCV community (2020, "YuNet: A Tiny Millisecond-level
  Face Detector"). Code and weights: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- File: `face_detection_yunet_2023mar.onnx`, version **2023mar** (the March 2023 export).
- Fetched from the Hugging Face repository `opencv/face_detection_yunet`, revision
  `3cc26e7f1014a5ee5d74a42acee58bafc9d0a310` (last modified 2025-06-20). The file is unchanged. Its sha256 matches
  the Git LFS object id recorded in that repository, and it matches the checksum that `@arkyc/vision` (MIT, npm) uses
  for the same file, so the bytes are the upstream file.
- The licence is MIT (`LICENSE` in this folder, copyright Shiqi Yu, 2020). The model is not changed.
- Other copies on npm or Hugging Face were not used.

## Runtime

- Runs with **ONNX Runtime Web** from `vendor/onnxruntime-web/` (WebAssembly build, one thread). No new runtime.
- Input `input` [1, 3, 640, 640], float32, BGR, values 0 to 255 (no mean or scale). The image is letterboxed to
  640 px on its longer side.
- Outputs for strides 8, 16 and 32: `cls_N`, `obj_N` [1, H·W, 1], `bbox_N` [1, H·W, 4], `kps_N` [1, H·W, 10].
  The decoder is in `shared/faces/decode.js`. It matches OpenCV's `FaceDetectorYN` (checked on the upstream
  "largest selfie" example: the boxes sit on the faces).

## Checks

- `shared/faces/index.js` computes the sha256 of the downloaded bytes (SubtleCrypto) and refuses a model whose
  checksum differs. A changed file needs its new hash in `shared/faces/index.js` (`MODEL.sha256`) and in this README.

## Removing it

1. Turn the setting off (Profile, Face detection). Nothing loads while it is off.
2. Delete `vendor/face/` and remove `vendor/face` from the precache list in `service-worker.js`.
3. Remove the face modules: `shared/faces/`, the `faces` entries in `shared/profile/app-options.js`, and the
   Drive and Gallery face code (see `shared/faces/HANDOFF.md`).
4. The results are stored in IndexedDB `slop-faces`. Delete that database to remove them (Settings, or the
   browser's site data for this origin).
