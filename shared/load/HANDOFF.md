# shared/load: the first view first (window.SlopLoad)

An app page paints once it is built (`<link rel="expect" href="#slop-built" blocking="render">`, see
`tests/node/render-ready.test.mjs`), so every parser-blocking script before the mark delays the first paint. The pattern:
the page runs only what its **empty first view** needs before the mark, and lists the rest in `<template>` elements that
`shared/load/load.js` loads after the first paint, when the browser is idle, or on demand. One loader for every app; it
also serves `SlopHub.loadScript` (shared/hub.js delegates to it).

Slop PDF (`pdf/index.html`) is the first page built this way. Lighthouse on a local gzip server (HTTP/1.1), before →
after: desktop 74 → 96-98 (FCP 1.9 s → 0.7-0.8 s, LCP 2.5 s → 0.9-1.2 s, TBT 40 → 0-100 ms); mobile 51-53 → 48-65 (FCP
9.9 s → 3.1-3.3 s, LCP 12.4 s → 4.1-8.1 s; the machine was heavily loaded, so mobile TBT and LCP varied run to run).
About 300 requests before the first paint → 45; pdf-lib (202 KB gzip) and pdf.js (141 KB) are no longer loaded on the
empty page. On HTTP/1.1 (6 connections) the mobile figure is ruled by the count of requests; GitHub Pages serves HTTP/2.

## How a page declares it

```html
<head>
  … theme.js, <link rel="expect" …>, the stylesheets the first view uses, a preload for its picture and its UI font
</head>
<body>
  … the page's HTML (it keeps all its content: crawlers and archives read it as before) …
  <script src="../shared/load/load.js"></script>        <!-- first, before the app's own scripts -->
  <script src="…">…</script>                              <!-- the first view: parser-blocking, as few as possible -->
  <template id="app-later" data-load="paint">            <!-- everything else, right after the first paint -->
    <link rel="stylesheet" href="css/editor.css">
    <script src="js/editor.js"></script> …
  </template>
  <template id="app-idle" data-load="idle">              <!-- the mascot, dialogs, the offline worker, the consent card -->
    <script type="module" src="../shared/buddy/boot.js"></script> …
  </template>
  <template id="app-engine">                              <!-- no data-load: only when the app asks, SlopLoad.group('app-engine') -->
    <script src="../vendor/big-library.min.js"></script>
  </template>
<i id="slop-built" hidden></i>
</body>
```

- A template's scripts, stylesheets, `<style>` and inline scripts run in their order: files are fetched side by side,
  classic scripts run in order, an inline script runs once the scripts before it have. Module scripts run when ready.
- A script or stylesheet already in the page (same URL) is not fetched again; a file named twice runs once.
- The templates are plain HTML, so `tools/pwa-precache.mjs` (service worker) and the offline build
  (`shared/offline/build.js`, the manifest test) see their files exactly as before. In an embed-mode offline copy the
  manifest's `scripts` run in the boot, so the templates are empty there and resolve at once; inlined stylesheets
  (`<style>`) in a template are still applied by the loader. List `shared/load/load.js` in the manifest.

## The app's side

- Split boot in two. Step 1, at `DOMContentLoaded`, builds the empty first view from the first-view scripts only
  (rail, menus, panel, drop zone, …): it runs before the first paint. Step 2 runs on `SlopLoad.ready('app-later')`:
  the rest of the wiring, then restoring tabs or the saved view. See `pdf/js/ui/app.js` (`A.boot`, `A.bootRest`).
- A control that step 1 draws but that needs step 2 waits for it: `A.whenReady(fn)` in Slop PDF runs `fn` at once when
  the app is wired, else when it is (a drop or a click in the first moment is not lost).
- Keep the load order of the old page inside each group. Classic scripts that keep a namespace in a variable at load
  (`var O = SP.organizer`) need that namespace's file earlier; a file that wraps a function at load (`var f = A.x; A.x = …`)
  needs the file that defines it earlier. Put such pairs in the same group, or the definer in the first view.
- A script loaded after `DOMContentLoaded` must not wait for that event: use
  `if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();`.
- Reserve room for anything step 2 adds to the first view (Slop PDF: the tab strip's height in `pdf/css/doc-tabs.css`,
  the command-search button in the HTML), so nothing moves when it arrives.
- A large library the empty page does not use goes in a template without `data-load` and is loaded by the code that
  needs it. Slop PDF: `SP.engine.pdflib()` (pdf-lib, `<template id="pdf-engine">`) and `SP.engine.pdfjs()` load on the
  first open, sample, export or image import (`SP.engine.libs()` waits for both and the standard fonts).

## API (classic script, no dependencies)

| Call | |
| --- | --- |
| `SlopLoad.script(src, { module })` | one script, once; a relative `src` is a site-root path (`'vendor/x.js'`) |
| `SlopLoad.scripts(list)` | several, fetched side by side, run in list order, each once |
| `SlopLoad.css(href)` | a stylesheet, once |
| `SlopLoad.group(id)` | load a template's contents now (once); resolves when they have run |
| `SlopLoad.ready(id)` | the same promise, without starting the load |
| `SlopLoad.loaded(id)` | the group has finished |
| `SlopLoad.url(path)`, `SlopLoad.root` | absolute URLs from the site root |

`data-load="paint"` starts after the browser's first paint (the Paint Timing entry; a frame and a task where it is
missing; at load in a tab or frame that paints nothing). `data-load="idle"` starts after `load`, at idle. A failed file
rejects its promise and can be asked for again; a group still runs its other files.

Tests: `tests/shared/load.test.html` (order, inline scripts, styles, dedupe, on demand, failures, SlopHub),
`tests/pdf/lazy.test.html` (Slop PDF: the first view without pdf-lib or pdf.js, both once a PDF is opened).
