# Random business templates: handoff

**Status: working.** `generateTemplate(seed)` is a pure function that returns a Docs document (the `.sdoc` JSON
from `docs/js/model/doc.js`) plus a summary of its choices. Docs uses it for File ▸ New ▸ Random template and the
toolbar's Random button. It is the only template generator in Docs; slides and tables have their own.

## Files
- `generate.js`: `generateTemplate(seed) → { seed, vars, doc }`, `newSeed(rand)`, `summaryOf(vars)`. Draws every
  choice in a fixed order from one seeded generator. Re-exports `CHOICES`, `FONT_PAIRS`, `SCHEMES`, `GENERATOR`.
- `choices.js`: the choice lists (kinds, layouts, heading, table, margins, scale, paper, header, footer), the
  font pairs (families in `shared/fonts`), the colour schemes (Slopographic palette plus neutral sets), and the
  placeholder word banks. Every name in the word banks is invented.
- `rng.js`: `hashSeed` (FNV-1a with an avalanche) and `rng(seed)` (mulberry32). No `Math.random` and no `Date`.
- `parts.js`: the builder. Paragraphs, headings (plain, ruled, caps, numbered or bar), bullets, tables in the
  chosen table style, the logo placeholder, and the page-top layouts (two-column header, side rail, letterhead).
- `design.js`: the style sheet, the page section, the bullet list, and the header and footer (company name, title,
  page-number fields).
- `content.js`: the placeholder text for letter, proposal, report, memo, invoice and brief.
- `check.js`: `checkDoc(doc)` validates against the Docs schema, using the Docs model's own page sizes, style
  names and font families. It returns a list of problems, empty when the document is valid.
- `generate.test.mjs`: Node tests (`node --test shared/templates/generate.test.mjs`).

## Variables
kind, layout (single, twoColHeader, letterhead, sideRail), font pair (heading and body), colour scheme, heading
style, table style (grid, plain, banded, strong), margins (narrow, standard, wide), scale (body size), paper (Letter
or A4), header content, footer content, logo placeholder on or off. The seed is stored in `doc.meta.template`.

## Rules
- Same seed, same JSON. Keep it that way: no `Date`, no `Math.random`, no iteration over objects whose key order
  could change. Adding a variable changes the output for every seed, so do it deliberately.
- Every choice must come from its list in `choices.js`. The tests check this across 300 seeds.
- Generated ids come from a per-document counter (`p1`, `t2`…), not `uid()`, so they are deterministic.
- Documents must end with a paragraph (the normaliser appends one otherwise), and no run may have empty text.

## Known limits
- **Side rail is not a full-height column.** The engine has no multi-column flow or positioned boxes. The side rail
  is a tinted two-cell table at the top of page 1, with the title beside the metadata. Body text runs full width.
- **Logo placeholder is a tinted paragraph** reading "LOGO", 120 pt wide. It is not an image.
- The Node tests import `docs/js/model/doc.js`, `styles.js` and `fonts/registry.js`. Node prints a
  MODULE_TYPELESS_PACKAGE_JSON warning because package.json has no `"type": "module"`. The tests still pass.
- Templates are not in `shared/apps.js`; they are Docs-only.
