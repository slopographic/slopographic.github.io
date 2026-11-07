# Translating an app: the recipe

One app at a time, one agent per app (or per language of an app). The PDF editor (`pdf/`) is the worked example: copy
what it does. The framework is `shared/i18n/i18n.js` (`SlopI18n`); the shared words live in `shared/i18n/strings.js`
(`nav.*`, `shell.*`, `menu.*`, ...) and `shared/i18n/ui/en.js` (`ui.*`); the language list is `LANGS` in `i18n.js`.

## 1. Where the strings go

```
<app folder>/i18n/index.js            generated: names the parts and the languages (node tools/i18n/i18n.mjs index <id>)
<app folder>/i18n/en/<part>.js        English, the source of truth for the app's keys
<app folder>/i18n/<code>/<part>.js    one folder per language, the same parts and the same keys
```

A part is a file of at most 300 lines (the repo rule): split by area (`app.js`, `menus.js`, `panels.js`, ...). Each
file is one call:

```js
/* Slop PDF, English: the top bar and the empty view. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('en', {
  'pdf.app.drop_title': 'Drop PDFs here',
  'pdf.app.pages_n': '{n} pages',
  'pdf.app.pages_n#one': '{n} page',
});
```

One key per line, single quotes, the language code in `add()` equal to the folder name. The app's page loads the
tables in its `<head>`, after `shared/theme/theme.js` and its `<link rel="expect" ...>` (which must follow the theme
script directly, `tests/node/render-ready.test.mjs`):

```html
<script src="../shared/i18n/i18n.js" data-src="shared/i18n/i18n.js"></script>
<script src="i18n/index.js" data-src="<app folder>/i18n/index.js"></script>
```

`i18n.js` then writes the English tables and the chosen language's tables into the page while it is parsed, so they
run before the app's own scripts: the first paint is already in the right language (no layout shift). Only English
and the chosen language are fetched; a language without a folder is not fetched and reads English. On a language
change the new tables are added and `slopi18n` fires (below). Offline single-file copies (`shared/offline/manifest.js`)
list `shared/i18n/i18n.js`, `shared/i18n/ui/en.js`, `<app>/i18n/index.js` and every `<app>/i18n/en/*.js` in `files`
and at the start of `scripts`; they run in English.

### Shared components (shared/, shell/)

The words of a shared component go in `shared/i18n/ui/<code>/<part>.js` (keys `ui.<area>.<name>`, one part per area:
`ai.js`, `calc.js`, ...; at most 300 lines, so `ai2.js` when it grows). Every page loads them with `ui/<code>.js`
(`UI_PARTS` in `i18n.js`, written by `node tools/i18n/i18n.mjs index ui`), English and the languages with a folder;
a language without one reads English. `ui/<code>.js` itself stays the base table every language has in full. The
business suite's words are `shared/biz/i18n` (keys `biz.*`, loaded by the business pages); another
`shared/<area>/i18n/index.js` works the same way (`index <ns>` writes it). The checker and the coverage report read
them all (`APPS-HOWTO.md` § 6). An offline single-file copy lists the English parts it needs in
`shared/offline/manifest.js`.

## 2. Keys

- `<app id>.<area>.<name>`: the registry id (`pdf`, `vector`, `slopedit`), not the folder. Lower case, digits and `_`.
  The area is where the text appears (`menu`, `cmd`, `panel`, `dlg`, `toast`, `tour`, ...); the name says what it is
  (`open_files`, `rotate_right`), not what it says in English, so a later rewording keeps the key.
- Placeholders: `{name}`. Never build a sentence from pieces (`'Delete ' + n + ' pages'`): one key with `{n}`, so every
  language can order its own words. A number in vars is formatted with `Intl` (grouping: `1 234`); pass a string for
  page labels, years and ids.
- Plurals: give `vars.n` as a number. `t()` reads `key#<category>` for that language's `Intl.PluralRules` category
  (`zero one two few many other`), then `key`. English writes `key` (other) and `key#one`; Polish, Russian, Ukrainian
  add `#few` and `#many`; Arabic all six; Chinese, Japanese, Korean, Vietnamese, Indonesian need only `key`.
- Words the shared tables already have: use them, do not copy them. `menu.file`, `menu.edit`, `menu.view`,
  `menu.help`, `menu.save`, `menu.open`, `menu.export`, `menu.print`, `menu.cancel`, `menu.ok`, `menu.close`
  (`strings.js`), and the `ui.*` keys in `shared/i18n/ui/en.js` (Yes, Done, Delete, Undo {what}, Untitled, ...).

## 3. Code

- Static HTML: `data-i18n="key"` for the text, `data-i18n-attr="title:key;aria-label:key2"` for attributes. Keep the
  English inside the element (it is the fallback). An element with child elements: wrap its text in a `<span data-i18n>`.
- An app's name (the header's, a link to another app): `data-app-name="<app id>"`. `apply()` writes `slopAppName(id)`
  there, the name the app list shows in that build and language (as the `aria-label` when the element has one). In
  script, `slopAppName(id)`; never a second copy of the name.
- Script: `SlopI18n.t('key', vars)` (the PDF app has `U.t`). Call it when the UI is built, never at load time into a
  constant (a constant keeps the old language): a list of labels becomes a function or a list of keys.
- Live switching: menus, dialogs, toasts and palettes built on open pick the language up by themselves. UI built once
  (a toolbar, a rail, a panel, a status bar) must follow a change: mark its elements with `data-i18n` /
  `data-i18n-attr` (then `apply()` updates them), or re-render it from `SlopI18n.on(fn)` (the PDF app has `U.onLang`).
  The `slopi18n` event on `window` fires after the new tables are in; `slop-lang` fires at once.
- Shared components take keys: a label, title, noun or verb given to SlopSheet, SlopResizePanel, SlopFrame
  (`panelLabel`, `listLabel`), SlopMenuBar (menu titles, item and tool labels), SlopDrop (`label`, `hint`, `chooseLabel`,
  `preview.steps`, `preview.picture.alt`, `sample.label`), SlopIntake (`noun`), SlopOuttake (`verb`, one key with `{app}`),
  SlopFlow (`label`, `onTo` label), SlopConfig (`registerKind` label and description), SlopList (`label`, a text `empty`, and
  `count`: one plural family such as `invoices.li.count` with `#one`, `#few`, ..., never a `[singular, plural]` pair), SlopBiz.panel (`label`) and SlopWatermarkPanel (`toggle.label`, `actions[].label` and `title`) may be an i18n key or a function
  (`SlopI18n.label(v, vars)`: a string that is a known key is translated, a function is called, other text is shown as
  given). Pass the key (`label: 'diff.drop.label'`), not `t('diff.drop.label')`: the component reads it again on every
  language change. Never mark a component's nodes from the app.
- SlopCmd: the title, group and description of each command come from `t()`; register them again from
  `SlopI18n.on(...)` so the palette follows a switch. Never translate command ids, argument names or AI tool names
  and descriptions written for agents (they are API).
- Numbers, dates, money, lists: `SlopI18n.num(n)`, `.date(d, opts)`, `.money(n, 'SEK')`, `.list(['a', 'b'])`.
- `i18n-ignore` in a line's comment tells the extractor that line has no user text (a format name, sample content).

## 4. What not to translate

Brand and app names from the registry (`Slop PDF`, `PhotoSlop`, `Slop Drive`, `Slopographic`, `Sloppo`), file formats
and extensions (PDF, PNG, `.html`), keyboard keys in shortcuts (`Ctrl+S`), command ids, URLs, units in data, the
user's own content, sample documents, log lines and errors thrown for developers (`console.*`, `throw new Error`).
Translate everything a person reads: labels, tooltips (`title`), `aria-label`, `placeholder`, empty states, errors and
toasts shown to them, tour steps, palette titles.

## 5. Translating a table

Copy `en/` to `<code>/`, change the code in each `add()`, translate the values. Write natural UI language for that
language, as its versions of Office or Acrobat would (`Sida`, `Rotera`, `Ta bort`, `Spara som`), not word for word;
keep it short (buttons at 390 px). Use the language's glossary, `shared/i18n/glossary-<code>.md`, and add a term there
when you choose one. Keep every `{placeholder}`. Then `node tools/i18n/i18n.mjs index <id>` (adds the language).
`node tools/i18n/i18n.mjs todo <id> <code>` lists the keys a language still lacks.

## 6. Check and test

```
node tools/i18n/i18n.mjs extract <id>         what is still hard-coded (--prose for the doubtful ones)
node tools/i18n/i18n.mjs --check              every key in every shipped language, same placeholders, keys exist
node tools/i18n/i18n.mjs coverage --baseline  shared/i18n/COVERAGE.md and the ratchet (never goes down)
```

`tests/node/i18n-tables.test.mjs` runs the checker and the ratchet, and needs every table file listed in
`tests/i18n/tables.covers.txt` (`node tools/i18n/i18n.mjs index <id>` rewrites it). Add a browser test like
`tests/i18n/pdf-sv.test.html`: the app in one language shows its words, no key is visible (`/\bpdf\.[a-z_]+\./`),
and switching to English switches back live.
