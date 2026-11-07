# shared/ui: reusable interface pieces

One source for the pieces many apps need: the record list (`list.js`), the view tabs (`tabs.js`) and form reset
(`form-reset.js`). Dialogs, menus, toasts and form fields are `SlopUI` (`shared/slopui.js`); right-click and Menu-key
menus are `SlopCtx` (`shared/ctxmenu.js`). A new app uses these instead of its own copies.

## list.js (`window.SlopList`)

The list of records (orders, invoices, expenses...). One row per record: a title, an amount on the right, and a meta
line of text and status chips. Click or Enter opens a row; the arrows, Home and End move between rows (one row is
tabbable); right-click or the Menu key opens the row's menu (through `SlopCtx` when the page loads it).

```html
<link rel="stylesheet" href="…/shared/ui/list.css">
<script src="…/shared/slopui.js"></script>
<script src="…/shared/ctxmenu.js"></script>
<script src="…/shared/ui/list.js"></script>
```

```js
const list = SlopList.mount(host, { label: 'expenses.li.label', count: 'expenses.li.count', summary: countEl, empty: 'expenses.li.empty',
  row: (r) => ({ title: r.supplier, amount: money(r.amount), cls: r.status === 'void' ? 'is-void' : '', meta: [r.date, { chip: 'Void', cls: 'void' }] }),
  open: (r) => go('e/' + r.id), menu: (r) => [{ label: 'Open', act: () => go('e/' + r.id) }] });
list.set(records);   // draws the rows, the count ("3 expenses") and the empty message
```

`count` is one plural family in the app's tables (`'expenses.li.count': '{n} expenses'`, `'expenses.li.count#one'`,
and `#few`/`#many`/... where a language needs them), drawn with `SlopI18n.t(key, { n })`, or a function of n. Never a
`[singular, plural]` noun pair: Polish, Russian, Arabic and others have more forms than two.

Chip classes: `good`, `warn`, `void`. A row class `is-void` greys and strikes the title and amount. Tests:
`tests/shared/list.test.html`.

## tabs.js (`window.SlopTabs`)

The view tabs of a page: a `role="tablist"` of `role="tab"` buttons with `data-view`, and a panel per view
(`#view-<name>` unless `panel(name)` says otherwise). `show(name)` shows that panel, hides the others and marks the tab
(`aria-selected`, the only tabbable tab). A click, the arrows, Home and End select a view: through `select(name)` when the
app routes with a `#hash` (it then calls `show` from its router), else `show` directly. `onShow(name)` runs after a view
is shown. Hidden tabs are skipped by the keys but can still be shown. Tests: `tests/shared/tabs.test.html`.

```js
const tabs = SlopTabs.mount(document.querySelector('[role="tablist"]'), { select: (n) => go(n), onShow: (n) => views[n].onShow() });
tabs.show('list');
```


## form-reset.js (`window.SlopFormReset`)

Reset for any form, in any app. It works on a `<form>`, on a SlopUI dialog body, or on a plain `div`. The snapshot
lives in a WeakMap, so nothing is added to the DOM.

```html
<script src="…/shared/slopui.js"></script>
<script src="…/shared/ui/form-reset.js"></script>
```

| call | what it does |
|---|---|
| `SlopFormReset.snapshot(root)` | Remembers every enabled input, select and textarea, and every segmented control (a `[role="group"] > button[aria-pressed]`). Call it once the form is built. |
| `SlopFormReset.isDirty(root)` | True when any of them differs from the snapshot. |
| `await SlopFormReset.reset(root, { confirm = true })` | With edits, asks first (`SlopUI.confirm`, Reset in red). Then restores the values and fires `input` and `change` on each changed field, so the form's own handlers run again. Resolves true when restored, false when the person cancels. |
| `SlopFormReset.dialogButton(root, label = 'Reset')` | A `SlopUI.dialog` button that resets and keeps the dialog open (its `act` returns false). |

Example, in a dialog (this is what CRM and Inventory use):

```js
const body = el('form', null, /* fields */);
SlopFormReset.snapshot(body);
SlopUI.dialog({ title: 'Edit customer', body,
  buttons: [{ label: 'Cancel' }, SlopFormReset.dialogButton(body), { label: 'Save', primary: true, act: save }] });
```

Limits:
- Only values are restored. A control that is built from a list (a stock picker made of buttons, say) is not a field, so
  its selection is not restored. Restore it from the values that the form owns, or snapshot it yourself.
- Fields added after `snapshot` are not tracked. Call `snapshot` again after the form changes shape.
- Disabled fields are skipped at snapshot time.

Used by: SlopLabel (property dialogs, Print, data mapping, paste data, ZPL import and preview), CRM customer form,
Inventory product form. The Label Properties panel does its own Reset (`label/js/ui/props-reset.js`), because its
baseline is the selected objects, not the DOM.

Tests: `tests/label/generate-reset.test.html` (the shared-form section).

## Header buttons (`hbtn.css`, `hbtn.js`)

Every button a shared script puts in an app's header wears `.slop-hbtn`: Slop Drive (`shared/drive-link.js`), Tour
(`shared/tour/mount.js`), View and Show panels (`shared/viewmode`), Theme, Apps and the bell (`shell/header.js`,
`shell/notify.js`). The label is a `.slop-hbtn-txt` span next to an icon. The shell links `hbtn.css` and loads `hbtn.js`
on every shell page; a page without the shell links `hbtn.css` itself.

- **Match the app**: set `--slop-hbtn-h`, `--slop-hbtn-radius`, `--slop-hbtn-bg`, `--slop-hbtn-line`, `--slop-hbtn-hover`
  and `--slop-hbtn-fs` on `:root` or the header (Slides: `.top` in `slides/css/app.css`, like its `.tb-btn`).
- **Fit**: `SlopHbtn.fit(header)` (the shell calls it on the header that holds Apps) watches the header; when a shared
  button is cut off, past an edge, or wrapped onto a second row, or anything in it runs into the header's end padding
  (even a fraction of a pixel: that would push the last control, View, sideways by an amount that depends on the font), the header gets `.slop-htight` and the shared buttons
  show only their icons (title and aria-label still name them). Under 560 px they are icons always.
- Tests: `tests/shared/hbtn.test.html`, `tests/shell/header-buttons.test.html`.

## From → to picture (`flow.js`, SlopFlow)

The one picture of a conversion: two file tiles (coloured by family: PDF red, Word blue, sheets green, slides orange,
images purple, video, audio, text, code, archives) joined by an arrow. The arrow draws itself when the pair changes,
marches with a progress fill while work runs, and the target tile ticks when done (a red mark on error). Classic script
that also works as a side-effect ES-module import; it injects its own styles once. Used by the Convert hub cards
(`convert/js/ui/cards.js`), the top of every converter page (`convert/js/ui/markup.js`, `tool.js`) and the Convert dialog
(`shared/convert/dialog.js`). The output kind of each conversion comes from `outKind()` in `convert/js/core/catalog.js`.

```js
const f = SlopFlow.create({ from: 'pdf', to: 'docx', size: 'lg' });   // from may be a list: ['png', 'jpg'] shows PNG +1
host.append(f.el);
f.state('run'); f.progress(0.4); f.state('done');                      // or 'error', 'idle'
f.set({ from: 'csv', to: 'xlsx' });                                     // a new pair is idle and draws again
f.onTo(openMenu, 'convert.tool.choose_format');                         // labels: i18n keys follow a language change
```
Tests: `tests/shared/flow.test.html`, `tests/convert/ui.test.html`, `tests/convert/dialog.test.html`, `tests/convert/hub.test.html`.

## Menu button (`menubutton.js`, SlopMenuButton)

A button with its own menu of choices (choose one): rows with an optional icon node, group headings, the chosen row
checked. It opens under the button (above when there is no room), sets `aria-expanded`, and gives focus back on close.
Keys: ArrowDown or ArrowUp on the button open it; in the menu the arrows, Home, End and a typed letter move, Enter or Space
picks, Escape or Tab closes. SlopUI.menu stays the context menu at the pointer; this one belongs to a button. Styles are
injected once and take the page's `--panel`, `--ink`, `--line`, `--accent`, `--focus` (or `--smb-*`).

```js
SlopMenuButton.attach(button, { label: 'Convert photo.png to', empty: 'No format',
  items: () => [{ heading: 'Images' }, { value: 'to-jpg', label: 'To JPG', icon: SlopFlow.tile('jpg'), checked: true }],
  onPick: (value) => { ... } });
```
Used by File convert's per-file targets (`convert/js/ui/file-row.js`). Tests: `tests/shared/menubutton.test.html`.

## Undo (`undo.js`, SlopUndo)

One undo history for an app's edits (a drag that moves something, a delete). `SlopUndo.create({ limit = 50 })` returns
`{ push(label, undo), undo(), next, size, clear() }`: `undo` is an async function that reverses one step and resolves to a
Result; `undo()` runs the newest and resolves `{ ok, label }` or `{ ok: false, message }`. `SlopUndo.keys(history, run)`
makes Ctrl+Z (Cmd+Z) call `run()` unless a text field, a dialog or a menu has the focus. `SlopUndo.toast(what, run)` says
what was done with an Undo button. Used by Slop Calendar (event drags) and Slop Projects (every move, edit and delete).
Tests: `tests/projects/board.test.html` (undo of moves and deletes), `tests/calendar/drag.test.html`.

## Phone sheets and drawers (`sheet.js`, SlopSheet)

One pattern for every app's side panel on a phone: the panel becomes a **bottom sheet** (or a **drawer** from the start or
end edge, for a sidebar of places or files). Every app's sheet behaves the same, so nobody has to learn it twice:

- the button or tool that opens it closes it when tapped again (toggles keep `aria-expanded`);
- a close **×** (44 px, `aria-label` "Close <label>") sits at its top right;
- **Escape**, a **tap outside** (the tap still reaches what was tapped) and a **swipe** in the closing direction close it
  (down from the top 56 px of a bottom sheet; left or right anywhere on a drawer);
- it is not modal: focus stays put on open and goes back to the opener when × or Escape closes it;
- on a wide screen nothing changes (no sheet, no ×), unless the app passes `closeWide`, in which case the × is the panel's
  close on a wide screen too (Slop Drive's details).

### How an app adopts it

1. Load `shared/ui/sheet.js` (a classic script) before the app's own scripts. On an app page with render blocking keep
   the scripts' order: a plain `<script src>` in `<body>` before the app's scripts, or in `<head>` with `defer`/`blocking`
   in the same position as its neighbours (`tests/node/render-ready.test.mjs`).
2. Attach once the DOM is there. The sheet takes Escape on the window in the capture phase and stops it, so an app's
   own Escape (Deselect, a SlopCmd command) only runs when no sheet is open; an app handler that may still see it should
   skip an Escape with `e.defaultPrevented`:
   ```js
   const sheet = SlopSheet.attach({ root: document.body, panel: $('info'), phone: '(max-width: 760px)',
     side: 'bottom',                  // or 'start' / 'end' for a drawer
     toggles: [$('btnInfo')],         // buttons that open and close it
     triggers: railEl,                // or: a rail of tool buttons (a tap on the active tool closes it)
     label: 'eml.panel.details',      // an i18n key (or a function, or text): the × follows a language change
     onChange: (open, why) => render() });
   ```
3. **Delete** the app's own phone toggle, ×, scrim, Escape and outside-tap code. Keep a thin wrapper if other code calls it
   (`DR.drawer = (open) => open ? DR.drawerUI.open() : DR.drawerUI.close()`).
4. **CSS**: drop the app's own phone `position: fixed` / `transform` / `.open` rules for the panel. The shared look
   (`.ssh-panel`, `.ssh-start`, `.ssh-end`, open = `.ssh-on` on the panel, `.ssh-phone` on the root) gives place, motion,
   rounded corners, shadow and the dim behind a drawer. Tune it with `--ssh-z` (stacking, default 70: above the spotlight
   dock), `--ssh-bottom` (a bottom bar to
   sit above) and `--ssh-top` (a drawer below a header). An app whose panel must keep its own motion passes `openClass` and
   styles `.<openClass>` itself (Slop PDF).
5. Test at 390 px: open with its button or tool, the same button again closes, × closes and refocuses, Escape closes.

Two sheets can share a root (Drive's folders drawer and details sheet); Escape closes one at a time. The × is kept as the
panel's first child when the app redraws the panel. Menus, SlopUI dialogs and menu buttons over the sheet get Escape and
taps first.

A panel laid out as a CSS grid or flex column gets the × as a grid/flex item; such an app positions `.ssh-x` absolutely
in its own CSS (Label's dock, Effects' side panel). An app on the shared offline builder lists `shared/ui/sheet.js` in
`shared/offline/manifest.js` (PDF, SlopVector).

Used by:

| App | Panel | Shape | Opened by |
|---|---|---|---|
| Slop PDF | tool panel | bottom (own `openClass`) | the tool rail |
| Slop Drive | folders; details | start drawer; bottom (+ `closeWide`) | Folders; Info |
| Slop Code | explorer | start drawer | Files (Ctrl+B) |
| Slop Docs | outline | start drawer | the outline rail button |
| Slop Notes | notebooks, folders, tags | start drawer | View ▸ Notebooks |
| Slop AI | chat list | start drawer under the top bar | Chats |
| Slop Sheets (tables) | sheets, charts, functions | start drawer | the side strip's › |
| SlopIsolate | settings | bottom | the panel button, View ▸ panel |
| Gallery | filters, albums | start drawer | Filters |
| PhotoSlop | panels (layers…) | end drawer under the top bar | Layers |
| SlopVector, Slop Press | panel dock | end drawer | Panels (Tab, Window menu) |
| SlopLabel | dock (objects, properties…) | bottom | ☰ |
| Slop 3D | scene; properties | start drawer; bottom | Scene; Properties (phone buttons on the viewport) |
| Slop Effects | layer / effects / motion | bottom | Properties (phone button) |
| Slides | inspector | bottom | Properties (phone button) |

Not sheets, on purpose: SlopCut (its bottom tab bar shows one pane at a time), the business documents (Invoices, Quotes,
Orders, Purchases: on a phone the details are the Form view, with a Page / Form switch), CRM, Calendar, Projects and
Remix (their side parts stack in the page flow and are the main content there).

Tests: `tests/shared/sheet.test.html`, and each app's phone test.
- `resize-panel.js` (SlopResizePanel): the one way every side panel is resized and keeps its width; see shared/frame/HANDOFF.md (Resizing side panels). Its `label` may be an i18n key or a function (SlopI18n.label): the handle's words follow a language change. Tests: tests/shared/resize-panel.test.html.
