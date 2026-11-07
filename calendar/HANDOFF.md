# Slop Calendar: handoff

Year, month, week, day, split and agenda views over the shared store. Events, the To-do tasks layer, repeats, time zones, reminders,
.ics import and export, a config kind, and CRM links. Nothing is uploaded. Registry id `calendar` (shared/apps.js).

## Files
- `index.html`, `css/calendar.css`: the page. Every script is loaded in dependency order at the bottom.
- `js/core/model.js` (`SlopCal.model`): loads events (repeats expanded) and open tasks for a range of viewer days.
  Each item keeps its own zone, so the view can show the viewer's time and the event's time.
- `js/core/periods.js` (`SlopCal.periods`): the days each view needs, its title, and how far Previous and Next move. Pure.
- `js/core/history.js` (`SlopCal.history`): undo steps for drag moves (in memory, most recent 50).
- `js/ui/app.js` (`SlopCal.app`): view, split pair, period, viewer zone (saved in localStorage), task toggle, redraw on store
  changes, the undo command (Ctrl+Z and the toast's Undo). On a phone (640 px or less) the week, day and split views show the agenda.
- `js/ui/year.js` (twelve mini months with a dot on busy days), `month.js`, `timegrid.js` (week and day), `split.js` (two panes),
  `agenda.js`, `chip.js` (blocks and column layout), `drag.js` (the pointer drag and the change each drop makes).
- `css/views.css`: the year, split and drag feedback styles. Loaded after `calendar.css`.
- `js/ui/editor.js` (the event editor, in the right panel), `ics-ui.js` (export, and import with a preview), `commands.js` (SlopCmd), `js/config.js`.
- Shared, pure and node-testable: `shared/calendar/tz.js` (SlopTime), `rrule.js` (SlopRecur), `ics.js` (SlopIcs),
  `store.js` (SlopEvents: form to record, record to form, save, patch, remove).

## Data (shared store, DB version 4)
- `events`: timed events keep `start` and `end` (epoch ms) and `tz`. All-day events keep `startDay` and `endDay` (inclusive).
  `freq` (none, daily, weekly, monthly, yearly), `until` (day, inclusive), `remind` (minutes before), `kind` (event, call,
  meeting), `customerId`, `uid`.
- `tasks`, `reminders`: see `todo/HANDOFF.md` and `reminders/HANDOFF.md`.
- Upgrade: `DB_VERSION` 3 to 4 in `shared/data/store.js`; `createStores` adds the three collections, and no record changes.
  `schema-defs.js` gains the three collections and their checks. `bundle-check.js` reads older backups as empty for them.

## Time zones (Intl only)
- `SlopTime.wallToUtc(y, mo, d, h, mi, zone)` converts a wall-clock reading to an instant; `parts(ms, zone)` reads one back.
  Nothing is downloaded. The zone list is `Intl.supportedValuesOf('timeZone')` where it exists.
- A timed event is saved as an instant plus its zone. The editor shows the start in the event's zone and in the viewer's zone.
  A drag works out the new time on the viewer's wall clock, then saves the instant in the event's zone.

## Views and keys
- Year (`Y`): twelve mini months. A day with something on it has a dot. A click on a month name or a day opens that month.
- Month (`M`), Week (`W`), Day (`D`): as before. The title reads "March 2026", "3 to 9 March 2026" or the day.
- Split (`S`): two panes for one anchor day. The pair (Month and day, Month and week, Week and day) is chosen in the toolbar and
  saved per device (`slop-calendar.split`). A click on a day in the left pane makes it the anchor, so the right pane shows it.
  Previous and Next move the right pane by a day or a week.
- Agenda (`A`): the list of the next 60 days.
- Arrows move the period, `T` goes to today, `N` adds an event, `K` shows or hides to-dos, Ctrl+Z undoes the last move.
- The view is saved per device (`slop-calendar.view`). A `#year`, `#month`, `#week`, `#day`, `#split` or `#agenda` hash wins.

## Drag (`js/ui/drag.js`)
- Month: an event chip dragged onto another day moves there. The day under the pointer is highlighted and named. All-day events
  shift their days, timed events keep their times.
- Week and day: a timed block moves to another time, and in a week to another day column. The drop lands on the half hour, and the
  new day and time show in a label while dragging. The bottom edge resizes in 15-minute steps.
- A drop on the same place changes nothing and adds no undo step. A press that does not move opens the event as a click does.
- A move is one undo step. The toast offers Undo for ten seconds, and Ctrl+Z undoes the newest step (not while a text field has the focus).
- A repeating event moves or resizes as a whole series, by the amount the dragged occurrence moved.

## Repeats (`shared/calendar/rrule.js`)
- Daily, weekly, monthly, yearly, with an inclusive end day. Dates step on the event's own wall clock, so a 09:00 weekly event
  stays at 09:00 across daylight saving. Monthly and yearly repeats skip dates that do not exist (31 February, 29 February).
- Dragging or resizing a repeating event changes the whole series. Single-occurrence exceptions are not supported.
  A series that moves across a daylight saving change moves by the instant difference.

## .ics (RFC 5545 subset, `shared/calendar/ics.js`)
- Written: VEVENT with UID, DTSTAMP, DTSTART, DTEND, SUMMARY, LOCATION, DESCRIPTION, RRULE (FREQ with UNTIL), VALARM (DISPLAY,
  as minutes before), and X-SLOP-COLOR and X-SLOP-KIND. Timed events use TZID with no VTIMEZONE block, and all-day events use
  VALUE=DATE. Lines fold at 75 octets.
- Read: the same, plus UTC and floating times (floating uses the viewer's zone). INTERVAL other than 1 and BY* parts are not kept:
  the import warns and repeats by FREQ alone. Unknown RRULE forms import once, with a warning.
- Import shows a preview first: how many will be added, how many are skipped because their UID is already here, and the
  warnings. Nothing is written until the person confirms, and the write is one transaction.

## Config kind `calendar` (shared/config, app `calendar`)
- `events`: a list. Times are written as the reading in the event's zone (`startLocal` as `YYYY-MM-DDTHH:MM`, plus `tz`).
  Import validates first (zones, dates, end after start), then adds in one transaction. It never changes existing events.

## Reminders
- Event reminders come from `remind`, per occurrence. The popup is `SlopReminderEngine` (`shared/reminders/engine.js`).
  Snooze and dismiss are written to `reminders`. See `reminders/HANDOFF.md`.

## CRM
- Customer detail: Schedule adds a call or meeting event linked to the customer (`crm/js/ui/detail.js`).
- Follow-ups: lists the next 60 days of linked events (repeats expanded), and open linked tasks (`crm/js/ui/followups.js`).

## Keys and commands (SlopCmd)
- Left and Right arrows move the period. `t` today, `y`, `m`, `w`, `d`, `s`, `a` for the views, `n` new event, `k` shows or hides to-dos.
  Undo of the last move is in the palette (Ctrl+K) too.
- Palette (Ctrl+K) lists every command, including "Go to Slop To-do", "Go to Slop Reminders" and "Go to Slop CRM".
- Keys are plain letters, so they work outside text fields only (SlopCmd rules).

## Tests
- `node tests/run.mjs calendar`: `tests/node/calendar-recurrence.test.mjs` (recurrence, .ics round trip and import warnings,
  time zone conversion, fixed dates), and in the browser `tests/calendar/calendar.test.html` (a weekly event made in the editor,
  linked to a customer, repeats four times in the week view, and shows in the CRM follow-ups), `reminders.test.html`,
  `views.test.html` (each view renders, the segmented control and keys, split shows a clicked day, year opens a month) and
  `drag.test.html` (a month move changes its date, a week drop changes its time, a same-place drop does nothing, Undo and
  Ctrl+Z restore a move, resize snaps to 15 minutes).

## Not done or not checked
- Drag is mouse and pen only in the tests (synthetic pointer events). Touch dragging was not checked on a phone, and the
  time grid has no drag on phones, where the agenda shows.
- Deleting an event leaves its reminder rows behind (harmless, but they are not swept).
- Reminders show only while a tab is open. There is no background scheduling.

## The day panel on the right (the suite rule, shared/frame/HANDOFF.md)

`js/ui/panel.js` mounts SlopFrame on `#cBody`: the calendar (`#main`) is the view, `#cSide` the panel. It shows the day
the view is on (its events and to-dos; each opens in the editor), Show (To-dos, the time zone, the split's panes) and
Calendar file (Import .ics, Export .ics, Config), with New event, the main button, at its foot. The event editor (js/ui/editor.js)
opens in the same panel: the form, with Cancel, Delete and Save at its foot; Escape or Cancel puts the day back. On a phone (640 px) the panel is a bottom sheet whose closed state shows New event. Test:
`tests/calendar/panel.test.html`.
