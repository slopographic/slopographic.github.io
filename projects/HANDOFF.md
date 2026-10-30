# Slop Projects: handoff

A project planner for a small business: a Kanban board, a timeline (Gantt) and a sortable list of the same tasks.
Browser only, no build step, no network. Projects and tasks are SlopData records (`projects`, `projectTasks`, database
version 12; see `shared/data/HANDOFF.md`), so they are in the site's backup, and a task can name a CRM customer.

## Files
- `index.html`: the page. The static parts (menu bar items, view tabs, project bar, filters, the three view panels, the
  empty page) are in the HTML; scripts fill the board, the timeline and the list. Render blocking: `<link rel="expect">`
  after the theme script and `<i id="slop-built">` last, like every app page.
- `css/projects.css` (bar, board, cards, drag, dialogs, empty page), `css/timeline.css` (timeline and list). The base is
  `shared/biz/app.css` and `shared/slop365/look.css`.
- `js/core/` (no DOM, Node tested): `board.js` (columns, card moves as the few records that change, column add, reorder,
  remove, WIP, filters, list sort), `deps.js` (finish-to-start: loop check, order, `shift` moves later tasks on, violations,
  blockers), `bars.js` (timeline span, zoom, bar boxes, drag to dates, scale labels, arrow paths), `io.js` (CSV, JSON backup
  write and read with new ids), `sample.js` (the sample project, as a backup), `store.js` (SlopData reads and `write(ops)`:
  one transaction that returns the ops that reverse it).
- `js/ui/`: `app.js` (SlopBiz router: `#board`, `#timeline`, `#list`; state; empty page), `actions.js` (every change, each
  one undo step), `card.js`, `board.js`, `board-drag.js`, `timeline.js`, `timeline-drag.js`, `list.js`, `editor.js` and
  `editor-parts.js` (task dialog, checklist, waits for), `project.js` (settings, columns, new project), `files.js` (backup,
  CSV, open, sample, the SlopDrop zone), `toolbar.js`, `commands.js`.
- `about/index.html`; the landing page `apps/projects/` is generated from `shared/seo/copy.mjs`. Tour:
  `shared/tour/tours/projects.js`.

## Rules
- Columns: 1 to 12, default To do, Doing, Done. One or more may be marked "finished work" (done); none marked means the
  last. A WIP limit of 0 is no limit; a column over its limit shows its count in red. A removed column's cards go to the
  end of the nearest column before it that stays. A card whose column is missing shows in the first column.
- Card order is `order` (0, 1, 2) inside a column; a move renumbers only the columns it touches.
- Dates: a task has a start and an end (both or neither; only one typed means a one-day task) and an optional due day.
  Only tasks with both show as bars. Dependencies are finish-to-start: a task starts the day after the latest of the
  tasks it waits for ends. Any date change (drag, keys, editor, Schedule) moves later tasks on in the same undo step,
  keeping their length; nothing is moved earlier. A dependency that makes a loop is refused. Broken links (possible when
  a task is moved earlier by hand, or from a backup) show as red arrows and a note.
- Undo: every move, edit, add and delete is one step in `SlopUndo` (`shared/ui/undo.js`, now also used by Calendar).
  The toast offers Undo; Ctrl+Z works outside text fields. Steps last for the visit. Deletes ask no question (Undo
  brings the record and its links back) except Delete project, which confirms.
- Backup: `{ format: 'slop-projects', version: 1, project, tasks }`. Opening one always adds a new project with new ids
  (dependencies follow), drops links to customers that do not exist here, and repairs bad parts with a note.
- CSV: board order; a cell a spreadsheet would run as a formula is kept as text; UTF-8 with a BOM.

## Keys
- Board: arrows move the focus between cards, Shift with an arrow moves the card, Enter opens, Delete deletes, `m` or
  the Menu key opens the card menu. Drag with a mouse anywhere on a card, with a finger by its grip (the board scrolls).
- Timeline: arrows move a bar a day, Shift with an arrow moves the end, Alt the start, Enter opens.
- SlopCmd: `b` Board, `t` Timeline, `l` List, `n` new task, `f` find, `p` project settings.

## Commands with arguments (palette, macros, Slop AI, WebMCP)
`js/ui/ai-commands.js` (schemas, registered by `commands.js` init) and `js/ui/ai-ops.js` (find a task/column/project by
id or name, dates like `2026-05-31`/`today`/`+3`, the `state()` summary with ids, the checkpoint that undoes the AI's
SlopUndo steps). Tools: `new_project` (name, columns, color, start), `open_project`, `add_task` (title, column, start,
end, due, assignee, notes, priority, tags, checklist, waits_for), `move_task` (task, column, order), `edit_task`,
`set_dependency` (task, waits_for, mode add/replace/remove; loops refused), `delete_task` (destructive), `add_column`,
`list_tasks` (read-only), `export_to_drive` (json or csv into Slop Drive). They call `NS.actions`, so each is one undo
step; with no arguments (palette) they open the matching dialog. `new_project` is not destructive (nothing is replaced).
Test: `tests/projects/ai-commands.test.html`.

## Tests
- Node: `tests/node/projects-board.test.mjs`, `projects-deps.test.mjs` (dependencies, scheduling, timeline geometry),
  `projects-io.test.mjs` (CSV, backup, sample, and the SlopData schema for both collections); helper `projects-env.mjs`.
- Browser: `tests/projects/board.test.html` (empty page, sample, pointer drag between and within columns, keyboard moves,
  menu, WIP, delete and undo, quick add, filters, 390 px), `timeline.test.html` (bars, arrows, drag move with later tasks
  moving on, resize, keys, Schedule, zoom, 390 px), `list-files.test.html` (sort, editor, loop refused, columns, JSON and
  CSV, open a backup, delete project and undo). Run `node tests/run.mjs projects`.

## Not done
- Calendar: project tasks do not show in Slop Calendar. The Calendar's task layer is hard-wired to To-do's `tasks`
  (calendar/js/core/model.js); a clean way is a small layer registry in the Calendar that To-do and Projects both feed.
- CRM: a task or project can name a customer, but the CRM does not list them yet (its Follow-ups tab reads To-do only),
  and the CRM has no link to one customer, so the editor's CRM button opens the customer list.
- App text is English only (the i18n tables cover the shared chrome only, as in the other apps).
- No config kind (`shared/config`) and no Slop Drive save; the JSON backup is the file format.
- Not checked on a real touch device: finger drags use the grip (`touch-action: none`), checked only with synthetic events.
