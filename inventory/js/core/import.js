// Product CSV: plan an import (a validation report, nothing written), apply it all or nothing, and export the list.
// Columns read by name, in any order: sku, ean, name, price, reorder level. sku, name and price are required.
// A row whose SKU already exists updates that product (name, EAN, price, reorder level); tax rate and unit are kept.
// Other columns (such as tax rate or on hand in an export) are ignored, so an exported file imports back.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInv = g.SlopInv || {});
  const { ok, fail } = S.result;
  const COLS = ['sku', 'ean', 'name', 'price', 'reorderLevel'];
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const REQUIRED = ['sku', 'name', 'price'];
  const norm = (str) => String(str ?? '').toLowerCase().replace(/[^a-z]/g, '');

  /** Column index for each known column, by normalised header name ("Reorder level" -> reorderlevel). */
  function columnsOf(header) {
    const names = header.map(norm);
    const col = {};
    for (const c of COLS) { const i = names.indexOf(norm(c)); if (i >= 0) col[c] = i; }
    return col;
  }

  /** Validates every row against the schema and the existing products. Writes nothing. */
  function planImport(text, products, settings) {
    const parsed = NS.csv.parse(text);
    if (parsed.error) return { ok: false, headerErrors: [parsed.error], lines: [], records: [], newCount: 0, updateCount: 0 };
    const [header = [], ...body] = parsed.rows;
    const col = columnsOf(header);
    const headerErrors = REQUIRED.filter((k) => col[k] === undefined).map((k) => `the header has no "${k === 'reorderLevel' ? 'reorder level' : k}" column`);
    if (!parsed.rows.length) headerErrors.push(t('inventory.im.e_empty'));
    if (!body.length && !headerErrors.length) headerErrors.push(t('inventory.im.e_no_rows'));
    const cur = settings.currency;
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const byEan = new Map(products.filter((p) => p.ean).map((p) => [p.ean, p]));
    const seenSku = new Map(), seenEan = new Map();
    const lines = [], records = [];
    body.forEach((cells, i) => {
      const line = i + 2; // the header is line 1
      const get = (k) => (col[k] === undefined ? undefined : String(cells[col[k]] ?? '').trim());
      const errors = [];
      const sku = get('sku') ?? '';
      const name = get('name') ?? '';
      const existing = bySku.get(sku) || null;
      const priceText = get('price') ?? '';
      const price = S.money.parseMinor(priceText, cur);   // strict "12.50": a CSV file has no language setting, so never the page's
      if (priceText === '') errors.push({ field: 'price', message: t('inventory.pf.required') });
      else if (price === null) errors.push({ field: 'price', message: t('inventory.im.e_price') });
      let reorderLevel = existing ? existing.reorderLevel : undefined;
      const reorderText = get('reorderLevel');
      if (reorderText !== undefined) {
        if (reorderText === '') reorderLevel = undefined;
        else if (/^\d+$/.test(reorderText) && Number.isSafeInteger(Number(reorderText))) reorderLevel = Number(reorderText);
        else errors.push({ field: 'reorderLevel', message: t('inventory.im.e_reorder') });
      }
      const eanText = get('ean');
      const ean = eanText === undefined ? (existing ? existing.ean : undefined) : S.barcode.normalizeEan(eanText) || undefined;
      if (sku && seenSku.has(sku)) errors.push({ field: 'sku', message: t('inventory.im.e_again', { n: seenSku.get(sku) }) });
      if (ean && seenEan.has(ean)) errors.push({ field: 'ean', message: `appears again, first on line ${seenEan.get(ean)}` });
      if (ean && byEan.get(ean) && (!existing || byEan.get(ean).id !== existing.id)) {
        errors.push({ field: 'ean', message: `already belongs to product ${byEan.get(ean).sku}` });
      }
      const base = existing ? { ...existing } : { taxRate: settings.defaultTaxRate, unit: 'each' };
      const input = { ...base, sku, name, ean, reorderLevel, price: price === null ? undefined : price };
      const prepared = S.schema.prepare('products', input);
      for (const e of prepared.errors) if (!errors.some((x) => x.field === e.field)) errors.push(e);
      const action = errors.length ? 'error' : existing ? 'update' : 'new';
      if (sku) seenSku.set(sku, line);
      if (ean) seenEan.set(ean, line);
      lines.push({ line, action, sku, name, price: price === null ? null : price, errors });
      if (!errors.length) records.push(prepared.value);
    });
    const badRows = lines.filter((l) => l.errors.length).length;
    const valid = !headerErrors.length && body.length > 0 && badRows === 0;
    return {
      ok: valid, headerErrors, lines, records, badRows,
      newCount: lines.filter((l) => l.action === 'new').length,
      updateCount: lines.filter((l) => l.action === 'update').length,
    };
  }

  /** Writes a valid plan in one transaction. A plan with any error changes nothing. */
  function applyImport(plan) {
    if (!plan || !plan.ok) return Promise.resolve(fail('invalid', t('inventory.im.e_errors')));
    return S.store.transact(async (tx) => {
      for (const rec of plan.records) {
        const w = await tx.put('products', rec);
        if (!w.ok) return w;
      }
      return ok(plan.records.length);
    });
  }

  /** The product list as CSV rows: the import columns, then tax rate, unit and on hand. */
  function exportRows(rows, settings) {
    const head = ['SKU', 'EAN', 'Name', 'Price', 'Reorder level', 'Tax rate %', 'Unit', 'On hand'];   // i18n-ignore: CSV columns, a file format for other programs
    const body = rows.map((r) => [
      r.sku, r.ean || '', r.name, NS.util.majorText(r.price, settings.currency),
      r.reorderLevel ?? '', NS.util.percentText(r.taxRate), r.unit || '', r.onHand,
    ]);
    return [head, ...body];
  }

  NS.importer = { planImport, applyImport, exportRows, columnsOf };
})(typeof window !== 'undefined' ? window : globalThis);
