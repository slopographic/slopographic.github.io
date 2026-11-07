
## Assistant commands (`js/commands.js`, `js/ai-commands.js`)
The page now starts SlopCmd (`js/commands.js`); the assistant's `nodes.ai.*` commands load on demand. Each change goes through
`SlopNodesApp.edit` / `replace` (one undo step; a refused change leaves the graph as it was): `new_graph`, `build_graph`
(`nodes: [{ name, type, expr, inputs }]`), `add_node`, `connect`, `disconnect`, `set_node`, `delete_node` (destructive),
`save_project` (projects.js), `export_graph` (JSON, or CSV of the results, to Slop Drive and/or a download), `undo`.
Test: `tests/nodes/ai-commands.test.html`.
