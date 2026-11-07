# shared/profile: the Settings profile (global and per-app)

Two levels, both on the Settings page (`settings/`):

1. **Global settings** live in the data layer, in the settings record (`shared/data`, IndexedDB `slop-data`): the
   default currency, the locale, "Update on open" for exchange rates. They travel in the export. The consent switches
   live in `shared/consent` (localStorage `slop-consent`). The privacy text is in `settings/index.html`.
2. **Per-app settings** live here: `SlopProfile` over localStorage key **`slop-profile`**. The Settings page lists the
   apps from `shared/apps.js` and shows one section for each app that declares options.

## Files

- `profile.js`: `window.SlopProfile`. Classic script. Needs `window.SLOP_APP_OPTIONS` (or `SlopProfile.create({ options })`).
- `app-options.js`: `window.SLOP_APP_OPTIONS`, the declared options per app. The `faces` group (face detection, off by
  default) is declared there and shared by Drive and Gallery (`SLOP_APP_SHARED`); see `shared/faces/HANDOFF.md`. The file shows the shape in a comment.

## For an app: read and write its own settings

```html
<script src="…/shared/profile/profile.js"></script>
```

```js
const decimals = SlopProfile.get('tables', 'decimalPlaces', 2);    // override if the person set one, else 2
SlopProfile.set('tables', 'decimalPlaces', 3);                       // { ok: true } or { ok: false, error }
SlopProfile.reset('tables');                                         // back to this app's defaults
```

- `get(appId, key, appDefault?)`: the stored override when it is valid for the declared option; otherwise `appDefault`
  if given, otherwise the declared default. An app keeps its own default in its own code and passes it as the fallback.
- `set(appId, key, value)`: refused for an undeclared key, a value of the wrong type, or a value outside the option's
  range or list. A value equal to the declared default is not stored (the profile keeps only what the person changed).
- `reset(appId)`: clears every override for that app. Other apps are untouched.
- `all(appId)`: the effective values. `overrides(appId)`: only what was changed. `appIds()`: the declared apps.

## Declaring options (`app-options.js`)

```js
window.SLOP_APP_OPTIONS = Object.freeze({
  tables: {
    decimalPlaces: { label: 'Decimal places', type: 'number', default: 2, min: 0, max: 6 },
    gridLines: { label: 'Gridlines', type: 'bool', default: true },
    theme: { label: 'Theme', type: 'enum', default: 'dark', values: ['dark', 'light'] },
    caption: { label: 'Caption', type: 'string', default: 'Untitled' },
  },
});
```

Types: `bool`, `number` (with optional `min` and `max`), `string` (up to 200 characters), `enum` (with `values`).
The declared `default` is what the Settings page shows; it should match the app's own default.

## The Settings page (per-app section)

`settings/app-settings.js` renders one block per app that has declared options, with one control per option. A change
saves at once through `SlopProfile.set`; a refused value is reported and the control is put back. "Reset this app"
calls `SlopProfile.reset`. With no declared options it shows "No app has settings yet."

## Storage and failure

- Everything is in try/catch. Corrupt or blocked storage reads as "no overrides": every read gives the default, and
  writes return `{ ok: false, error: 'Could not save: browser storage is blocked.' }`.
- A stored value that is no longer valid (for example, a declared range changed) is ignored, not deleted.
- Overrides are per browser. They do not sync and are not in the data export.

## Tests

`node --test tests/node/profile.test.mjs` (or `node tests/run.mjs profile`): get, set, reset, the default fallback,
refused values, corrupt and blocked storage, and independent instances.
