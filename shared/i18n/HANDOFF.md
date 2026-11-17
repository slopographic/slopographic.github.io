# Language switcher (shared/i18n)

Twenty-nine languages, each with a full table of the shared chrome and of the shared components: English (`en`, the
default and the fallback), Spanish (`es`), French (`fr`), German (`de`), Portuguese (`pt-BR`), Italian (`it`), Arabic
(`ar`, right to left), Swedish (`sv`), Simplified and Traditional Chinese (`zh-CN`, `zh-TW`), Japanese (`ja`), Korean
(`ko`), Hindi (`hi`), Russian (`ru`), Ukrainian (`uk`), Polish (`pl`), Dutch (`nl`), Turkish (`tr`), Indonesian (`id`),
Vietnamese (`vi`), Hebrew (`he`, right to left), and, marked `quality: 'beta'` until a native review, Swahili (`sw`),
Amharic (`am`), Hausa (`ha`), Yoruba (`yo`), Igbo (`ig`), Zulu (`zu`), Xhosa (`xh`) and Afrikaans (`af`). The picker lists
them in `LANGS` order, each by its own name (`name`; `en` is the English name, for search). Apps translate their own
text with tables of their own: the recipe is `APPS-HOWTO.md`, the progress `COVERAGE.md`, the terms `glossary-<code>.md`.

## Files
- `i18n.js`: `window.SlopI18n`. The language list (`LANGS`), `t(key, vars)` (plural forms by `vars.n`), `has(key)`, `label(v, vars)`,
  `get()`, `set(code)`, `apply(scope)`, `add(code, dict)`, `source(spec)`, `need(code)`, `ready()`, `on(fn)`, `num()`,
  `date()`, `money()`, `list()`, `plural(n)`, `lang(code)`, `langs()`, and `create(opts)` for an independent instance.
- `strings.js`: the English chrome table: the top bar and home link, the Apps button and switcher, the Settings labels,
  the homepage footer, the consent strip, the support card, the common menu words (`menu.*`) and the storage text.
- `<code>.js` (one per language): the chrome table. Each must hold every key in `strings.js`, with the same
  `{placeholders}`, and keep the brand names (Sloppo, Slopographic, the app names).
- `ui/en.js` and `ui/<code>.js`: the words of the shared components (`ui.*`: SlopUI dialogs, SlopFrame, sheets, menu
  buttons, the SlopCmd palette and shortcut editor, tours, SlopIntake/SlopOuttake, drop panels, document tabs, view modes).
- `sv-apps.js`: Swedish app names, `app.<id>` and `apptag.<id>`, for every id in `shared/apps.js`
  (`tests/node/i18n-sv.test.mjs`). It loads after `sv.js` because the `sv` entry has `appNames: true`.
- `apps/<code>.js`: the app words at run time (`seo.reg.<id>.title` / `.tagline`, the homepage strip `seo.mq.<id>`, the
  footer's round-up, guide and converter links `seo.foot.*`), written by `node tools/seo/write.mjs` (`tools/seo/apptables.mjs`)
  from the SEO tables (`shared/seo/i18n/<code>/reg-*.js`, `best-*`, `guide-*`) and the convert tables: never edit them,
  translate the SEO tables. `i18n.js` loads the chosen language's file (`APP_LANGS`, rewritten by the same tool), and
  English's (strip and footer only: the registry has the English titles) only once another language is in use. Pages read
  them through `shared/apps.js`: `slopAppTitle(app)`, `slopAppTagline(app)` (and `slopAppLabel` on the homepage), English
  where a language has none; brand names never change (`tests/node/app-words.test.mjs`, `tests/home/home-lang.test.html`).
- `early.js`: the first frame in another language (Loading, below); precached with `i18n.js`.
- `script/<script>.css`: per-script font fallbacks and line breaking (World-ready, below).
- `settings/language.js`: the Language picker in Settings > Appearance (lists `LANGS` in order, `(beta)` after a beta one).
- `tools/i18n/`: the extractor, the checker and the coverage report (`APPS-HOWTO.md` § 6).
- `switcher.js`: `window.SlopLangSwitch`, the header's language button (a globe and the current code, `EN`, `SV`). The
  shell loads it and `shell/header.js` mounts it in every header, the homepage's included. Its menu (SlopMenuButton,
  loaded on the first open) lists all `LANGS` in order by each language's own name (`name`), the current one checked, and
  a choice goes through `set()`, the same setter as Settings (whose picker follows it on `slop-lang`). With more than 10
  languages the menu gets a filter box that matches the own name, the code and the English name (the entry's `en`, else
  `Intl.DisplayNames`); an entry with `quality: 'beta'` shows a "beta" tag (`shell.beta`). The button re-renders on
  `slop-lang` and `slopi18n` (the new tables are in). In a full header it is the first button to give way
  (`data-hbtn-yield="0"`, `shared/ui/hbtn.js`). It is not a language file: the one-file-per-language test skips it.
- Placeholders on marked elements: `data-i18n-vars` (JSON) fills `{name}` in `data-i18n` and `data-i18n-attr` text, and
  `{brand}` is always the brand profile's name (`brand/brand.js`); it re-applies on `slopbrand` when the name changes.

## Loading
- A page loads `i18n.js` once (in its `<head>`, after `shared/profile/profile.js` and `shared/theme/theme.js`, or through
  `shell/shell.js`). `i18n.js` fetches its own tables: English and the chosen language, for the chrome
  (`strings.js` + `<code>.js`), the shared components (`ui/<code>.js`) and any app that registers a source (its
  `i18n/index.js`). Nothing is fetched for the other languages.
- In the `<head>` it writes the tables into the page while it is parsed (`document.write` of same-origin scripts), so
  they run before the page's own scripts and the first paint is in the right language, with no layout shift.
- While the page is parsed in a language other than English, `i18n.js` also writes `early.js` (before the tables), whose
  MutationObserver fills each marked element as the parser adds it (`SlopI18n.fill`, before the next frame), so the first frame already reads in that language; `apply()` at DOMContentLoaded then
  fills the rest (an app's later tables). `tests/node/first-paint-lang.test.mjs` holds the homepage's HTML back after the
  hero and checks the header and hero there.
- Later (a language change, another tab's change, or `i18n.js` added by the shell) it appends them, applies the marked
  elements once they are in, and fires `slopi18n` on `window` (`SlopI18n.on(fn)`); `slop-lang` fires at once on `set()`.
  The shell marks its own tag `data-late` and waits for `SlopI18n.ready()` before it mounts the header.
- An offline single-file copy (`<meta content="offline">`) fetches nothing: its manifest embeds the English tables.

## World-ready
- `<html lang>` and `dir` follow the language (`apply()`); `ar` and `he` are right to left.
- Fonts: the brand fonts carry Latin only. A language with `script` in `LANGS` (`han-sc`, `han-tc`, `jpan`, `kore`,
  `deva`, `ethi`, `hebr`, `cyrl`, `viet`) also gets `script/<script>.css`: `@font-face` rules that add that script's
  glyphs to the brand families from fonts already on the device (`local()` only: nothing heavy is downloaded), plus line
  breaking (`line-break: strict` for Chinese and Japanese, `word-break: keep-all` for Korean) and a taller line for
  Devanagari and Ethiopic. Other text falls back to the browser's font for the page's `lang`.
- Numbers, dates, money and lists: `SlopI18n.num/date/money/list` (Intl in the chosen language). A number passed in
  `vars` is formatted the same way; pass a string for ids and years.
- Plurals: `t('k', { n })` reads `k#<Intl.PluralRules category>` and then `k` (`APPS-HOWTO.md` § 2).
- Text expansion: keep labels short; German and Russian run 30% longer. `tests/i18n/pdf-sv.test.html` checks the PDF
  editor's top bar at 390 px in German.

## Default language (brand profile)
`DEFAULT` (`en`) is the fallback: a key missing in the chosen language is read from English. `DEFAULT_CHOICE` is the
language a visitor gets when nothing is stored. It is written as one line, `var DEFAULT_CHOICE = /*profile:defaultLang*/'en';`,
and the white-label build (`tools/whitelabel`) rewrites the literal after the marker from the profile's `defaultLang`
(a profile with `"defaultLang": "sv"` starts in Swedish). Keep the marker and the literal on one line. Every language stays in the picker
on every build; only the starting choice changes. `create({ defaultLang })` overrides it in tests.

## A page in one language (data-lang-page)
A static SEO page and every copy in a language's folder (`/sv/pdf/`, tools/seo) say their language in the HTML:
`<html lang="sv" data-lang-page="sv">`. `create()` then reads that page in it (it wins over the stored choice until
`set()`), and a page language other than `DEFAULT_CHOICE` is also stored as the visitor's choice, so the apps they open
from there follow it. The header switcher (`switcher.js` `pick`) on such a page goes to the same page in the language
picked, its `<link rel="alternate" hreflang>`, when there is one.

## Storage
The choice is `SlopProfile` appId `lang`, key `mode` (default `DEFAULT_CHOICE`), so it lives in the `slop-profile` key with the
other settings and survives a reload. An unknown stored code reads as the default choice. Choosing the default choice clears the override.
A change in another tab re-applies on `storage`.

## Adding a language
1. Add an entry to `LANGS` in `i18n.js`: `L('fr', 'Français', 'French', 'ltr')`, with `{ quality: 'beta' }` until a native
   speaker has reviewed it and `{ script: '...' }` when it needs a script stylesheet. Use a BCP 47 code.
2. Add `shared/i18n/<code>.js` (every key in `strings.js`), `shared/i18n/ui/<code>.js` (every key in `ui/en.js`) and
   `shared/i18n/glossary-<code>.md`. `node tools/i18n/i18n.mjs --check` fails until both tables are complete.
3. Apps add the language by adding `<app>/i18n/<code>/` and running `node tools/i18n/i18n.mjs index <app>`; until then
   that app reads English in it, key by key.
4. Run `node tools/i18n/i18n.mjs coverage --baseline`.

## Right-to-left (rule)
- `apply()` sets `lang` and `dir` on `<html>` from the language's entry in `LANGS`. An entry with `dir: 'rtl'` (Arabic
  today; Hebrew, Persian, Urdu later) turns the page right to left at once; every other entry sets `dir="ltr"`.
- The shared chrome uses logical properties, so it mirrors with `dir`: the header (`shell/shell.css`: `.sh-hdr`,
  `.sh-fab`, `.sh-opt`), the switcher, the consent strip (`shared/consent/banner.css`: `inset-inline`) and the support
  card (`shared/support/support.css`: `inset-inline-end`). Write new chrome CSS the same way: `margin-inline-start`,
  `inset-inline-end`, `text-align: start`, never `left`, `right` or `text-align: left` in those files.
  `tests/node/i18n.test.mjs` fails when a physical side returns to those rules.
- The notification panel and bell (`.sn-*`), the app drawer (`.sh-dr`) and drag markers (`.sh-drop-*`) still use
  physical sides. They are not mirrored yet, so change them the same way before a right-to-left page relies on them.
- An app's own CSS is not checked here. Before an app is shown in Arabic, check it mirrored in a browser.
- The Arabic table is `complete`: it has every key. The shared chrome was checked mirrored in a browser (the header,
  the cookie strip, the Ledger header); `tests/i18n/rtl.test.html` checks the attribute, the header and its margin.

## Adding strings
1. Add the English text to `strings.js` (shared chrome) or to the app's own table (an app-specific `<app>.*` table).
   Use dotted keys grouped by where they appear (`nav.*`, `shell.*`, `switcher.*`, `consent.*`, `support.*`,
   `menu.*`, `footer.*`, `settings.*`), and add the same key to every language file.
2. Mark the HTML. Text goes in `data-i18n`; attributes in `data-i18n-attr="attr:key"` (several separated by `;`):

   ```html
   <a class="tab" href="#apps" data-i18n="nav.apps">Apps</a>
   <button data-i18n-attr="aria-label:menu.close;title:menu.close">Close</button>
   ```

   Keep the English text inside the element. It is the fallback if the script fails to load.
   Placeholders on a marked element come from `data-i18n-vars` (JSON, `data-i18n-vars='{"app":"Slop PDF"}'`), and
   `{brand}` is always the brand profile's name (`SlopBrand.config.name`; the page re-applies on `slopbrand`), so
   `'Install {brand}'` names a white-label build's own brand.
3. For text built in JavaScript, call `SlopI18n.t('key', { name: value })`. `{name}` placeholders are filled from vars and
   left as they are when a var is missing. Values go in as text, never as HTML. Elements built in JS can carry
   `data-i18n` too, so a later `apply()` (on a language change, or at boot) updates them.
4. Mark an element only when its whole text is the string. `apply()` replaces `textContent`, so an element with child
   elements (a `<strong>` or `<a>`) needs its text wrapped in a `<span data-i18n>`. Do not mark elements that other
   scripts set (`data-brand-name`, `data-brand-footer`, the status board, the catalog).
5. Call `SlopI18n.apply()` again after you render text from JavaScript into a marked element.

## Tests
- `tests/node/i18n.test.mjs`: the language list (names, codes, directions, English names, the beta flag, English first),
  one file per language adding under its own code, `t()` fallback and vars, the stored choice, `apply()` on a fake DOM
  (`dir="rtl"`), every chrome table holding every English key with the same placeholders, the logical-property CSS, and
  every chrome key the shell, the consent strip, the support card, the homepage and Settings use existing in English.
- `tests/node/i18n-load.test.mjs`: the lazy loading (only English and the chosen language, written at parse time, appended
  later with `slopi18n` after), an app's `index.js`, the offline copy fetching nothing, the script stylesheets, plural
  forms through `Intl.PluralRules`, and `num/date/money/list`.
- `tests/node/i18n-tables.test.mjs`: the checker (`tools/i18n`) finds nothing, `COVERAGE.md` and
  `tests/i18n/tables.covers.txt` are current, the ratchet (`tests/node/i18n-coverage.baseline.json`), the shared tables
  complete in every language, and the extractor's heuristics.
- `tests/i18n/switch.test.html`, `tests/i18n/rtl.test.html`: the Settings picker (all languages, own names, beta), Spanish
  across pages, Arabic and Hebrew right to left.
- `tests/i18n/pdf-sv.test.html`: the PDF editor in Swedish (menus, rail, File menu, no key showing), a live switch to
  English and back, the top bar at 390 px in Swedish and German, and a language the editor does not ship reading English.
- `tests/node/i18n-switcher.test.mjs`: the header menu's rows from all 29 `LANGS` (own names, beta tags, English-name
  search), a choice through `set()` stored as Settings stores it, the header strings in every language,
  `data-i18n-vars` and `{brand}`.
- `tests/i18n/header-switch.test.html`: Svenska from an app header and from the homepage, the keyboard, Arabic at 390 px
  (`dir="rtl"`, the header still fits), Settings following the header.

## Storage and offline
- The service worker precaches `i18n.js`, `strings.js`, `ui/en.js` and each app's `i18n/index.js` with its English
  parts (`tools/pwa-precache.mjs` follows them). The chosen language's tables are cached the first time they load
  (network first, then the cache), so a page works offline in the language it was last used in.
- An offline single-file copy (`shared/offline/manifest.js`) embeds the English tables and runs in English.

## Still English
- **Every app but the PDF editor**: its own text (menus, toolbars, panels, dialogs, toasts, palette titles, tours).
  `COVERAGE.md` ranks them by strings to translate; `APPS-HOWTO.md` is the recipe.
- **The PDF editor** in the languages it does not ship yet (`pdf/i18n/<code>/` missing): its own words read English,
  the shared chrome and components are translated.
- **Shared code** outside the components in `ui.*`: the app families' shared modules (office, biz, watermark, ai, ...),
  notifications (`shell/notify.js`) and the drawer (`shell/drawer.js`); their CSS is not mirrored yet (Right-to-left).
- **Homepage and Settings** paragraphs that are not marked (privacy explanations, the exchange-rate and defaults bodies).
- **SEO pages** (`tools/seo`): written in every language whose SEO tables are complete (`shared/seo/i18n`, Swedish
  today), each at its own URL (`/sv/...`; shared/seo/HANDOFF.md, "Languages"). The about pages, How it works and the
  typeface page are still English only, and so is any text of an app page or the homepage that is not marked.

## The SlopI18n API

From the head comment of `shared/i18n/i18n.js` (kept here so the script stays under 300 lines):

Use: t(key, vars) gives the text (English when the language lacks the key, the key itself when English lacks it too).
A number vars.n picks a plural form: 'key#one', 'key#few', ... (Intl.PluralRules of the language), else 'key'.
apply() sets lang and dir on <html> and replaces the text of [data-i18n="key"] elements and the attributes listed in
[data-i18n-attr="attr:key"] (several separated by ';'), filling {placeholders} from the element's data-i18n-vars (JSON)
and {brand} from the brand profile (brand/brand.js). num(), date(), money(), list() format with Intl in the language.
label(v, vars): t(v) when v is a known key, v() when a function, else v (how shared components take labels).
on(fn) calls fn whenever the language changes and its tables are in ('slopi18n' on window). at(code, locale): t/num/date/
money/list in another language, the page unswitched (a printed document; need(code, false, ns) first); shipped(ns): its langs.
create(opts) makes an independent instance (used by the node tests). See shared/i18n/HANDOFF.md and APPS-HOWTO.md.
