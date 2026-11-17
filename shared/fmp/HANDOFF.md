# shared/fmp: open FileMaker Pro files (window.SlopFmp), read only

Reads `.fp3`, `.fp5`, `.fp7`, `.fmp12` databases (tables, columns, records) and the XML FileMaker exports, in the browser
or Node, with no network. The binary reader is a JavaScript port of **fmptools** by Evan Miller (MIT, see
`LICENSE-fmptools.txt`; `NOTICE.md` has the credit line). `xml.js` and `export.js` are original.

## Files (load in this order; classic scripts, each an IIFE on `window.SlopFmp`, each at most 300 lines)

| File | What |
|---|---|
| `scsu.js` | SCSU decoder (Pro 7+ text), with the C code's quirks |
| `charset.js` | `text(bytes, start, length, v7)`: XOR 0x5A + SCSU (Pro 7+) or MacRoman (Pro 3 to 6), leading spaces removed |
| `sectors.js` | header, sector table, chain of leaf sectors |
| `chunks.js` | chunk kinds, path numbers, the Pro 3 to 6 decoder |
| `chunks7.js` | the Pro 7+ decoder (adds `SlopFmp.chunks.decode7`) |
| `values.js` | path matching, names, the record/value state machine (repeating fields, long values) |
| `reader.js` | one walk over the leaves: tables, columns, row counts, checkpoints; `rows()` paging |
| `xml.js` | FMPXMLRESULT as a table; `<fmxmlsnippet>` and `<FMPReport>` recognised only |
| `export.js` | CSV (UTF-8 BOM, CRLF) and JSON (array of objects) as Blobs |
| `fmp.js` | the public entry: `detect`, `open`, `MAX_BYTES` |

## API

```
SlopFmp.detect(bytes /* Uint8Array, first 4 KB or more */, name) -> { kind, label } | null
   kind: 'fp3' | 'fp5' | 'fp7' | 'fmp12' | 'fmpxmlresult' | 'fmxmlsnippet' | 'ddr'
SlopFmp.open(Blob | ArrayBuffer | Uint8Array, { name?, onProgress?(0..1) }) -> Promise<Db>
   Db = { format, label, version, warnings,
          tables: [{ id, name, columns: [{ name, type? }], rowCount }],
          rows(tableId, from, count) -> Promise<string[][]>,      // one string per column, '' where there is no value
          csv(tableId) -> Promise<Blob>, json(tableId) -> Promise<Blob>, close() }
   rejects with an Error whose .code is 'not-filemaker' | 'encrypted' | 'unsupported' | 'corrupt' | 'too-large'
SlopFmp.MAX_BYTES   // 512 MB
```

`name` is the file name: it gives the table its name in Pro 3 to 6 files (they hold one table) and is a hint for `detect`.
`warnings` counts sectors that could not be read (they are skipped; the rest is shown). `type` (text, number, date, time,
container, calc, summary, global) exists for Pro 3 to 6 columns, and (text, number, date, time, timestamp, container)
for FMPXMLRESULT; Pro 7+ columns have no type. Another option, `order: 'file'`, reads the sectors in file order, for
files whose links were rewritten (test files only).

## Limits and behaviour

- Read only; the whole file is read into memory (at most 512 MB, more is `too-large`); `open()` walks the file once (in
  slices, so a page stays responsive) and `rows()` then reads only the sectors of the page asked for.
- Values are text as the C tool prints it: UTF-8/UTF-16 text, leading spaces removed, a repeating field's values joined
  with U+001D, line breaks as they are stored (Pro 7+ gives LF, Pro 3 to 6 keep CR). Numbers, dates and times are
  the text FileMaker stored. Containers (pictures, files), the contents of summary and calculation fields that are not
  stored, value lists, layouts, scripts, relationships and field options are not read.
- Encrypted (`HBAMe`) files are `encrypted`; XML snippets and Design Reports are `unsupported` (detected, not shown).
- Never throws synchronously; every loop is bounded by the file size; a fault in one sector skips that sector.

## Find a kind of text
The table's find box has a list beside it when `shared/patterns/` is on the page (`window.SlopPatterns`; `view-load.js` loads it): choosing "IP address", "E-mail address", "Key or token"... finds the next row with a cell that holds one (and the box text, if any), and marks it. Words: `ui.fmp.pattern`, `ui.fmp.pattern_none` and the kind names `ui.patterns.<id>`.
