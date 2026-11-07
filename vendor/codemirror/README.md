# CodeMirror 6 (vendored)

Slop Code's editor engine: [CodeMirror 6](https://codemirror.net/), **MIT licence** (Copyright © Marijn Haverbeke and others). The full licence texts are in `LICENSES.txt`.

## Packages

| Package | Version | Licence | File |
|---|---|---|---|
| `@codemirror/state` | 6.7.6 | MIT | `codemirror-state.js` |
| `@codemirror/view` | 6.43.14 | MIT | `codemirror-view.js` |
| `@codemirror/language` | 6.13.1 | MIT | `codemirror-language.js` |
| `@codemirror/commands` | 6.11.1 | MIT | `codemirror-commands.js` |
| `@codemirror/autocomplete` | 6.20.3 | MIT | `codemirror-autocomplete.js` |
| `@codemirror/search` | 6.7.2 | MIT | `codemirror-search.js` |
| `@codemirror/lint` | 6.9.7 | MIT | `codemirror-lint.js` (a dependency of lang-javascript) |
| `@codemirror/streamparser` | 6.0.0 | MIT | `codemirror-streamparser.js` (a dependency of language) |
| `@codemirror/lang-javascript` | 6.2.5 | MIT | `codemirror-lang-javascript.js` (JavaScript and TypeScript) |
| `@codemirror/lang-html` | 6.4.12 | MIT | `codemirror-lang-html.js` |
| `@codemirror/lang-css` | 6.3.1 | MIT | `codemirror-lang-css.js` |
| `@codemirror/lang-json` | 6.0.2 | MIT | `codemirror-lang-json.js` |
| `@codemirror/lang-markdown` | 6.5.2 | MIT | `codemirror-lang-markdown.js` |
| `@codemirror/lang-python` | 6.2.1 | MIT | `codemirror-lang-python.js` |
| `@lezer/common` | 1.5.3 | MIT | `lezer-common.js` |
| `@lezer/highlight` | 1.2.5 | MIT | `lezer-highlight.js` |
| `@lezer/lr` | 1.4.11 | MIT | `lezer-lr.js` |
| `@lezer/javascript` | 1.5.6 | MIT | `lezer-javascript.js` |
| `@lezer/html` | 1.3.13 | MIT | `lezer-html.js` |
| `@lezer/css` | 1.3.9 | MIT | `lezer-css.js` |
| `@lezer/json` | 1.0.3 | MIT | `lezer-json.js` |
| `@lezer/markdown` | 1.8.0 | MIT | `lezer-markdown.js` |
| `@lezer/python` | 1.1.19 | MIT | `lezer-python.js` |
| `@marijn/find-cluster-break` | 1.0.4 | MIT | `marijn-find-cluster-break.js` |
| `crelt` | 1.0.7 | MIT | `crelt.js` |
| `style-mod` | 4.1.4 | MIT | `style-mod.js` |
| `w3c-keyname` | 2.2.8 | MIT | `w3c-keyname.js` |

## How it was made

`tools/vendor-codemirror.mjs` (build time only, run by hand with `node tools/vendor-codemirror.mjs`) fetches each package's ESM entry from `https://cdn.jsdelivr.net/npm/<package>@<version>/`. It checks that every bare import is one of the pinned packages, writes the files above, `LICENSES.txt` (each licence text, grouped), and `import-map.json`. Every file gets one header comment line naming the package, version and source. Nothing else is edited.

The app loads these files from the site itself. `code/index.html` has an inline import map with the same entries as `import-map.json` (`tests/code/vendor.test.html` checks that they match). Nothing is fetched from a CDN at run time.

## Notes

- The files are the packages' unminified ES modules, copied as shipped. Several are longer than 300 lines. That limit applies to the code Slop writes, not to vendored upstream code.
- To update, change the versions in the script, run it, then update this table and the import map in `code/index.html`.
