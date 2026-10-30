# Brand: making your own copy

Everything a visitor sees as "Slopographic" (the page title, header name and logo, colours, footer and
support links) comes from `brand/brand.json`. Apps and the homepage read it through `brand/brand.js`.

## Fork in three steps

1. **Copy the site.** Copy the whole folder to your own repository. There is no build step: the site is
   plain HTML, CSS and JavaScript, so it runs from any static host.
2. **Edit `brand/brand.json`.**
   - `name`, `tagline`: the header name and the line under the homepage title.
   - `logo`: a path from the site root to your logo (SVG or PNG). Replace `brand/logo.svg`, or point to a new file.
     An empty string keeps the built-in mark.
   - `home`: where the logo links go (a full `https://` URL or a path). Empty keeps each page's own link, which is the site root.
   - `colors`: `ink` (background), `paper` (text), `accent` (highlight). Use `#rgb`, `#rrggbb` or `#rrggbbaa`.
   - `footer`: the footer line on the homepage.
   - `links.patreon`, `links.support`: `https://` or `mailto:` links. An empty value hides that link.
   - `appOrder`: the default order of apps in the switcher and the app drawer (app ids from `shared/apps.js`).
     Apps not listed follow in registry order.
3. **Deploy the folder** to your host (for example GitHub Pages or any static server). Update your domain
   in `CNAME` and the canonical and `og:` tags in `index.html` if you use them.

If `brand.json` is missing or invalid, the built-in defaults are used and the site still works.
Bad values (for example a `javascript:` link or a malformed colour) fall back to their defaults.

## What the brand touches

| Where | What |
| --- | --- |
| Page title | The word "Slopographic" is replaced by `name`. |
| `[data-brand-name]`, header `.brand-name` | Text: `name` |
| `[data-brand-tagline]` | Text: `tagline` |
| `[data-app-name="<app id>"]` | Text (or `aria-label`): the app's name as the app list shows it, in the chosen language (`slopAppName`, filled by `shared/i18n/i18n.js`) |
| `[data-brand-logo]`, or the first svg in a header `.brand` link | The logo image from `logo` |
| `[data-brand-home]`, and the logo link `header a.brand` on app pages | `href`: `home`, when it is set |
| `[data-brand-footer]` | Text: `footer` |
| `[data-brand-link="patreon"]`, `[data-brand-link="support"]` | `href`, hidden when empty |
| `--brand-ink`, `--brand-paper`, `--brand-accent` on `:root` | Colours for the shell and any page that uses them |
| `<html data-brand-tokens>` | Also sets `--ink`, `--bone`, `--slop`, which the homepage uses |

To put a brand hook on a new page, add one of the attributes above to the element you want changed.

## Using it from code

```js
SlopBrand.ready.then((config) => console.log(config.name));   // resolves after brand.json is read
SlopBrand.apply({ name: 'Preview Co' });                      // apply any config again (for live previews)
SlopBrand.order;                                              // the default app order
```

## Offline use

`tools/pwa-precache.mjs` lists the files a page loads at boot so the service worker can cache them. It
follows static `<script src>` tags. The shell (`shell/`) and `brand/` files are loaded from script code,
so they are not in that list yet. Add them to the list and regenerate it before you rely on offline use.

## White-label builds

The same code also builds other sites: a copy of the whole site under another name, with plain app names, its own
colours and logo, no mascot (or a mascot of its own), and no word of this brand anywhere (text, code, file names, storage keys, tests, workflows).
One codebase, one profile per site. A build is generated: it is never edited by hand, and every improvement made here
reaches it at the next release.

**The rule: edit here, publish there. If a change is made there anyway, import it** (`tools/whitelabel/import.mjs`).

### Profiles

A site is one profile, `<id>.json`, next to its rename map, `<id>.map.json`. This repository holds only
`brand/profiles/slopographic.json` (this site; no map, so a build of it is a plain copy with today's values) and two
made-up samples that CI builds (`sample`: "Acme Tools", English; `sample-sv`: Swedish by default, two themes named after the brand, light by default). The profiles of real
sites live outside this repository, with the publish script; pass their folder with `--profiles=<dir>`.

| Field | What it sets |
| --- | --- |
| `id` | The file name. |
| `name`, `shortName`, `brandWord`, `tagline` | The product name (title, header, footer, manifest), the short name (manifest), the word that replaces this brand before a lower-case word ("the Acme apps"), and the line under the homepage title. |
| `origin`, `cname`, `mailDomain`, `github` | The site's address (canonical, Open Graph, sitemap, robots), its custom domain (`CNAME`), mail domain, and GitHub account (cdn and repository links). |
| `defaultLang` | The language a visitor gets when nothing is stored (`en`, `sv`, ...). Every language stays in the picker. |
| `naming` | `brand` (PhotoSlop, Slop PDF) or `plain` (Image Editor, PDF Editor; the `PLAIN` table in `shared/apps.js`). |
| `tone` | `playful` or `plain`: plain applies the copy layer, `brand/copy/plain.json`. |
| `backupExt` | The backup file's extension (`.backup`, `.acme`): the backup ZIP is `<name>-backup-<date><ext>` and "Export everything" writes `<ext>.json`. Default `.backup` for the plain tone; a playful profile without it keeps this site's `.slop`, renamed by its map. The code reads it from `SlopBackup.EXT` / `JSON_EXT` (`shared/backup/index.js`); text that names it (guides, the homepage) is turned the same way. |
| `mascot` | `false` turns the mascot off everywhere (the buddy, the Drive empty states, the AI top bar). An object puts the profile's own mascot in its place: `{ overlay, name, files, icon?, holder?, trademarks?, size?, roam? }` (see "A mascot of your own"). |
| `colors`, `themes`, `palette` | `brand.json` colours; the theme tokens (`themes.light` / `themes.dark`: `background`, `surface`, `text`, `accent`, `border`; `hide` drops themes such as `classic` and `lime`); the hue every accent-coloured colour in the CSS and code moves to (`tools/whitelabel/palette.mjs`). `palette.neutral` (`{ hue, saturation?, from?, maxSaturation? }`, default saturation 0.15, `from` `[[20, 60]]`, the warm paper greys) moves this site's tinted greys, the apps' own backgrounds, fields and lines, to the profile's grey tint with the same luminance (add `[225, 260]` to `from` for the near-blacks of the dark look); pure greys and colours stay. The profile's own colours (its theme tokens) are never moved. |
| `themes.names` | `"name"` or `"brandWord"`: Light and Dark are called "<name> Light" and "<name> Dark" ("Acme Light", "Acme Ljust") in the Settings picker and the header's theme menu, in every language (chrome keys `shell.theme_brand_light` / `_dark`, with a `{brand}` placeholder). Unset: Light and Dark. |
| `defaultTheme` | The theme of a visitor who never chose one: `system` (default: follows the device), `light`, `dark` or another theme the profile keeps. A visitor's own choice always wins. Set in `shared/theme/theme.js` through the `defaultTheme` marker. |
| `logo` | `{ text, mark, color }`: the build draws a wordmark (`brand/logo.svg`), a square mark (`brand/mark.svg`, the favicon) and the PNG icons and share card from it. Replace the files in a later commit of the profile's folder if you have a real logo. |
| `links`, `footer`, `support`, `analytics` | Footer and support links (empty hides them), the footer line, the export card parts, and third parties: `false` leaves out analytics, ads and the consent strip. |
| `copy` | Extra phrase replacements for this site (`"source phrase": "replacement"`), on top of the tone's. A plain name can double a word ("your Slop Drive files" with Drive named Files reads "your Files files"): the build lists each word the rename doubled and the export fails on it, so word such a phrase here (`"Slop Drive files": "files in Files"`). |
| `repeatAllow` | Doubled words this site means (`["word word"]`), which the export then accepts. |
| `savings` | `false` leaves out the homepage's yearly savings line ("≈ $X a year in software you don't have to buy") and its list, and the line in the generated README. Default `true`: the same figure as this site, from `shared/savings/data.mjs` (one user, US list prices; the build's hidden apps stay counted, so hide it when you hide many). |
| `apps.hide`, `media` | Apps left out of every list, menu and sitemap (their guides and task pages too; tests read them from the brand facts, `hideApps`); `false` leaves out screenshots, clips and videos (they show this brand). |
| `seo` | `homeTitle`, `homeDescription`, `titleSuffix` for the generated head blocks and the sitemap (the home copy is in the root language), and `langs`: the languages of the static SEO pages besides the root one, `"all"` (default), a list (`["sv", "de"]`) or `"none"` (below, "Languages of the SEO pages"). `index` (default `false`), `canonicalTo` and `canonicalOverride`: what search engines are told (below, "Search engines"). |
| `mainApp`, `parent` | A site for one app: the app the site's root opens (an app id), and the suite it links back to, `{ name, url }` (below, "Single-app sites"). |
| `promo` | One line about the site owner's own business, with a link: `{ text, url, where? }` (below, "A promo line"). Default none. |
| `ai` | Which AI models the site offers (default `{}`: all of them). See "AI models" below. |
| `ocr` | Which text recognition engines the site offers and which one it uses first (default: both, Auto). See "Text recognition (OCR) engines" below. |
| `legal` | `{ holder, year, trademarks? }`: the MIT licence's copyright holder, `NOTICE.md` and `TRADEMARKS.md` (`trademarks`: the names the holder claims; default the product name). |
| `publish` | `{ repo, branch, secret, author, email }`: where the publish script pushes, the token's secret name, and the release commit's author. |
| `font` | `{ spec, dir }`: the profile's own type family, a font spec for `tools/fonts/build.py` and its built folder (both relative to the profiles folder; build the folder ahead, the site build needs no Python). The build ships it as `shared/fonts/brand/` with its CSS and token names, and the typeface page. Without it, a build ships no family: the upstream fonts (Inter Tight and the others) and no typeface page. This site's family never goes into another build, and the leak scan reads the name tables inside every WOFF2 file and zip. The sample's family: `brand/profiles/fonts/acme/`. Only a plain brand mark may go into a family's Private Use Area, never the mascot (it is all-rights-reserved art; a font is OFL): the build refuses such a spec. |
| `history` | For a copy with its whole history (`tools/whitelabel/history.mjs`): `since` (a source commit: everything up to it becomes one "Initial version" commit at its time), `forbidPaths` (regular expressions of source paths no mapped commit carries) and `forbidWords` (regular expressions: a source line holding one is left out of the mapped file, a message part holding one is left out), and `forbidMessages` (the same for messages only). |
| `brandTerms`, `forbid`, `scanAllow` | Words only this site uses (no other build may contain them), extra words to forbid, and allowed scan hits (`{ file, term, why }`, reported every time). |

`tools/whitelabel/profile.mjs` `validate()` is the schema in code; `tests/node/whitelabel-profile.test.mjs` checks every
profile here.

### A promo line

A site may show one short line about its owner's own business instead of ads: no ad network, no script, image or
request from anyone else, no cookie.

```json
"promo": { "text": { "en": "Need parts? Compare prices at example.com", "sv": "Behöver du delar? Jämför på example.com" }, "url": "https://example.com", "where": ["home", "settings"] }
```

- `text`: one line (at most 120 characters) for every language, or one per language code; a language it lacks reads
  English, then the first one given. `url`: an https address. `where`: `home` (under the homepage's app list) and/or
  `settings` (the end of Settings); default both. Editors never show it.
- `shared/promo/promo.js` holds the value (the `promo` marker, `null` on this site) and fills each
  `<div data-promo-slot="home|settings" hidden>` of a page. The link opens a new tab without a referrer; in the
  iPhone/iPad app the system browser opens it. Hide (×) keeps it away on that device until the line or address changes.
  Its few words (the label, Hide) are in `shared/promo/i18n` (en, sv).


Some sites cannot offer models from certain makers or countries. The `ai` field hides them everywhere a model can be
picked: the providers of "Use your own AI account" and their suggested models, the lists fetched from a provider
(OpenRouter, Together, Groq, a server on this computer...), the models on this device (Slop AI and the side panel), the
picture models and the free-key guide. A provider that is a hidden maker's own API (DeepSeek, Qwen, Kimi, GLM) leaves the
list, and so does one whose every model is hidden and that fetches no list. A saved choice of a hidden model or provider
is not used: the next allowed one is (on this device, the default model falls back from Qwen2.5 1.5B to Llama 3.2 3B).

```json
"ai": {
  "hideOrigins": ["CN"],
  "hideMakers": ["deepseek"],
  "hideModels": ["*-preview"],
  "hideProviders": ["groq"],
  "onlyMakers": []
}
```

| Key | Hides |
| --- | --- |
| `hideOrigins` | every model whose maker is from these countries (ISO 3166 codes, upper case). `["CN"]` hides Qwen (Alibaba), DeepSeek, GLM (Zhipu, Z.ai), Kimi (Moonshot), MiniMax, Baichuan, Yi (01.AI), InternLM, Hunyuan (Tencent), ERNIE (Baidu), Doubao and Seed (ByteDance), Step (StepFun) and the other Chinese makers of the table. |
| `hideMakers` | the makers by id (`qwen`, `deepseek`, `zhipu`, `moonshot`, `openai`...). |
| `onlyMakers` | every maker but these; a model of no known maker is hidden too. |
| `hideModels` | model ids by pattern, `*` for any text (`*-preview`, `gpt-4o*`). |
| `hideProviders` | whole providers by catalog id (`shared/ai/cloud/catalog/*.js`: `groq`, `qwen`, `openrouter`...). |

The maker table is `shared/ai/makers.js` (`MAKERS`: id, name, country, the pattern of its model ids, its own providers);
a model can have two makers (a fine-tune names its base: `deepseek-r1-distill-llama` is DeepSeek's and Meta's) and is
hidden when either is. Hiding by maker or country also hides OpenRouter's routers (`openrouter/auto`), which may pick
any maker. `tests/node/ai-makers.test.mjs` checks that every model id in every catalog has a maker, so a new model cannot
slip past unlabelled; add its maker to the table when it fails. The build writes the field into the
`/*profile:aiModels*/` marker of `makers.js` (`tools/whitelabel/ai.mjs` checks it). Text that names a hidden model (the SEO
pages' examples of Qwen2.5) is changed with `copy`.

### Text recognition (OCR) engines

Slop OCR, Slop PDF (Recognise text), AI Tools (OCR), the Serial counter and Expenses (receipts) read text with one of two
engines (`shared/ocr/engines.js`): PaddleOCR (maker `baidu`, China) and Tesseract (maker `tesseract`, its open-source
project). The `ai` field applies to them like to any model: `"hideOrigins": ["CN"]` hides PaddleOCR (and its models in
the Language and model dialog, the model index and Get more), and every OCR page then reads with Tesseract. The `ocr`
field restricts them further and picks the one used first:

```json
"ocr": { "engines": ["tesseract"], "default": "tesseract" }
```

| Key | Sets |
| --- | --- |
| `engines` | the engines offered (`paddle`, `tesseract`); default all that the `ai` field leaves. |
| `default` | the engine a visitor starts with instead of Auto (they can still choose another one that is offered). |

Auto ranks the models of every offered engine together for the language chosen, most accurate first: PaddleOCR for the
scripts it has a model for, Tesseract for the languages PaddleOCR lacks (Hebrew, Vietnamese, Bengali, Georgian ...).
A visitor's saved engine that the site no longer offers reads as `default`, else Auto. The build refuses a profile whose
`ai` and `ocr` fields leave no engine. It writes the field into the `/*profile:ocrEngines*/` marker of `engines.js`
(`tools/whitelabel/ai.mjs` checks it).

### The rename map

`<id>.map.json` holds every token and folder rename of a build, in one file: `stem` (`["slop", "<new stem>"]`, every case
form: `SlopUI` -> `TlbxUI`, `SLOP_APPS` -> `TLBX_APPS`) and `compounds` (`photoslop` -> `imageeditor`, also the folder:
`/imageeditor/`). A compound can give a folder its own spelling (`"path": "image-editor"`), but code that builds a path
from an id then misses it, so the maps here keep one spelling. English words that contain the stem (slope, sloped, sloppy, SLOPE) are never touched. The map is a
bijection: its targets must not occur in the source (the build refuses a map whose targets do), so the reverse is exact.
`node tools/whitelabel/roundtrip.mjs <id>` proves it over the whole repository; CI runs it on every push.

### Build one locally

```sh
node tools/whitelabel/build.mjs sample /tmp/acme              # the whole site for the profile, scan included
node tools/whitelabel/build.mjs <id> <dir> --profiles=<dir>   # a real profile kept outside the repository
node tools/whitelabel/export.mjs <id> <mirror checkout> --profiles=<dir>   # round trip + build into a mirror's checkout
```

A build copies every file (`git ls-files`), leaves out this brand's own files (licence notices, trademarks, its
workflows' identity checks, the profiles, this tool), renames paths and text through the map, writes the profile's files
(`brand/brand.json`, `CNAME`, `LICENSE`, `NOTICE.md`, `TRADEMARKS.md`, `SECURITY.md`, a README that says "generated - do
not edit", the manifest, logo, favicon, icons, share card and the mirror's own CI workflow), runs the SEO writer and the
precache list inside the copy, and then scans every file name, text line and binary for this brand's words and every
other profile's terms. Any hit fails the build. Serve the folder with any static server to look at it.

### A mascot of your own

`"mascot": { "overlay": "<folder>", "name": "...", "files": [...] }` swaps this site's buddy for a mascot module the
profile supplies. The folder (relative to the profiles folder, kept with the profile) is copied to `brand/mascot/` and
holds two ES modules: `mascot.js` (`name`, `animations`, optional `moments`, `create(el, { reduce })` returning
`{ play(name, { loop, side }), dispose() }`) and `icon.js` (`name`, `svg(size, small)`, no DOM). The buddy's toggle then
loads the mascot slot (`shared/mascot/slot.js`) instead of its engine, and the slot plays a named animation for each of the
buddy's moments (`shared/mascot/moments.js`):

| Moment | Animation | When |
| --- | --- | --- |
| greeting | `hello` | the mascot is shown |
| working | `working` | a task starts (a SlopFlow tile runs, a region is `aria-busy`); it loops while the task runs |
| done / error | `celebrate` / `oops` | the task ends well or fails |
| idle / wake | `sleep` / `wake` | a minute without input; the next input |
| point | `point` | a page sends `mascot-moment` with `{ moment: 'point', target }`, or after the greeting at `[data-mascot-point]` |

Any page may send a moment: `document.dispatchEvent(new CustomEvent('mascot-moment', { detail: { moment: 'done' } }))`.
An overlay that lacks an animation simply skips that moment, and may map a moment to another one (`moments`).

The mascot is a real button (`shared/mascot/ui.js`, logic in `shared/mascot/interact.js`), named after the overlay's
`name`. A click, a tap or Enter / Space opens a small helper menu (Ask the assistant, Search apps, Take the tour of this
page, Tips, Move to the other side, Hide; an item the page cannot do is left out); a long press opens it too. A drag moves
it; the place is remembered on the device and kept clear of the header and the safe areas, and a short drag never opens
the menu. A double click plays `done`; now and then an idle mascot glances aside (not with reduced motion). While it
shows, it is the only presence: the buddy's toggle steps aside and comes back when the menu's Hide is used. In a
plain-tone build it is drawn smaller. The instance `create()` returns may have two optional hooks (a missing one does
nothing):

| Hook | Called |
| --- | --- |
| `look(dx, dy)` | while the pointer moves within about 320 px: its direction, each axis -1..1; `(0, 0)` to look ahead |
| `react(kind, detail)` | `'hover'` `{ on }` (pointer or focus on it), `'poke'` (a tap or long press), `'drag'` `{ dx, dy, shake }` (shake 0..1: how hard it is shaken), `'drop'` |

**Size and roaming.** Two optional fields of `mascot` change how the slot shows it:

| Field | What it does |
| --- | --- |
| `size` | `{ "desktop": <px>, "phone": <px> }`: how tall the mascot is drawn (whole px, 32 to 360; phone: windows up to 700 px wide). The stage is then laid out at that size, so the overlay draws to fill its element. Without it the slot keeps its default (136 px, 84 px in a plain-tone build and 63 px on a phone there); a size of about 170 to 210 px makes a desktop mascot clearly larger. |
| `roam` | `true` or `"float"`: the mascot floats around the page: it rests beside the edges of the content, travels to another clear spot now and then along gentle curves (ease in and out, a soft hover bob, a lean into the direction of travel, no jumps), moves aside when the pointer goes for something it covers, and holds still while the person types. It lives on the page, as the built-in mascot does: while the person scrolls it stays where it was on the page and scrolls away with the content, and once the scroll has been quiet for about 0.7 s it floats after them back into view to a clear spot (a quick trip from just past the window's edge, however far the scroll went; after 1.5 s out of view it comes back even while the scroll goes on). `"hop"`: the same with the buddy's hop arc instead. It never rests on a control, on text or media, or on an area a page marks `data-mascot-avoid`, and stays inside the window below the header. With reduced motion, on a phone or a touch screen it stays docked; a plain-tone build roams calmly. A press or Move to the other side parks it for a while, Hide stops it. It moves by transform only, so the page's layout never shifts. |

The overlay hears the travel through `react('travel', { on, dx, dy, style })` (`on`: a trip starts or ends; `dx`, `dy`: its
direction, -1, 0 or 1) and `look()` turns its eyes the way it goes. The paths are the buddy's own (`shared/roam/path.js`,
shared by both mascots); the roaming is `shared/mascot/roam.js`, the spots `shared/roam/spots.js`. The made-up sample sets
both (`brand/profiles/sample.json`), and `tests/buddy/roam.test.html` checks them.

`files` lists every file of the folder (the build refuses a folder with an unlisted file or a listed file that is missing).
The build writes `LICENSE-ART` (the character's files and the icons drawn from it, all rights reserved, outside the MIT
licence), a `NOTICE.md` item and a `TRADEMARKS.md` that names the character design; with `icon` (default on) the favicon
(the small drawing), the header mark, the app icons and the share card come from `icon.js`. `holder` and `trademarks`
name the character's owner when it is not `legal.holder`; the owner's name is then allowed in the character's files and
the notices only (reported by the scan). The made-up sample uses `brand/profiles/overlays/acme/`.

### The file host (cdn)

The apps download large files (models, engines, font packs) from this site's `cdn` repository at a release tag
(`shared/cdn/assets.js` `TAG`). A build's links name `<github>/cdn` at the same tag. `tools/whitelabel/cdn.mjs` makes that
repository's content for a build: the files the build fetches (its `tools/cdn-assets.mjs`) and the licence and source
notes beside them, read with `git archive` from a local checkout of this site's `cdn` repository at the tag (content only:
none of its commits, authors or history), the notes renamed like the site, and a README. Everything is scanned; bytes
inside a binary that happen to spell the stem and the English word in a speech model's tokenizer vocabulary are the only
allowed hits, and each kind is reported. The publish script commits it as one commit of the profile's author, tags it
with the tag, and pushes it before the site. `--cdn-ref=<tag>` on the build points the links at another tag.

```sh
node tools/whitelabel/cdn.mjs <id> <build dir> <cdn checkout> <out dir> --profiles=<dir>
```

### Languages of the SEO pages

The static SEO pages (landing, task, guide and comparison pages, the head of every app page, the converter pages) are
written in every language whose SEO tables are complete (`shared/seo/HANDOFF.md`, "Languages"). One profile field,
`defaultLang`, decides both the language a visitor starts in and the **root language**: its pages are at the site root
(`/compare/`), every other language in its own folder (`/en/compare/`, `/de/compare/`). `seo.langs` says which other
languages a build publishes:

```json
"seo": { "langs": ["sv", "de"] }
```

- `"all"` (the default, also when the field is left out): every language whose SEO tables are complete.
- A list of the site's language codes (`shared/i18n/i18n.js` `LANGS`: `"sv"`, `"de"`, `"pt-BR"`, `"zh-CN"`...): those
  of them whose tables are complete. It may name the root language; it changes nothing.
- `"none"` (or `[]`): the root language only. No language folders, no language sitemaps, no hreflang, and nothing of
  them is built anywhere.

A language left out has no pages and no hreflang. The language folders are never committed in this repository: they are
written when the site is published (`node tools/seo/write.mjs --langs`, `shared/seo/HANDOFF.md` "Languages"), and a
white-label build writes them into its copy and keeps them (its mirror is the published site, so `build.mjs` drops the
`.gitignore` block that keeps them out of git here). `tools/whitelabel/profile.mjs` refuses any other value.

This site's own value is the marker in `tools/seo/lang.mjs` (`/*profile:seoLangs*/'all'`), which must equal
`seo.langs` in `brand/profiles/slopographic.json` (`tests/node/whitelabel-profile.test.mjs` fails until both agree): set
both, then run `node tools/seo/write.mjs` (the hreflang links and the sitemap index follow).

Why the default language goes to the root: a site for one market is found in that language, and its plain addresses
(`/compare/`) are the ones people share and search engines rank first, so they carry the language its visitors read.
Keeping English at the root of a Swedish site would put English pages at the addresses that matter and the Swedish ones
one folder down. The other languages stay reachable for visitors who search in them, unless the profile keeps a build to
its own market with a short `seo.langs`. One field (`defaultLang`) sets both the start language and the root, so they can
never disagree; the profile's `seo.homeTitle` and `seo.homeDescription` are in that language. The sample `sample-sv`
publishes Swedish at the root and English under `/en/` (`"langs": ["sv", "en"]`).

### Search engines

```json
"seo": { "index": true }
```

- `index` (default `false`, for every profile that does not say `true`): search engines may index the site. This site's
  own profile sets it, and so does every profile of the owner's own sites. With `false`, every page says
  `<meta name="robots" content="noindex">` (links are still followed), `robots.txt` allows crawling (a crawler must read
  a page to see the tag) and names no sitemap, there are no sitemap files, no language folders and no hreflang, and the
  generated SEO pages (landing, task, guide, round-up and compare pages) are not built at all. IndexNow never runs.
- `canonicalTo`: an origin (`"https://tools.example.com"`) every page's canonical points to, with the same path. Without
  it a page's canonical is its own address on the build's origin (`origin`); a build never points at this site.
- `canonicalOverride`: `{ "<path>": "<URL>" }`, the canonical of the pages under a path from the site root ("/pdf/": the
  app, its about, task and guide pages) is the URL with the rest of the path after it; `"=/pdf/"` matches that one page.
  The longest key wins; a page in a language folder (`/sv/pdf/`) is matched without it and keeps it (`/sv/` after the
  origin). Its sitemap leaves those pages out; their hreflang links stay on this site, so the language menu does too.

Why off by default: a fork, or a build of someone else's profile, works as a free mirror of the tools. Its pages say
noindex and credit the original through their canonical, so the copy never competes with the site it came from in
search results. Turn indexing on (`"index": true`) when you publish your own content under your own name.

A copy of an indexed site is not indexed either. The SEO writer puts a host guard at the top of every page's `<head>`
(`tools/seo/robots.mjs`): on any host but the profile's `origin` (and `www.` of it; `localhost`, `127.0.0.1` and a file
stay as they are) it adds the noindex tag, which Google honours after rendering. The production deploy
(`.github/workflows/pages.yml`) also writes the static noindex into every page when it runs in any repository but this
one, as the preview of `testing` does (`preview.yml`). The writer (`node tools/seo/write.mjs`, checked by `--check`)
applies all of it, so every page, new ones included, follows the profile.

### Single-app sites

A domain for one app that links back to the full suite. The profile names the app and the parent site, and hides the
apps it does not keep:

```json
"mainApp": "pdf",
"parent": { "name": "Acme Tools", "url": "https://example.com" },
"apps": { "hide": ["photoslop", "vector", "label", "..."] },
"seo": { "index": true }
```

- The site's root (`/`) is the app: `index.html` is the app's page as the SEO writer writes it, with
  `<base href="pdf/">` first in its head (`tools/seo/mainapp.mjs`), so every relative address, the service worker (scope
  `/`) and the offline list (`tools/pwa-precache.mjs` reads the base) work as on `/pdf/`. Both pages name the root as
  their canonical, so only `/` is in the sitemap. An in-page link (`#...`) stays on the page.
- `parent` adds "More free tools →" to the header (a shared header button that folds into More,
  `shared/parent/parent.js`) and a column to the site footer (`tools/seo/footnav.mjs`). A link into a hidden app's folder
  goes to the same path on the parent (`SlopParent.href`, the one helper: every link on the page, the shell's
  navigation, the footer). Hidden apps' folders stay in the build (the kept apps load scripts from some of them), but
  their pages say noindex and no list, sitemap or generated page names them.
- Search: with `index` true the site publishes only the shown apps' pages (their task, guide, round-up and landing pages;
  the pages of a few apps, `/slop-365/` and `/creative-slop-pro/`, only when it shows them all).
- On the parent (this site), point the app's pages at the new domain with `seo.canonicalOverride`, and set the same
  value as the markers in `tools/seo/site.mjs` (the marker test holds them equal):
  `{ "=/pdf/": "https://pdf.example.com/", "/pdf/": "https://pdf.example.com/pdf/", "/apps/pdf/": "https://pdf.example.com/apps/pdf/" }`.

Recipe, the PDF app: `"mainApp": "pdf"` and hide every app except `pdf` and the apps it works with: `html2pdf` (HTML to
PDF), `ocr` (text from scans), `watermark` (batch watermarks), `convert` (the Convert… dialog's file converter pages) and
`drive` (where the apps keep their files). Hiding any of these sends its links to the parent instead. The made-up
`brand/profiles/sample-single.json` ("Acme PDF") is this recipe.

### Tests in a mirror

A mirror keeps the whole test suite, renamed, and its own CI workflow (`tools/whitelabel/workflow.mjs`, made from this
repository's `rules.yml`) runs all of it the way CI runs it here: the file rules, every Node test, the plan, the browser
suite in its parallel slices and the touch jobs. Nothing is skipped by name. The tests are written for any build:

- **Brand facts.** A test reads the build's switches from `tests/brand-facts.js` (`window.BRAND_FACTS`; Node:
  `tests/brand-facts.mjs`, which also gives the registry and the visible app names): `naming`, `tone`, `mascot`
  (`builtin`, `overlay` or `none`), `media`, `analytics`, `defaultLang`, `hideApps`. They are the code's own profile
  markers, so they always match the build (`tests/node/brand-facts.test.mjs`); here they are this site's profile
  (`tests/node/whitelabel-facts.test.mjs`). A test of a switch checks its contract either way (with media, the tutorial;
  without, none), a test of the start language reads `defaultLang`, and a name is the registry's (`slopAppName`) or a
  made-up fixture name, never one of this site's app names that a plain build replaces.
- **Pages for one side of a switch.** A page about a feature a profile can leave out says so in its head,
  `<meta name="slop-test-needs" content="mascot=builtin">` (`tests/needs.mjs`; `|` between values, `;` between
  conditions), and `tests/run.mjs` runs it only in a build whose facts fit, naming the pages it left out. The buddy
  engine's pages need `mascot=builtin`; a build with its own mascot runs `tests/buddy/overlay.test.html` and the slot
  test with its own overlay; a build without one runs `tests/buddy/off.test.html`.
- **Language.** In a build that starts in another language the harness opens the apps in English, as a visitor who chose
  English (`SlopTest.english()`), so a check reads the copy it was written against; a page about the start language says
  `<meta name="slop-test-lang" content="default">` and reads the build's default and its strings (`SlopTest.said`).
- **Repo-only tests.** The tests about this repository only (its other workflows, its commit identity, its SEO copy
  lengths, the white-label tools) are listed with their reasons in one place, `tests/repo-only.json`, and a build leaves
  those files out.

CI here builds both samples on every push and runs each build's Node tests. On testing and main it also runs each
build's whole browser suite (8 slices per profile) and its touch pages; on a work branch only the pages the plan picks
(tools/ci/plan.mjs, renamed for the build by tools/whitelabel/pages.mjs), or the whole suite when the change is to the
build itself (tools/whitelabel, brand/, the brand facts or a profile marker).

### Colours

A build refuses a profile whose Light or Dark theme reads worse than this site's: text and the accent at 4.5:1 on the
surfaces and on a hover tint, muted text at 4.5:1, borders at 3:1, and text at least as bright (dark) or as dark (light)
as this site's, which the apps' own greys were tested against (`tools/whitelabel/palette.mjs` `themeProblems`; the unit test
also reads a private profile folder from `WHITELABEL_PROFILES`). The accent family in the CSS moves to the profile's hue
with the same luminance, so every contrast the sweep checked here still holds.

### Releases

A release builds each profile with `export.mjs` and pushes the result as one commit on top of the mirror's last release
commit (one commit per release, author from `publish`, a neutral message) to the mirror's `testing` branch. The mirror's
own CI runs there; only a green run fast-forwards `main`, which GitHub Pages serves. Tests for a mirror run on GitHub,
not on the machine that publishes. The publish script refuses to run when the
mirror has a commit it did not make, and names it, instead of overwriting it. The script and the real profiles are kept
outside this repository; CI here builds the samples on every push, so a change that would break a white-label build
fails here first.

### A copy with its whole history

A mirror can also show this site's history commit by commit instead of one commit per release
(`tools/whitelabel/history.mjs`). It walks the source's commits oldest first (the first-parent chain, stepping into a
branch where a merge takes it as it is) and makes one commit per source commit: the build's tree for that commit, in the
profile's `publish` author's name, at the source commit's author time (UTC). It is incremental: a commit transforms only
the paths that changed since the last mapped one and keeps the rest, the build's cheap rewrites follow their inputs
(`brand.json`, the manifest, the pinned cdn links, the mirror workflow), and the slow steps (SEO writer, precache list,
icons) are not run per commit: the build's own files enter with the first commit and the release build goes on top.
Every commit's new files are scanned like a build; a commit that cannot be built from an old tree, or whose files leak,
is folded into the next good one, and a commit that changes nothing in the copy is dropped. The profile's `history`
block can fold an early stretch into one "Initial version" commit and keep paths and words out of every mapped commit.
Messages are mapped like the site, with app names matched in any case and spelling (trailers removed); a part that still
holds a forbidden word or the rename map's target stem, or talks about how the copy or the work was made (agents,
unfinished work, checkpoints, hand-offs), is left out, and a message with too little left becomes a neutral one made
from the areas the commit changed ("Image Editor: updates"). Neutral commits in a row on the same day become one. A
state file (source commit -> copy commit, kept with the publish script) lets the next run continue.
`tools/whitelabel/history-gate.mjs` checks a range before a push: every commit's author, committer, headers and message,
and every file each commit adds or changes.

```sh
node tools/whitelabel/history.mjs sample /tmp/acme-history --source=. --ref=main --rebuild --state-out=/tmp/acme.json
node tools/whitelabel/history-gate.mjs sample /tmp/acme-history main
```

**DNS for a mirror on GitHub Pages:** in the domain's DNS add `CNAME <subdomain> -> <account>.github.io` (for example
`tools -> <account>.github.io`); the build writes the `CNAME` file and the publish script turns Pages on for the
repository with that custom domain. Turn on "Enforce HTTPS" once the certificate is issued.

### Importing a change made in a mirror

```sh
node tools/whitelabel/import.mjs <id> --mirror=<mirror checkout> --from=<mirror commit> --to=<mirror commit> \
  --base=<source commit the --from release was built from> --profiles=<dir>
```

It adds a worktree on a new `wip/import-...` branch, turns every changed path and line back through the map, puts back
the source names the profile replaced on those lines, stages the result and lists what needs a look: lines that hold the
profile's own words (they must not reach this public repository), regenerated files and binaries. It never commits.

### Checklist: a feature that works in every build

- Show an app's name with `slopAppName(app)` (or `app.name`), never a hard-coded brand name in a new string; in HTML,
  `data-app-name="<app id>"` (the header's app name; `shared/i18n/i18n.js` fills it in the chosen language).
- Playful text goes through the copy layer: add the plain wording to `brand/copy/plain.json`, not a second copy of the
  feature.
- Behaviour that differs per site reads a profile flag through a marker (`/*profile:mascot*/true`,
  `/*profile:naming*/'brand'`; values in `tools/whitelabel/emit.mjs` `markerValues`). Never `if (brand === '...')`.
- Colours: use the theme tokens (`--sl-*`) or this brand's accent family, which the palette shift recolours.
- New user-facing strings in the shared chrome get an i18n key (`shared/i18n`).
- A look or wording that only suits one tone: `<html data-tone="playful|plain">` (with `data-naming` and `data-media`) is set
  by `shared/theme/theme.js` before the first paint. Style the plain tone in `style/tone.css` (loaded only in a plain build;
  every rule scoped to `:root[data-tone="plain"]`), mark copy for one tone with the class `tone-plain` or `tone-playful`,
  and give an i18n key a plain wording as `plain.<key>` (the homepage's `tr()` in `home/sections.js` reads it first).
- Tests: names from the registry or made-up fixtures, switches and the start language from the brand facts
  (`tests/brand-facts.js`), a page for one side of a switch tagged `slop-test-needs`; a test about this repository only
  goes in `tests/repo-only.json`.
- Run `node tools/whitelabel/build.mjs sample /tmp/acme` before you push a change that adds brand words; CI does it anyway.
