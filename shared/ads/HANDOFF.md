# Ad slots: handoff

Named, fixed ad slots for AdSense. The owner adds unit IDs; nothing shows until then. Classic scripts, no build step.

## The consent rule (read this first)
- **No AdSense tag goes in any page.** Not a `<script>` for `adsbygoogle.js`, not an `<ins>` outside a slot. A raw tag
  loads ads for every visitor before consent, which breaks the consent rules.
- The AdSense library loads only through `shared/consent/consent-mode.js`, using the publisher ID in
  `shared/consent/config.js` (`adsensePublisherId`). It loads only after the visitor accepts ads (banner, Settings or the
  support card). Turning ads off stops further loads and hides the slots at once.
- A slot shows nothing until ads are accepted, even when it has a unit ID.

## Files
- `slots.json`: the slot list. Each entry: `id` (a placeholder name on the page), `name` (for people), `unit` (the AdSense
  ad unit ID, digits, or `""` to keep the slot hidden), `width` and `height` (the reserved size in px).
- `ads.js`: `window.SlopAds`. Fills every `[data-slop-ad="<id>"]` element. Needs `config.js`, `state.js` and
  `consent-mode.js` loaded first (script order below). Listens for the `slop-consent` event that `consent-mode.js` fires
  on every change, so accepting or revoking on the same page takes effect without a reload.

## Placements (already on the pages)
| Slot id           | Where                                                                         |
|-------------------|-------------------------------------------------------------------------------|
| `home-footer`     | Homepage (`index.html`), inside the footer.                                   |
| `convert-sidebar` | Every convert page (`convert/index.html` and `convert/*/index.html`), a block after the main column. There is no sidebar layout on those pages. |
| `about-footer`    | The About pages that have a footer: label, pdf, photoslop, slopisolate, slopvector. The other About pages have no footer and no consent scripts, so they have no slot. |

Each placeholder is `<div class="slop-ad" data-slop-ad="<id>" hidden></div>`. Without JavaScript or without a unit it stays hidden.

## Adding the ad units (owner)
Create one display ad unit per slot in AdSense, then put its numeric ID in `slots.json`:
1. `home-footer`: the unit ID goes in `"unit"` (728 x 90 leaderboard in the footer).
2. `convert-sidebar`: the unit ID goes in `"unit"` (300 x 250 box).
3. `about-footer`: the unit ID goes in `"unit"` (728 x 90 leaderboard in the footer).

Change `"unit"` only. Do not rename ids: each id is also in the page markup. The node test
(`tests/node/ads-slots.test.mjs`) fails if a page uses a slot that is not in the list, or if an id repeats.

## Layout
When a slot is shown it gets the reserved size first (`max-width` = width, `min-height` = height, `aspect-ratio` =
width / height), then the unit is added. The unit filling in therefore does not move the content below it.

## Script order (any page with a slot)
```html
<script src="shared/consent/config.js"></script>
<script src="shared/consent/state.js"></script>
<script src="shared/consent/consent-mode.js"></script>   <!-- the one loader; sets consent default BEFORE any tag -->
<script src="shared/ads/ads.js"></script>                 <!-- after the consent scripts -->
```
Pages that already have the banner list it after `consent-mode.js`; that is fine.

## Testing
- `node tests/run.mjs ads`: the slot list (node) and the browser tests (`tests/ads/`): hidden until accepted, shown with the
  reserved size once accepted, no repeat AdSense request on a repeat change, hidden again on revoke. The test hook
  `window.SLOP_ADS_SLOTS` (an array) replaces `slots.json` in tests; nothing in the app sets it.
- The tip jar label test is `tests/ads/tipjar.test.html` and runs under the same `ads` filter.

## Tip jar
The donate link is labelled "Tip jar" everywhere: the footer link on the homepage (`data-brand-link="patreon"`), the
Settings donate section, the support card's button, and the link `donate.js` renders. The URL still comes from
`brand/brand.json` (`links.patreon`) and `shared/consent/config.js` (`patreonUrl`). The key names stay `patreon` (only the
labels changed).
