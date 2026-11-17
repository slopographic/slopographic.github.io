/* SlopFmp: open FileMaker Pro files in the browser, read only. The public entry; see shared/fmp/HANDOFF.md.
   The binary reader is a port of fmptools (github.com/evanmiller/fmptools), (c) 2020 Evan Miller, MIT licence
   (see LICENSE-fmptools.txt in this folder).
     SlopFmp.detect(bytes, name) -> { kind, label } | null
         kind: 'fp3' | 'fp5' | 'fp7' | 'fmp12' | 'fmpxmlresult' | 'fmxmlsnippet' | 'ddr'. bytes: a Uint8Array with at least
         the first 4 KB of the file; name: the file name or ''. Never throws.
     SlopFmp.open(input, { name }) -> Promise<Db>      input: Blob | ArrayBuffer | Uint8Array
         Db = { format, label, version, warnings, tables: [{ id, name, columns: [{ name, type? }], rowCount }],
                rows(tableId, from, count) -> Promise<string[][]>, csv(tableId) -> Promise<Blob>,
                json(tableId) -> Promise<Blob>, close() }
         Rejects with an Error whose .code is 'not-filemaker', 'encrypted', 'unsupported', 'corrupt' or 'too-large'.
     SlopFmp.MAX_BYTES: the largest file read into memory (512 MB; a bigger one is 'too-large').
   Also accepted in opts: onProgress(0..1) while a big file is scanned. */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const MAX_BYTES = 512 * 1024 * 1024;
  const LABELS = {
    fp3: 'FileMaker Pro 3-4 database', fp5: 'FileMaker Pro 5-6 database', fp7: 'FileMaker Pro 7-11 database',
    fmp12: 'FileMaker Pro 12+ database', fmpxmlresult: 'FileMaker XML export', fmxmlsnippet: 'FileMaker XML snippet',
    ddr: 'FileMaker Database Design Report',
  };
  const ascii = (b, from, to) => String.fromCharCode.apply(null, Array.prototype.slice.call(b, from, to));
  const fail = (code, message) => Object.assign(new Error(message || code), { code, name: 'FmpError' });
  const answer = (kind) => ({ kind, label: LABELS[kind] });

  /** The kind of a binary FileMaker file from its header (Pro 3 to 12: the "Pro N.0" string, then the extension). */
  function binaryKind(b, name) {
    const ext = (/\.([^./\\]+)$/.exec(String(name || '')) || [])[1];
    const vlen = Math.min(b[541] || 0, 9);
    const major = parseInt((/^Pro (\d+)/.exec(ascii(b, 542, 542 + vlen)) || [])[1], 10);
    if (ascii(b, 15, 19) === 'HBAM') {
      if (major >= 12) return 'fmp12';
      if (major >= 7) return 'fp7';
      return b[521] === 0x1E || /^fmp12$/i.test(ext || '') ? 'fmp12' : 'fp7';
    }
    if (major <= 4) return 'fp3';
    return major ? 'fp5' : /^fp3$/i.test(ext || '') ? 'fp3' : 'fp5';
  }
  const MAGIC = [0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x05, 0x00, 0x02, 0x00, 0x02, 0xC0];

  function detect(bytes, name) {
    try {
      if (bytes && !ArrayBuffer.isView(bytes) && typeof bytes.byteLength === 'number') bytes = new Uint8Array(bytes);
      if (!bytes || bytes.length < 4) return null;
      if (bytes.length >= MAGIC.length && MAGIC.every((v, i) => bytes[i] === v)) return answer(binaryKind(bytes, name));
      const xml = F.xml.sniffBytes(bytes);
      return xml ? answer(xml) : null;
    } catch (e) { return null; }
  }

  /** The bytes of a Blob, ArrayBuffer or typed array (no copy for the last two); a Blob over the limit is not read. */
  async function bytesOf(input) {
    if (input && typeof input.arrayBuffer === 'function' && typeof input.size === 'number') {
      if (input.size > MAX_BYTES) {
        const head = new Uint8Array(await input.slice(0, 4096).arrayBuffer());
        throw fail(detect(head, '') ? 'too-large' : 'not-filemaker');
      }
      return new Uint8Array(await input.arrayBuffer());
    }
    let bytes = null;
    if (input && ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    else if (input && typeof input.byteLength === 'number') bytes = new Uint8Array(input);
    if (!bytes) throw fail('not-filemaker', 'not a file');
    if (bytes.length > MAX_BYTES) throw fail(detect(bytes.subarray(0, 4096), '') ? 'too-large' : 'not-filemaker');
    return bytes;
  }

  async function open(input, opts) {
    try {
      opts = opts || {};
      const bytes = await bytesOf(input);
      const found = detect(bytes, opts.name);
      if (!found) throw fail('not-filemaker');
      let R, version = '';
      if (found.kind === 'fmpxmlresult') R = F.xml.open(bytes, opts);
      else if (found.kind === 'fmxmlsnippet' || found.kind === 'ddr') throw fail('unsupported', found.label + ' files cannot be shown as a table');
      else {
        const info = F.sectors.header(bytes);
        if (info.error) throw fail(info.error);
        const tbl = F.sectors.table(bytes, info, opts.order === 'file');
        if (tbl.error) throw fail(tbl.error);
        version = info.versionString;
        R = await F.reader.openBinary(bytes, info, tbl, opts);
        if (!R.tables.length && R.warnings) throw fail('corrupt', 'no table could be read');
      }
      return makeDb(found, version, R);
    } catch (e) {
      if (e && e.code) throw e;
      throw fail(e instanceof RangeError && /length|memory|alloc/i.test(e.message) ? 'too-large' : 'corrupt', e && e.message);
    }
  }

  function makeDb(found, version, R) {
    const tables = R.tables.map((t) => ({
      id: t.id, name: t.name, rowCount: t.rowCount,
      columns: t.columns.map((c) => (c.type ? { name: c.name, type: c.type } : { name: c.name })),
    }));
    const find = (id) => R.tables.find((t) => t.id === String(id));
    const exporter = (kind) => async (id) => {
      const t = find(id);
      if (!t) throw new RangeError('no such table: ' + id);
      return F.exporters[kind](R, t);
    };
    return {
      format: found.kind, label: found.label, version, warnings: R.warnings, tables,
      rows: (id, from, count) => R.rows(id, from, count),
      csv: exporter('csv'), json: exporter('json'), close: () => R.close(),
    };
  }

  F.detect = detect;
  F.open = open;
  F.MAX_BYTES = MAX_BYTES;
})(typeof window !== 'undefined' ? window : globalThis);
