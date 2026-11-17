# SEO copy tables (shared/seo/i18n)

The words of every static SEO page (task pages, guides, the comparisons, the landing pages, the hubs, the converter
pages and the head copy of the app pages) are string tables, one folder per language, like an app's
(`shared/i18n/APPS-HOWTO.md`). Node reads them (`shared/seo/i18n.mjs`, for `tools/seo/write.mjs`); no page loads them.

```
shared/seo/i18n/index.js          generated: the parts and the languages (node tools/i18n/i18n.mjs index seo)
shared/seo/i18n/en/<part>.js      English, the source of every key
shared/seo/i18n/<code>/<part>.js  one folder per language: the same parts, the same keys
```

The facts stay out of the tables, in the fact files next to them: slugs, app ids, URLs, the sources of a comparison,
the date its facts were checked, the marks of a feature table (yes, no, partial, unknown), image paths, app presets.
`shared/seo/i18n.mjs` `hydrate()` joins the two: a key's path after the item's prefix is where its text goes
(`seo.task.pdf.merge-pdf-files.faq.0.1` is the answer of the first question of that task), and a fact file's string
`'@<key>'` is that key's text (the same sentence used twice in one family, or a shared phrase: `seo.install.*`, `seo.ai.*`).

| Keys | Fact file | Part |
| --- | --- | --- |
| `seo.task.<app>.<slug>.*` | `shared/seo/tasks/<family>.mjs` | `task-<family>` |
| `seo.best.<slug>.*` | `shared/seo/roundups/<family>.mjs` | `best-<family>` |
| `seo.guide.<app>.<slug>.*` | `shared/seo/guides/<family>.mjs` | `guide-<family>` |
| `seo.home.*`, `seo.app.<id>.*`, `seo.about.<id>.*`, `seo.page.<folder>.*` | `shared/seo/copy.mjs` | `copy` |
| `seo.landing.<id>.*` | `shared/seo/landing-copy.mjs` | `landing` |
| `seo.install.*`, `seo.ai.*` | `install-copy.mjs`, `ai-copy.mjs` | `common` |
| `seo.ui.*` | the page templates in `tools/seo` | `ui` |
| `seo.aboutpage.<id>.*`, `seo.ui.about.*` | the about pages' templates, `shared/seo/pages/about/<id>.html` | `about-a`, `about-b` |
| `seo.how.*` | How it works, `shared/seo/pages/how-it-works.html` | `how` |
| `seo.reg.<id>.*` | written from `shared/apps.js` (title, tagline, features) | `reg-*` |
| `seo.cv.<slug>.*` | written from `convert/js/core/*pages*.js` | `cv-*` |
| `seo.cvx.<slug>.<n>` | the converter pages' own extra lines (what each accepts) | `cv-page` |

The `reg-*` titles and taglines, the round-ups' and guides' names and the strip's labels also reach the pages at run time:
`tools/seo/apptables.mjs` writes them into `shared/i18n/apps/<code>.js` (small, one per language), so a translation here
is the one translation of an app's title on the homepage cards, the finder, the switcher, the globe and the footer.

`reg-*` and `cv-*` in English are written by `tools/seo/tables.mjs` (run by `node tools/seo/write.mjs`, checked by
`--check`) from the registry and the converter page lists, which stay the one source of those words; edit them there.
A part has at most 300 lines (split as `-a`, `-b`). The about pages and How it works are templates (`tools/seo/template.mjs`):
a `{{key}}` slot takes the key's text as HTML, so a text there may hold the page's inline tags (`<code>`, `<strong>`, a link,
`<span class="yes">`): a translation keeps every tag and attribute as it is and translates the words around them.

## Adding or changing copy

Add the English key to `en/<part>.js` (the facts to the fact file), run `node tools/seo/write.mjs`. A new key makes every
published language incomplete until it is translated: `node tools/i18n/i18n.mjs --check` names the missing keys and
the language stops being published (`write.mjs` lists the languages it built and why the others were left out). Add the
translation in the same change.

## A new language (the translators' brief)

1. `node tools/i18n/i18n.mjs todo seo <code>` lists every key the language lacks, as table lines, by part.
2. Write `shared/seo/i18n/<code>/<part>.js` for every English part: the same keys in the same order, one per line,
   `window.SlopI18n && window.SlopI18n.add('<code>', { ... });`. Then `node tools/i18n/i18n.mjs index seo`.
3. Rules:
   - Natural language for that market, as a good software site writes it; the language's glossary
     (`shared/i18n/glossary-<code>.md`).
   - `.title`: at most 75 characters, keep its suffix (` | Slopographic`, ` | File convert`). `.description`: 120 to 160
     characters for Latin, Cyrillic, Greek, Arabic, Hebrew, Devanagari and the others; 45 to 110 for Chinese and
     Japanese, 55 to 130 for Korean (`tools/seo/head.mjs` `descLimits`). Every title and description unique.
   - Never change a fact: numbers, prices and currencies, sizes, versions, limits, dates, product, plan and feature names
     of other vendors, file formats, shortcuts and code stay exactly as written. Translate the words around them, and keep
     every condition ("on paid plans", "only in Chrome"). The sources and their links are facts; a source's label is
     translated.
   - A button, menu or command of one of our apps: the label that app shows in that language (its `<app>/i18n/<code>/`
     tables), when it has one.
   - Brand and app names stay (Slopographic, PhotoSlop, Slop PDF, File convert...); never write "Slop" in another script.
   - Keep every `{placeholder}`; a key with `#one` (plurals) needs the forms the language uses.
4. `node tools/seo/write.mjs` publishes the language once every key is there: the hreflang links of every page and the
   sitemap index; its pages at `/<code>/...` and its sitemap are written when the site is published (`--langs`; run it
   to look at them locally, git ignores them). `node tools/seo/write.mjs --check --all` and `node tools/i18n/i18n.mjs
   --check` pass.
