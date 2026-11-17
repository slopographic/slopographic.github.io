/* A fake database for the shared/fmp viewer tests: the Db that SlopFmp.open resolves (format, label, tables, rows(), csv(),
   json(), close()), made in memory. FakeFmp.make({ rows, delay, extra }) → db. db.calls lists every rows() call as
   [tableId, from, count]; db.failPages (a Set of "from" offsets) makes the next read of those pages fail once. */
window.FakeFmp = (function () {
  'use strict';
  const NAMES = ['ID', 'Name', 'City', 'Email', 'Notes', 'Amount', 'Created', 'Active'];
  const TYPES = ['Number', 'Text', 'Text', 'Text', 'Text', 'Number', 'Date', null];
  const CITIES = ['Oslo', 'Lima', 'Pune', 'Kyiv', 'Cork', 'Bern', 'Hanoi', 'Quito'];
  /** One cell, from its row and column: the same every time. Two rows carry the word needle (7777 and 9500, counting from 0). */
  function cell(r, c) {
    if (c === 0) return String(r + 1);
    if (c === 1) return 'Name ' + r;
    if (c === 2) return CITIES[r % CITIES.length];
    if (c === 3) return 'person' + r + '@example.test';
    if (c === 4) return r === 7777 || r === 9500 ? 'a needle in row ' + (r + 1) : r % 50 === 0 ? 'A long note that goes on and on, '.repeat(6) + r : '';
    if (c === 5) return String((r * 37) % 1000) + '.50';
    if (c === 6) return '2024-0' + (1 + (r % 9)) + '-1' + (r % 10);
    return r % 2 ? 'yes' : '';
  }
  function make(o) {
    o = o || {};
    const delay = o.delay == null ? 15 : o.delay, n = o.rows == null ? 10000 : o.rows;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const db = {
      format: 'fmp12', label: 'FileMaker Pro 12+ (fmp12)', calls: [], closed: 0, exported: [], failPages: new Set(),
      tables: [
        { id: 't1', name: 'Contacts', rowCount: n, columns: NAMES.map((name, i) => (TYPES[i] ? { name, type: TYPES[i] } : { name })) },
        { id: 't2', name: 'Orders', rowCount: 30, columns: [{ name: 'Order' }, { name: 'Item' }, { name: 'Qty' }] },
        { id: 't3', name: 'Empty', rowCount: 0, columns: [{ name: 'Nothing' }] },
        ...(o.extra || []),
      ],
      async rows(id, from, count) {
        db.calls.push([id, from, count]);
        await wait(delay);
        if (db.failPages.has(from)) { db.failPages.delete(from); throw new Error('read failed'); }
        const t = db.tables.find((x) => x.id === id), out = [];
        for (let r = from; r < Math.min(from + count, t.rowCount); r++) out.push(t.columns.map((_, c) => (id === 't1' ? cell(r, c) : id === 't2' ? ['A' + r, 'Item ' + r, String(r % 5)][c] : '')));
        return out;
      },
      async csv(id) { db.exported.push(['csv', id]); return new Blob(['a,b\n1,2\n'], { type: 'text/csv' }); },
      async json(id) { db.exported.push(['json', id]); return new Blob(['[{"a":1}]'], { type: 'application/json' }); },
      close() { db.closed++; },
    };
    return db;
  }
  return { make, cell };
})();
