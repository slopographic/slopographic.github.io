# Slop Reminders: handoff

One timeline of reminders from Calendar events, To-do tasks and custom reminders. Each reminder shows as a pop-up while a page
is open, and optionally as a browser notification. Nothing uses the network.

## Files
- `index.html`, `css/reminders.css`: the page. Groups: Overdue, Today, Later. A custom reminder form, and a button that asks the
  browser for notification permission.
- `js/app.js` (`SlopRemindersUI`): the timeline, snooze (5 minutes, 1 hour, tomorrow 09:00) and dismiss.
- Shared: `shared/reminders/core.js` (SlopReminders: which reminders exist and when they are due; the clock, which tests can
  replace; pure), `shared/reminders/engine.js` (SlopReminderEngine: reads the store, fires, writes state, starts and stops).

## How it works
- Reminders are read every time, never copied. An event reminder is `remind` minutes before each occurrence (all-day events
  at 09:00). A task reminder is `remind` minutes before its due moment, for open tasks only. Custom reminders are rows of their own.
- The `reminders` collection stores only what the person did: `snoozedUntil`, `firedAt`, `dismissedAt`. An event or task
  reminder has a row keyed `event:<id>:<at>` or `task:<id>:<at>`, created on its first snooze, fire or dismiss.
- The engine runs every 15 seconds, and after each store change. A due reminder is written as fired first, then shown.
  A reminder that was due more than 5 minutes ago when first seen is marked fired silently, so the first open does not
  flood the page.
- Delivery: `SlopNotify.show({ title, body })` if a page loads it, otherwise a toast. A browser notification is also shown when the
  permission is granted. `SlopReminderEngine.setNotifier(fn)` replaces delivery (for tests).
- A repeating event shows in Later once: its next occurrence, with the repeat in words ("Event · Every week · the next
  one"), through `SlopReminders.nextOnly`. The 400-day window would otherwise list a weekly event about 58 times. Overdue
  and Today still list each occurrence. Dismissing the next one brings up the one after.
- Snooze sets `snoozedUntil` and clears `firedAt`, so the reminder fires again at that time. Dismiss hides it for good.

## Tests
- `node tests/run.mjs todo`: the due and reminder rules (`tests/node/todo-logic.test.mjs`).
- `node tests/run.mjs reminders`: `tests/reminders/reminders.test.html`. Fake clock: a custom reminder fires once, a 5 minute
  snooze keeps it quiet at 4 minutes and fires it again at 5 minutes, a due reminder appears in the in-app notifications,
  and a weekly event shows once in Later. `tests/node/todo-logic.test.mjs` checks `nextOnly`.

## Not done or not checked
- In-app delivery calls `SlopNotify.show({ title, body })` (shell/notify.js, loaded by shell/shell.js). It used to pass one
  string, which the notifier cannot read, so the pop-up said "Notice" with no text. `reminders.test.html` checks the title now.
- Notifications only while a tab is open. Browser notifications were not tested on a real device.

## Assistant commands
The page loads `shared/biz/biz.js` and starts SlopCmd (`js/app.js`); `SlopBiz.assistant('reminders')` gives the record commands of `shared/data/ai-records.js` on `reminders` (a new one is `custom`; `at` may be ISO text). Test: `tests/reminders/ai-commands.test.html`.
