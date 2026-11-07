# AI models (vendored)

ONNX models used by the on-device background remover (`shared/cutout/`, app `cutout/`). They run in
the browser with ONNX Runtime Web (`vendor/onnxruntime-web/`). Every model here has a permissive
license that allows commercial use. **BRIA RMBG is deliberately not used** (non-commercial license).

| File | Mode | Size (bytes) | sha256 | License |
|---|---|---|---|---|
| `u2netp.onnx` | Fast | 4 574 105 | `071286c4799087ffb7706481f2d970adb2ca2d70563f1d92f71e067fd4c8810c` | Apache-2.0 |
| `isnet-general-w8.onnx` | Quality | 46 535 524 | `d26c429eb10cb83457239610a7cc4ccf21775e7bc18c16bc626c5bbf3b9743b8` | Apache-2.0 |
| `modnet-portrait.onnx` | Portrait | 25 888 640 | `07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9` | Apache-2.0 |

The app checks these hashes after every download (`shared/cutout/models.js`), so a changed file must
get its new hash there too.

## Sources and licenses

### U²-Netp (Fast) — `u2netp.onnx`
- Model: U²-Net small, Qin et al., *U²-Net: Going Deeper with Nested U-Structure for Salient Object
  Detection* (2020). Code and weights: https://github.com/xuebinqin/U-2-Net, license **Apache-2.0**
  (https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE).
- ONNX export downloaded from the rembg release assets (rembg is MIT, the weights keep their
  Apache-2.0 license): https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
  (4 574 861 bytes, sha256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`).
- Changed (`tools/convert.py`, deterministic): pruned to the single fused output `1959`, and the
  2×2 `MaxPool` layers rewritten from `ceil_mode=1` to `ceil_mode=0` with end padding 1 (bit-identical
  output; the WebGPU backend cannot run `ceil_mode`). Input `input.1`
  [1,3,320,320], ImageNet mean/std after dividing by the image maximum; output min-max normalised.

### IS-Net general-use (Quality) — `isnet-general-w8.onnx`
- Model: IS-Net, Qin et al., *Highly Accurate Dichotomous Image Segmentation* (ECCV 2022).
  Code and weights: https://github.com/xuebinqin/DIS, license **Apache-2.0**
  (https://github.com/xuebinqin/DIS/blob/main/LICENSE.md).
- ONNX export downloaded from the rembg release assets:
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
  (178 648 008 bytes, sha256 `60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a`).
- Changed (`tools/convert.py`, deterministic): pruned to `output_image`, then **weight-only int8**
  (and the same `MaxPool` rewrite as above):
  Conv weights stored as int8 with a per-output-channel scale and expanded by `DequantizeLinear`
  (compute stays float32). 178 MB → 46.5 MB. Against the fp32 original (ONNX Runtime CPU) the
  mean absolute mask difference was 0.0000–0.0066 on our test images; full dynamic uint8
  quantisation was rejected (visibly worse masks, IoU 0.77). Input `input_image` [1,3,1024,1024],
  `x/255 - 0.5` after dividing by the image maximum; output min-max normalised.

### MODNet photographic portrait matting (Portrait) — `modnet-portrait.onnx`
- Model: MODNet, Ke et al., *MODNet: Real-Time Trimap-Free Portrait Matting via Objective
  Decomposition* (AAAI 2022). Code and weights: https://github.com/ZHKKKe/MODNet, license
  **Apache-2.0** (https://github.com/ZHKKKe/MODNet/blob/master/LICENSE).
- The official ONNX file (`modnet_photographic_portrait_matting.onnx`, linked from
  https://github.com/ZHKKKe/MODNet/tree/master/onnx) is hosted on Google Drive, which this build
  environment cannot reach. The identical file was taken from two independent npm mirrors that
  agree byte for byte: `hidu-modnet@1.0.0` (`modnet.onnx`, https://registry.npmjs.org/hidu-modnet/-/hidu-modnet-1.0.0.tgz)
  and `@rmbg/model-modnet@0.0.1` (the same bytes split into three parts). It is unchanged.
  Input `input` [1,3,H,W] (H, W multiples of 32, short side 512), `(x/255 - 0.5) / 0.5`;
  output `output` is the alpha matte in [0,1].

## Not used, and why
- BRIA RMBG 1.4 / 2.0: non-commercial license.
- BiRefNet / BiRefNet-lite (MIT): smallest ONNX export is ~224 MB fp32; too large for the 50 MB
  per-file budget even at fp16, and its deformable convolutions are slow in WebAssembly.
- IS-Net fp16 (90 MB) and U²-Net full (176 MB): over the size budget.
