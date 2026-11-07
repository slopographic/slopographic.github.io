// The suite's layout rule (shared/frame/HANDOFF.md, "settings and the main button live in the right panel") stays true
// for every app the audit there marks done: the audit table is the one list, this test reads it. A done app loads
// SlopFrame (frame.css, frame.js, panel.js, and sheet.js for phones), and a done tool also puts its main button in the
// panel's footer (panel.js footer()); a done editor (or a non-tool app that keeps its own right panel) puts its main button in the shared footer. The browser tests of each app check the look (tests/<app>/…).
// Covers: shared/frame/HANDOFF.md, shared/frame/frame.js, shared/frame/panel.js, shared/biz/panel.js, watermark/js/main.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');

async function audit() {
  const md = await read('shared/frame/HANDOFF.md');
  const at = md.indexOf('## Audit');
  assert.ok(at > 0, 'the audit section is in shared/frame/HANDOFF.md');
  return md.slice(at).split('\n').filter((l) => /^\| [^-|]/.test(l) && !/^\| App \|/.test(l)).map((l) => {
    const [name, folder, kind, , status] = l.split('|').slice(1).map((c) => c.trim());
    const subs = (folder.match(/\(\+ ([^)]+)\)/) || [])[1];   // "aitools/ (+ ocr, speech)": the tool pages under the folder
    return { name, folder: folder.split(' ')[0], pages: subs ? subs.split(',').map((x) => x.trim()) : null, kind, status };
  });
}

/** Every script in the app's folder (its own code; sub-pages included). */
async function ownScripts(dir) {
  const files = await readdir(path.join(ROOT, dir), { recursive: true });
  const js = files.filter((f) => /\.(m?js)$/.test(f) && !/(^|\/)(vendor|node_modules)\//.test(f));
  return (await Promise.all(js.map((f) => read(path.join(dir, f))))).join('\n');
}

test('the audit names every app in the registry once, with a known status', async () => {
  const rows = await audit();
  const g = {};
  new Function('window', await read('shared/apps.js'))(g);
  const names = rows.map((r) => r.name);
  for (const a of g.SLOP_APPS) assert.ok(names.includes(a.name), a.name + ' is in the audit');
  assert.equal(new Set(names).size, names.length, 'no app twice');
  for (const r of rows) assert.ok(['done', 'close', 'to do', 'n/a'].includes(r.status), r.name + ': status ' + r.status);
});

test('the business apps\' shared record panel mounts SlopFrame with the shared footer', async () => {
  const js = await read('shared/biz/panel.js');
  assert.ok(/SlopFrame\.mount\(/.test(js) && /\.footer\(/.test(js), 'shared/biz/panel.js mounts SlopFrame and puts the main button in the footer');
  assert.ok(/SlopBiz\.panel\.mount\(|panel\.mount\(/.test(await read('shared/docs/doc-layout.js')), 'shared/docs/doc-layout.js uses it');
});

test('every app marked done loads SlopFrame and its phone sheet; a done tool has its main button in the panel footer', async () => {
  const done = (await audit()).filter((r) => r.status === 'done');
  assert.ok(done.length >= 3, 'some apps are done');
  for (const r of done) {
    const dir = r.folder.replace(/\/$/, '');
    const html = (await Promise.all((r.pages ? r.pages.map((x) => dir + '/' + x) : [dir]).map((d) => read(d + '/index.html')))).join('\n');
    const js = await ownScripts(dir);
    // in the page, or in a script list the app loads (slides/js/manifest.js)
    const loads = (f) => html.includes('shared/frame/' + f) || js.includes("'shared/frame/" + f + "'");
    const all = html + js;
    assert.ok(/shared\/frame\/frame\.css/.test(all), r.name + ': frame.css');
    assert.ok(loads('panel.js'), r.name + ': panel.js');
    assert.ok(all.includes('shared/ui/sheet.js'), r.name + ': shared/ui/sheet.js (the phone sheet)');
    // An editor keeps its own panel and takes the shared footer for its main button; so may a viewer, records app or other
    // app that already had its own right panel (Slop Drive's info panel). A tool always mounts SlopFrame.
    const bare = /SlopFramePanel\.create\(.*bare: true/.test(js) && /\.footer\(/.test(js);
    if (r.kind === 'editor' || (r.kind !== 'tool' && bare && !/SlopFrame\.mount\(/.test(js))) {
      // (an editor that had no panel builds one with the shared sections: Slop Docs' Document panel)
      assert.ok(bare || (r.kind === 'editor' && /SlopFramePanel\.create\(/.test(js) && /\.footer\(/.test(js)), r.name + ': the shared footer on its own panel');
      // a records app's own panel (Contacts' card, CRM's record) is a SlopSheet bottom sheet on a phone, not a page
      if (r.kind === 'records') assert.ok(/SlopSheet\.attach\(/.test(js), r.name + ': its record is a SlopSheet on a phone');
      continue;
    }
    assert.ok(loads('frame.js'), r.name + ': frame.js');
    // the business apps mount it through their one shared layer (shared/biz/panel.js; the document apps through shared/docs/doc-layout.js)
    const viaBiz = r.kind !== 'tool' && html.includes('shared/biz/panel.js') && /SlopBiz\.panel\b|SlopDocs\.docLayout\.mount\(/.test(js);
    assert.ok(viaBiz || (/SlopFrame\.mount\(/.test(js) && /(SlopFrame\.panel|SlopFramePanel\.create)\(/.test(js)), r.name + ': mounts SlopFrame and its panel');
    if (r.kind === 'tool' && r.folder !== 'workflows/') assert.ok(/\.footer\(/.test(js), r.name + ': the main button is in the panel footer');
  }
});

test('no app is left "close" or "to do": every row is done or n/a', async () => {
  const left = (await audit()).filter((r) => r.status === 'close' || r.status === 'to do').map((r) => r.name);
  assert.deepEqual(left, []);
});

test('Slop Watermark, rebuilt on SlopFrame, is done: the list, view and panel, Watermark N files the footer\'s primary button', async () => {
  const row = (await audit()).find((r) => r.name === 'Slop Watermark');
  assert.equal(row.status, 'done');
  const js = await read('watermark/js/main.js');
  assert.ok(/SlopFrame\.mount\(\$\('wm-main'\), \{ list: \$\('wm-files'\), view: \$\('wm-work'\), panel: \$\('wm-panel'\)/.test(js), 'mounts SlopFrame with its files, preview and panel');
  assert.ok(/side\.footer\(\[\s*\{ id: 'wm-apply'[^\n]*primary: true/.test(js), 'Watermark N files is the primary button at the panel\'s foot');
});
