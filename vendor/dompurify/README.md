# DOMPurify (vendored)

The HTML and SVG sanitiser behind `shared/sanitize/sanitize.js` (SlopSanitize), which every app uses for markup that
came from a file, a link or the clipboard (email bodies, HTML documents, SVG).

| File | Version | Size (bytes) | sha256 | Licence |
|---|---|---|---|---|
| `purify.min.js` | 3.4.16 | 28 885 | `2c90a9b46d6463f26038a29b686e82bc91de01fdac9d5229e7cfe3b360134ea2` | Apache-2.0 or MPL-2.0 |

- Source: npm `dompurify@3.4.16` (published 2026-09-23), file `dist/purify.min.js` (the UMD build: a classic script
  sets `window.DOMPurify`; imported as a module it sets `globalThis.DOMPurify`). The file is unchanged.
  npm integrity `sha512-sqo+pNp3qRhCIpbgRi1y8Tgk27Bo2Ry7w0dC1NBeNTdZChWjz9Xb/KOoZbRP/R6pQZ80Qw8YhXw13hWWBbMRnQ==`.
- Upstream: https://github.com/cure53/DOMPurify (Cure53 and other contributors). Licence texts: `LICENSE` (Apache 2.0)
  and `LICENSE-MPL` (Mozilla Public License 2.0); the project is dual licensed.
- Update: `npm pack dompurify@<version>`, copy `dist/purify.min.js`, update this table, and run the sanitiser tests
  (`tests/shared/sanitize.test.html`).
