# qr: handoff

## Assistant commands (`js/ai-commands.js`)
Loaded on demand by `SlopCmd.prepare()` (`js/commands.js`); `qr.ai.*`, hidden, none destructive. `new_qr` (label, kind, values
by the kind's form fields, text, raw, and the design), `set_content`, `set_design` (size, ec, fg, bg, transparent, shape,
gradient, fg2, quiet), `add_logo` (a built-in mark, or a picture from Slop Drive or this site through
`shared/commands/sources.js`, width %), `remove_logo`, `export_qr` (PNG to Slop Drive with its .qr.json settings through
`QRSave.saveTo`, SVG or the print PDF, and/or a download). Each result says what is encoded. The checkpoint is
`QRState.snapshot`, put back with `restore`. Test: `tests/qr/ai-commands.test.html`.
