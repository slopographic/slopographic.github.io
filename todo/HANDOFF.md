# Slop To-do: handoff

Tasks with due dates, lists, tags, subtasks, repeats, reminders and completion. The Calendar shows tasks with a due time as a
read-only layer (toggle on the calendar page), and completing a task in either app updates both, through the shared store.

## Files
- `index.html`, `css/todo.css`: the page. Views on the left, the list on the right. At 390 px the views become a row of buttons.
- `js/ui/app.js` (`SlopTodo.app`): views (Today, Upcoming, All, one per list), quick add (Enter), show done, search, New list,
  and `?task=id` (the Calendar's link) that opens that task's editor.
- `js/ui/list.js`: rows, subtasks indented under their parent, due text ("Overdue", "Today · 15:00"), facts line.
- `js/ui/editor.js`: the task dialog. Subtasks are added and ticked inside it and saved at once.
- `js/ui/commands.js` (SlopCmd), `js/config.js` (config kind `todo`).
- Shared: `shared/tasks/logic.js` (SlopTasks: due moment, buckets, complete, sort, lists; no storage) and
  `shared/tasks/store.js` (SlopTaskStore: form to record, save, patch, complete, reopen, remove with subtasks).

## Rules
- Due moment: a due date with a due time is that wall time in the task's zone (`tz`). A due date without a time is 09:00 for
  reminders. Only a due time puts a task on the Calendar.
- Today: open tasks due today or earlier. Upcoming: open tasks due later. All: every top-level task. A list: the tasks in it.
  Subtasks sit under their parent. Done tasks show only with Show done (and in Today, only when done today).
- Complete: a one-off task is marked done. A repeating task moves its due date to the next occurrence and stays open. The
  repeat stops after its end day. Reopen clears done.
- Sort: due date, then due time, then priority (high first), then title. Lists: Inbox first, then alphabetical.

## Data (shared store `tasks`)
- Fields: title, notes, due, dueTime, tz, priority, list, tags, parentId, done, doneAt, freq, until, remind, customerId.
  A list is a name on a task; a list with no tasks does not persist (New list opens the editor with the name).

## CRM and Calendar
- Customer link: a task can name a customer. The CRM Follow-ups tab lists open linked tasks.
- Calendar: due-time tasks appear as chips. The checkbox on a chip completes the task (the same change as here).

## Config kind `todo`
- `tasks`: a list, with subtasks nested under each parent. Import validates (a due time needs a due date, a repeat needs a due
  date, zones must be real), then adds in one transaction.
- Config menu: works. The registry entry is in shared/apps.js (id `todo`), so the config format accepts the kind.
- The editor's inputs use ids `teTitle` and `teList`. `tTitle` and `tList` are the page's own elements, so the ids must not repeat.

## Keys (SlopCmd)
- `t` Today, `u` Upcoming, `a` All, `n` new task, `f` find, `h` show done. Palette commands go to the Calendar and Reminders too.

## Tests
- `node tests/run.mjs todo`: `tests/node/todo-logic.test.mjs` (due moments, buckets, repeating completion, views, sort,
  progress, lists, and reminder due times with snooze and dismiss on fixed dates), and `tests/todo/todo.test.html` (a task with
  a due time shows in the Calendar's week view, completing it in To-do removes the block, reopening it brings it back).

## Not done or not checked
- No drag to reschedule a task (use the editor). Tags are not filtered in the sidebar.
- Subtasks are one level deep.
