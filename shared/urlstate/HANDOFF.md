# URL state: handoff

`shared/urlstate/urlstate.js` (`window.SlopUrlState`) keeps an app's place in the page's query string, so a link
restores it and back/forward move through it. Slop Drive is the first app to use it (`drive/js/app/url-state.js`).

## API

```js
const S = SlopUrlState.scope('abc');           // a short prefix per app: keys are written as abc.<key>
S.get('doc', null);                            // read; the default also sets the type (number, boolean, object, string)
S.set({ doc: id, view: 'list', q: null });     // merge; null or undefined removes a key
S.set({ doc: id }, { replace: false, state }); // a navigation: pushes one history entry (replace defaults to true)
S.onChange((e) => { ... });                    // runs on popstate; read the URL again and apply it
S.link();                                      // the absolute URL of the current page, for "Copy link"
```

- Values: strings as they are; numbers and booleans as text; objects and arrays as JSON.
- Unknown parameters are kept exactly as written, so two apps or other tools on one page do not clash.
- Every call is wrapped: a blocked history API (sandboxed frame, `file:`, private mode) never throws.
- The bare `SlopUrlState.get/set` (no scope) are for a page with one app and no prefix.

## The rule for each app

**Put in the URL** (small, safe to share, and worth restoring):
- **Location:** the folder, page, section or tab the person is in, as an id or a short enum.
- **Selected document:** the id of the document or file open or in focus.
- **Open tabs:** the ids of the open tabs, in order, when the app has tabs.
- **View options:** the view mode, sort key and direction, search text, zoom level and similar switches.

**Do not put in the URL:**
- **Content:** text, cell values, drawings, pixels, anything the person typed into a document.
- **Anything large:** more than a few hundred characters, a list of many ids, or a serialised object tree.
- **Anything private or secret:** names or details the person may not want shared, tokens, keys, account details,
  or anything taken from a file. A link is copied and pasted, so treat the URL as public.
- **Storage:** the URL is not a database. Keep saved data in the app's own store.

**How to use it:**
1. Use `replace` (the default) for ordinary changes such as a view, sort or search. Use `replace: false` only for a
   navigation (a folder, a page, a tab) so that back and forward walk those places.
2. On boot, a link's keys win over the saved place when any are present. Treat every value as untrusted and
   check it: an id may no longer exist, so fall back to the default.
3. Subscribe with `onChange` and apply the URL again on popstate. The URL is then the state.
4. Keep the keys short and stable, and never rename a key that a shared link may already use.
5. Write the URL after the state changes, not on every keystroke. Debounce free text, as Drive does for search.
6. If a value is not shown yet (a file still loading), keep it in the URL until it can be shown.

## Drive (the reference)
Prefix `drv`: `cwd` (folder), `s` (section when not the folder tree), `v` (view), `sort` and `dir`, `q` (search),
`f` (file in Quick look). Back and forward move between folders. See `drive/js/app/url-state.js`.

Tests: `tests/urlstate/urlstate.test.html` (the browser) and `tests/node/urlstate.test.mjs` (the module in a fake window).
