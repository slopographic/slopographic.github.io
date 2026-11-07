// Slop Notes: an HTML table converts to the expected Markdown table (notes/js/table.js). The conversion reads the paste with
// DOMParser, which Node does not have, so the two pure modules (table.js and markdown.js) are loaded as blob modules in a
// headless Chromium page, and the real DOMParser runs there. Checks headers, alignment, escaped pipes, spans, inline marks,
// inert script text, and that the Markdown renders back to a table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
    try { return createRequire(import.meta.url)(p); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium');
}

const CASES = {
  headerAndRows: '<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Pens</td><td>3</td></tr></table>',
  alignment: '<table><tr><th align="left">A</th><th style="text-align: right">B</th><th>C</th></tr>' +
    '<tr><td>1</td><td>2</td><td align="center">3</td></tr></table>',
  escapedPipe: '<table><tr><th>Expr</th></tr><tr><td>a | b</td></tr></table>',
  spreadsheet: '<html><body><table border="0" cellspacing="0"><col width="100"><col width="60">' +
    '<tr><td>Item</td><td>Cost</td></tr><tr><td>Tea</td><td>1.50</td></tr></table></body></html>',
  inlineMarks: '<table><tr><th>Note</th></tr><tr><td><b>Bold</b> and <a href="https://example.com/x">link</a><br>next <em>it</em></td></tr></table>',
  colspan: '<table><tr><th colspan="2">Wide</th></tr><tr><td>a</td><td>b</td></tr></table>',
  rowspan: '<table><tr><th>Group</th><th>X</th></tr><tr><td rowspan="2">G</td><td>1</td></tr><tr><td>2</td></tr></table>',
  scriptText: '<table><tr><th>T</th></tr><tr><td>x<script>alert(1)</script></td></tr></table>',
  nested: '<table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table>',
  noTable: '<p>Just <b>text</b>, no table.</p>',
};

const EXPECT = {
  headerAndRows: ['| Name | Qty |', '| --- | --- |', '| Pens | 3 |'].join('\n'),
  alignment: ['| A | B | C |', '| :--- | ---: | :---: |', '| 1 | 2 | 3 |'].join('\n'),
  escapedPipe: ['| Expr |', '| --- |', '| a \\| b |'].join('\n'),
  spreadsheet: ['| Item | Cost |', '| --- | --- |', '| Tea | 1.50 |'].join('\n'),
  inlineMarks: ['| Note |', '| --- |', '| **Bold** and [link](https://example.com/x) next *it* |'].join('\n'),
  colspan: ['| Wide |  |', '| --- | --- |', '| a | b |'].join('\n'),
  rowspan: ['| Group | X |', '| --- | --- |', '| G | 1 |', '|  | 2 |'].join('\n'),
  scriptText: ['| T |', '| --- |', '| x |'].join('\n'),
  nested: ['| outer inner |', '| --- |'].join('\n'),
  noTable: null,
};

test('an HTML table pastes as the expected Markdown table, and text with no table gives nothing', async () => {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const load = async (rel) => readFile(path.join(ROOT, rel), 'utf8');
    // markdown.js imports shared/sanitize/sanitize.js for its link check: a blob module cannot resolve that path, so the
    // classic script goes in first and the import line is left out.
    await page.addScriptTag({ content: await load('shared/sanitize/sanitize.js') });
    const sources = { table: await load('notes/js/table.js'), markdown: (await load('notes/js/markdown.js')).replace(/^import '[^']*sanitize\.js';$/m, '') };
    const got = await page.evaluate(async ({ sources, cases }) => {
      const mod = (src) => import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      const T = await mod(sources.table);
      const M = await mod(sources.markdown);
      const out = {};
      for (const [k, html] of Object.entries(cases)) {
        const md = T.tablesFromHtml(html);
        out[k] = { md: md.length ? md.join('\n\n') : null, rendered: md.length ? M.render(md.join('\n\n')) : '' };
      }
      out.escaped = M.cellsOf('| a \\| b | c |');
      out.blank = T.blankTable(1, 2);
      return out;
    }, { sources, cases: CASES });

    for (const [k, want] of Object.entries(EXPECT)) assert.equal(got[k].md, want, `table case ${k}`);

    // The Markdown renders back as a table with the header and body cells (the preview and the export).
    assert.match(got.alignment.rendered, /<th style="text-align:left">A<\/th>/);
    assert.match(got.alignment.rendered, /<td style="text-align:center">3<\/td>/);
    assert.match(got.escapedPipe.rendered, /<td>a \| b<\/td>/);
    assert.equal((got.headerAndRows.rendered.match(/<td>/g) || []).length, 2);

    // A piped cell splits on the unescaped pipes only; the blank table has the header names and an empty body row.
    assert.deepEqual(got.escaped, ['a | b', 'c']);
    assert.equal(got.blank, ['| Column 1 | Column 2 |', '| --- | --- |', '|  |  |'].join('\n'));
  } finally {
    await browser.close();
  }
});
