# Slopographic

Free office and creative apps that run in your browser: a PDF editor, a photo editor, a background remover, a video editor, a file converter, workflows across apps and 70+ more. Live at **[slopographic.com](https://slopographic.com)**.

Everything runs 100% in your browser: no installs, no accounts, no uploads, no watermarks. Static files, no backend, no build step. Each app is its own folder and can be downloaded as one offline `.html` file. Your files stay on your device, or in Slop Drive, the local drive every app shares. The optional AI runs on your device, or, if you connect your own AI account, sends your requests straight to that provider and nowhere else.

The apps stand in for about **$1,700 a year** of paid software for one person, at list prices
([how it is counted](https://slopographic.com/#savings)).

## Fork me! (no, really)

Every copy of Slopographic is one more place where people can use free, private, offline browser tools. A single site can go
down, get blocked by a school or office filter, or simply disappear; a hundred copies are much harder to lose. It is MIT
licensed, so hosting your own is not just allowed, it is the point.

1. **Fork** this repository.
2. **Enable GitHub Pages** on your fork (Settings → Pages) for your default branch, from the root folder. There is no
   build step: the files are the site.
3. **Give it a home of its own.** The site expects the root of a domain: name the fork `<your-account>.github.io`, or
   put your own domain in `CNAME` (it holds ours, so change or delete it either way).
4. **Optional: make it yours.** Name, colours and logo are one file: see [`brand/README.md`](brand/README.md).

The code is MIT, but the name Slopographic, its logo, the mascot art and the media (screenshots, videos)
are not part of that licence ([`NOTICE.md`](NOTICE.md), [`TRADEMARKS.md`](TRADEMARKS.md), [`LICENSE-ART`](LICENSE-ART)): a public copy brings its own.

Congratulations: you now run a software suite, and your hosting bill is still zero.

## The apps

### Creative

| Path | App |
|---|---|
| `/photoslop/` | **PhotoSlop**: layers, masks, filters, brushes and guides; PSD support. Classic MS Paint clone at `/photoslop/classic/` |
| `/slopvector/` | **SlopVector**: pen, shapes, type and pathfinder; SVG, PNG and PDF export |
| `/pdf/` | **Slop PDF**: merge, split, sign, annotate, fill and truly redact PDFs |
| `/press/` | **Slop Press**: page layout and print-ready PDF |
| `/slopcut/` | **SlopCut**: multi-track video editor with WebCodecs export |
| `/slides/` | **Slop Slides**: presentations in PowerPoint and Keynote style |
| `/docs/` | **Slop Docs**: word processing, Word and Google Docs style |
| `/tables/` | **Slop Tables**: spreadsheets, Excel and Sheets style |
| `/3d/`, `/img3d/` | **Slop 3D**: a 3D editor for simple models and scenes; **Image to 3D** |
| `/effects/` | **Slop Effects**: motion design |
| `/slopisolate/`, `/upscale/`, `/resize/`, `/watermark/` | **SlopIsolate** (remove backgrounds), **Upscale** (sharper pictures), **Resize**, **Watermark** |
| `/label/` | **SlopLabel**: barcode labels, GS1 and ZPL |
| `/qr/` | **QR SLOP**: QR codes for links, Wi-Fi and contacts |
| `/remix/` | **Reel Remix**: a random video edit from your clips |
| `/music/`, `/gallery/` | **Slop Music** and **Slop Gallery**: your audio and photo libraries |

### Business

| Path | App |
|---|---|
| `/slop-365/` | **Slop 365**: invoices, orders, CRM and ledger in one place |
| `/invoices/` | **Slop Invoices**: gapless invoices, payments and a ledger |
| `/orders/` | **Slop Orders**: orders from draft to fulfilment |
| `/crm/` | **Slop CRM**: customers, pipeline and follow-ups |
| `/ledger/` | **Slop Ledger**: double-entry books and trial balance |
| `/inventory/` | **Slop Inventory**: stock, barcodes and reorder alerts |
| `/reports/` | **Slop Reports**: unpaid invoices, groups and follow-ups |
| `/contacts/` | **Slop Contacts**: vCard and CSV address book |
| `/calendar/`, `/todo/`, `/reminders/`, `/time/` | **Calendar**, **To-do**, **Reminders** and **Time**: schedule, tasks, reminders, world clock and meetings |
| `/notes/`, `/paste/` | **Slop Notes** (Markdown notebooks) and **Paste** (share text, code and images by link) |
| `/calculator/`, `/nodes/`, `/serials/` | **Slopculator**, **Slopnodes** and the **Serial counter** |
| `/transcribe/` | **Slop Transcribe**: voice, MP3 and video to text on the device (Whisper), corrected and saved as TXT, Word, SRT or VTT |
| `/ocr/`, `/aitools/`, `/ai/` | **Slop OCR**, **AI Tools** (OCR, transcription, denoise) and **Slop AI** (chat with a model on your own computer) |

### Utilities

| Path | App |
|---|---|
| `/drive/` | **Slop Drive**: every file from every app in one drive, with one-file backup |
| `/convert/` | **File convert**: image, PDF, mail, calendar and data converter |
| `/eml/`, `/hex/`, `/checksum/`, `/clean/`, `/code/` | **Slop EML** (email files), **Hex**, **Checksum**, **SlopClean** (hidden photo data) and **Slop Code** |
| `/diff/` | **Slop Compare**: two texts, code, JSON, CSV, PDFs or pictures compared, with a report and a .patch |
| `/admin/`, `/settings/`, `/how-it-works/` | Company profile and backup, profile and settings, and how the storage works |
| `/#detector` | **The Authenticator**: an AI text detector that certifies any text as slop (`detector/`) |

Each app folder has its own `HANDOFF.md` with notes for whoever works on it. Tests: `npm test`.

## Run locally

```sh
npx http-server . -p 8080   # or: python3 -m http.server 8080
```

## Deploy (GitHub Pages)

`main` is the live site. `.github/workflows/pages.yml` builds it on every push to `main`: the branch as it is, plus the SEO
pages of the other languages (`/sv/`), which are written on publish and never committed (`node tools/seo/write.mjs
--langs`; `shared/seo/HANDOFF.md`, "Languages"), and deploys that with GitHub's Pages actions.

1. **Settings → Pages → Source: GitHub Actions.** While the source is "Deploy from a branch", Pages serves `main` as
   committed, without the language folders, and the workflow builds but skips its deploy step. Switch the source just
   before the push that brings this workflow to `main` (the deployed site stays up until the next deploy, which is then
   this workflow's), or right after it and run the workflow by hand (Actions → Pages → Run workflow); in between, `/sv/`
   is missing. IndexNow (`indexnow.yml`) follows the source: it pings after the push for a branch deploy, and after the
   Pages workflow's run for an Actions deploy.
2. **Custom domain:** `slopographic.com` (already in `CNAME`), with **Enforce HTTPS** on.
3. **DNS** at your registrar: `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, and a `CNAME` for `www` → `slopographic.github.io`.

## License
- **Code:** MIT, see [`LICENSE`](LICENSE).
- **Sloppo character art:** all rights reserved, see [`LICENSE-ART`](LICENSE-ART).
- **Brand:** Slopographic™ and Sloppo™ are trademarks; see [`TRADEMARKS.md`](TRADEMARKS.md). Forks must rename and use their own mascot.
- **Third-party code** in `vendor/` keeps its own license.
- What the MIT License does not cover, in one place: [`NOTICE.md`](NOTICE.md).


## Contributing

Run `npm install` once in a clone. Its `prepare` script switches on the commit hooks in `.githooks/`, which refuse commits not authored as Slopographic and commit messages that carry Claude attribution. Check with `node --test tests/node/attribution.test.mjs`.

### Rules for every change

Checked by the hooks (pre-commit on the staged files, pre-push on the pushed commits) and by CI (`.github/workflows/rules.yml`), with `tools/check-rules.mjs`:

1. **At most 300 lines per source file** (`.js`, `.mjs`, `.css`, `.html`). Split a longer file into modules. `vendor/`, minified files and the generated precache lists are exempt.
2. **Every new or changed script has a test that names it** by its repo path: the test loads it (a script `src` or an `import`), or its header has a `Covers: <path>` line when it tests the file through its app page.

4. **One way in, one way out.** Files get into an app only through the shared intake (`shared/intake`, `SlopIntake.take`: drops, pickers, paste, Slop Drive, ?drive=, PWA launches, samples, the Convert dialog all end there, and the app registers one reader), and out only through `SlopOuttake` (one "Open in…" builder for every menu). In the apps already on it (`STRICT` in `tools/one-way.mjs`), a `drop`/`paste` listener, `SlopUI.pickFiles`, a file input, a ?drive= or launchQueue reader, `pickFromDrive` or a hand-made "Open in"/"Send to" list is refused; a line that must stay says why with an `// intake-ok:` comment. `shared/intake/HANDOFF.md` has the API and the checklist of apps still to move; add an app's folder to `STRICT` once it is migrated.
5. **Every app works with a finger and a pen, on iOS and Android.** Use pointer events, never `mousedown`/`mousemove`/`mouseup` listeners (a finger's drag sends none); mark every editing surface (a canvas, page view, timeline or editor you drag on) with `data-touch-surface` or `SlopTouch.surface(el)`, so the browser never takes a drag for a scroll; give handles a 44 px hit area under `(pointer: coarse)` (`--slop-hit`, `.slop-hit`, `SlopTouch.hit`). Double tap, long press, pinch and palm rejection come from the shared touch layer (`shared/input/HANDOFF.md`). `tools/check-rules.mjs` refuses mouse listeners and drag code (`setPointerCapture`) with no touch surface, unless a `touch-ok: <why>` comment explains; pages marked `<meta name="slop-test-touch">` also run on an iPad in WebKit and an Android tablet in Chromium (`node tests/run.mjs --touch --browser=webkit|chromium`, CI job `touch`).

`node tools/check-rules.mjs --all` checks rules 1, 4 and 5 on the whole repo; `--staged`, `--range A..B` and `--files <paths>` check 1, 2, 4 and 5. The pre-push hook also runs the Node tests (Node 20 or later). Tests run on Node 22, as in CI.

3. **Every page loads in 500 ms: aim for it, and never get slower.** On Lighthouse's desktop preset a page's largest content (LCP) shows within 500 ms; on its mobile preset (a mid-range phone on slow 4G) within 2.5 s, Google's "good"; and nothing on the page moves more than CLS 0.1. Few pages are there yet, so CI holds a ratchet instead: `.github/workflows/speed.yml` runs Lighthouse (`tools/speed/run.mjs`) on every page of the site (every sitemap URL, every app, the site pages) on both presets, the median of 3 runs, with the checkout served gzipped as Pages serves it, and fails a page that gets slower or heavier than its budget in `tools/speed/budgets.json` by more than the run-to-run noise (`tools/speed/budget.mjs`). A page that meets the goal never fails. Make a page faster, then lower its budget: `node tools/speed/run.mjs --update --pages=pdf/` (budgets only go down; a run on every page also drops pages that are gone). A new page is measured by CI and listed as new, not failed; its budget is added from CI's results with `--update --from=<the unzipped speed-results artifact>` (nothing is measured on a laptop). When a change has to cost load time, re-record that page with `--update --reset=<page>` and say why in the commit message. Each run's numbers are in the workflow's summary, slowest first, and its `speed-results` artifact; `--update --from=<the unzipped artifact>` lowers the budgets from CI's own runs. Budgets are recorded on CI's machines, not a laptop: with no `budgets.json`, or on a manual run of the workflow with **record** ticked, the jobs measure every page and check nothing, and `node tools/speed/run.mjs --update --from=<the unzipped speed-results artifact>` writes the budgets from it (the summary's noise table shows how far runs strayed against each tolerance).

5. **Work branches never run the full browser suite.** CI's `plan` job (`tools/ci/plan.mjs`) decides what the browser jobs run. On `wip/*` and every other work branch (and their pull requests) only the test pages the change needs run, in at most 4 parallel jobs: the test pages it changed, every page that loads or names a changed file (through the app pages it opens and every script, module and worker they load, or its `Covers:` lines: a change to a shared file runs the tests of every app that loads it), and a few smoke pages (`tools/ci/affected.mjs`; `node tools/ci/affected.mjs` shows the list for your branch). A change to the runner or CI files alone runs only the smoke pages there. `testing` always runs the full suite (16 jobs); that is where finished work is proven, merged in batches. `main` skips it for a merge whose tree is the merged commit's and that commit already passed "Rules and tests" (a milestone merge of `testing`), and runs it for anything else (a hotfix). `tests/node/ci-config.test.mjs` fails if the workflow lets a work branch run the full suite.

Offline copies follow the files: the pre-commit hook regenerates the precache list and the service worker `VERSION` (`tools/pwa-precache.mjs`; see `shared/pwa/HANDOFF.md`).
