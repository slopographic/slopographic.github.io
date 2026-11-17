# WebLLM (vendored)

MLC **@mlc-ai/web-llm 0.2.86** (model libraries `v0_2_86/base`) from registry.npmjs.org, Apache-2.0 (see `LICENSE`).

| File | What |
|---|---|
| `web-llm.js` | `lib/index.js` from the npm package, unmodified (6.8 MB; sha256 `ae2642e73a4a9896c21efb3a067c4666446f8b49cbe2012f4b576f5d83d5f206`). Self-contained ES module: the TVM runtime, tokenizers and xgrammar are bundled in it. Load it with `import()`, never a classic `<script src>`. |
| `LICENSE` | the package's Apache-2.0 licence |

The source map (`index.js.map`) was left out; the file still ends with a `sourceMappingURL` comment, which only matters
when DevTools is open.

## What the browser downloads at run time
Nothing until the person clicks Download in Slop AI. Then, once per model:
- the weights and tokenizer from `huggingface.co/mlc-ai/<model id>` (the `model` field of `prebuiltAppConfig`)
- the compiled WebGPU kernels (`model_lib`, a `.wasm`) from `raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs`

Both are stored with the Cache API (`webllm/model`, `webllm/config`, `webllm/wasm`) and reused offline afterwards.

## Loading (from a page one folder below the site root)

```js
const webllm = await import(new URL('../vendor/web-llm/web-llm.js', document.baseURI).href);
const engine = await webllm.CreateMLCEngine('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', { initProgressCallback: (p) => console.log(p.text) });
```

Slopographic code does not call this directly: use the engine adapter in `shared/ai/webllm.js`.

## Updating
`npm pack @mlc-ai/web-llm@<version>`, copy `package/lib/index.js` to `web-llm.js` and `package/LICENSE`, then check
that every id in `shared/ai/catalog.js` still exists in `prebuiltAppConfig.model_list` (the catalog test does this).
