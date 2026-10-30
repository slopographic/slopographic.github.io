# Section router: handoff

`shared/router/router.js` (`window.SlopRoute`) gives every app URL parameters for its sections, such as
`?view=export`, `?panel=history`, `?doc=...` or `?tool=...`. It sits on `shared/urlstate` (`SlopUrlState`), so it
keeps unknown parameters and the `#hash` as they are. Load order on a page: `urlstate.js`, `router.js`, then the app.

## API

```js
const R = SlopRoute.register('hex', {
  params: {
    find: { values: ['hex', 'text'], def: 'hex' },          // a fixed list
    doc:  { pattern: /^\S{1,120}$/, def: '' },               // an id that must match
    page: { int: true, min: 1, max: 999, def: 1 },           // a whole number
    q:    { def: '', max: 120, legacy: ['find-text'] },      // text, cut to max; legacy: old names still read
  },
  apply(state, why) { ... },          // why: 'load' (on register) or 'popstate' (back and forward)
  hash: (h) => ({ find: 'text' }),    // optional: an old #hash link, read on load only
});
R.get('find')          // the current value
R.has('find')          // true when the link named it (not just its default)
R.state()              // every value, defaults filled in
R.set({ find: 'text' })                 // replaceState; a value equal to its default removes the key
R.set({ find: 'text' }, { push: true }) // a navigation: one history entry (back and forward walk it)
R.link()               // the absolute URL of the current state (for Copy link)
SlopRoute.describe('hex')   // printable lines: every parameter, its values and default
SlopRoute.describe()        // every app on the page
SlopRoute.list('hex')       // the same as data
```

## Rules

- A value outside its list, pattern or range gives the default. Text is cut to `max` characters.
- A value equal to its default is removed from the URL, so plain links stay short.
- `apply` runs on load and on popstate only. A `set` never calls it, so the app updates its own UI first.
- `legacy` names are read when the new name is absent, and dropped the next time the app writes the parameter.
- Put a parameter in the URL only when it is a section or a view option: never typed content, never a secret.
- `has(name)` lets an app keep its saved place when the link names nothing.

## Parameters per app

Each app lists its parameters with `SlopRoute.describe('<app>')` in the browser console. Unless noted, a parameter
is read on load and written when the person changes it.

| App (id) | Page | Parameters |
|---|---|---|
| `photoslop` | `/photoslop/` | `tool=<tool id>`, `panel=<panel id>` (history, layers, brushes, ...). `?tour=1` is kept. |
| `vector` | `/slopvector/` | `tool=<tool id>`, `panel=properties\|appearance\|layers\|swatches\|gradient\|align\|pathfinder` |
| `slopcut` | `/slopcut/` | `pane=media\|effects\|insp\|timeline\|preview` |
| `docs` | `/docs/` | `outline=open\|shut` |
| `slides` | `/slides/` | `slide=<n>` (1 for the first); applied when the deck is ready |
| `tables` | `/tables/` | `side=open\|collapsed` |
| `press` | `/press/` | `tool=<tool id>`, `panel=pages\|layers\|props\|swatches\|parastyles\|charstyles` |
| `contacts` | `/contacts/` | `group=recent\|cat:<name>\|stage:lead\|contacted\|customer\|lost`, `f=<filters>`, `view=cards\|table` |
| `drive` | `/drive/` | `s=folder\|recent\|starred\|trash`, `cwd=<folder id>`, `v=<view>`, `sort=<key>`, `dir=1\|-1`, `q=<search>`, `f=<file id>`. Old `drv.*` links still work (legacy). |
| `label` | `/label/` | `panel=props\|objects\|vars\|data`. The print form keeps its `#form=` hash (the whole form, not a section). |
| `ocr` | `/ocr/` | `page=<n>` (applied once, when the first pages arrive), `boxes=0\|1` |
| `convert` | `/convert/` | `to=<format>`, the target format (applied when the converter has its formats) |
| `calc` | `/calculator/` | `expr=<calculation>` (read on load, as before; never written), `panel=tape\|history\|convert` |
| `eml` | `/eml/` | `view=html\|text`, the body view, applied when a message opens |
| `hex` | `/hex/` | `find=hex\|text` |

Old links: `?expr=` (calculator), `?drv.*` (Drive), `#form=` (label print form), `?tour=1` (PhotoSlop) and `?drive=`
(Hex, Slop Drive launches) all keep working. Other apps are unchanged.

Tests: `tests/router/router.test.html` (`node tests/run.mjs router`).
