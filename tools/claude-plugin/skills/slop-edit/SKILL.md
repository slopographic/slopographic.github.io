---
name: slop-edit
description: Do a task in the Slopographic apps in the browser (edit a photo in PhotoSlop, convert files, run a workflow, work on a PDF) with the apps' own commands, and bring the result back as a local file. Use when the person asks to edit, convert or process a file with Slopographic.
argument-hint: "\"<task>\" [file]"
---

The task: $ARGUMENTS

1. Call `status` (Slopographic MCP server). If no tab is connected, follow the slop-connect steps first (call `connect` with the app that fits the task, show the code, wait with `status`).
2. If the task names a local file, send it with `send_file_to_app` (`into: "app"` to open it in the app; `into: "drive"` when a workflow or operation should use it by name). Use paths in the working folder; only use `allow_outside: true` for a path the person named.
3. Look before acting: `slop_app_state` (when the app has it), `slop_list_commands`, `slop_list_operations` or `slop_list_files`. Then do the task with the `slop_` tools, one clear step at a time. Destructive steps ask the person in the browser; if they refuse, stop and say so.
4. Bring the result back with `save_result` (a Slop Drive file by name or id, or `"open"` for what the app has open) to a path the person gave, or next to the input file with a new name. Never overwrite a file unless the person asked.
5. Say in a few plain words what was done and where the result is.
