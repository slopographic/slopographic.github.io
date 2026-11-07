#!/usr/bin/env node
// Builds every app with a shared offline build into downloads/<id>.html, with a size report.
//   node tools/offline/build-all.mjs            every app in the manifest (shared/offline/manifest.js)
//   node tools/offline/build-all.mjs pdf vector  only these ids
// downloads/ is not committed (see .gitignore). The landing pages link to /downloads/<id>.html.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, OFFLINE_APPS, buildApp } from './lib.mjs';
import { loadRegistry } from '../seo/site.mjs';

const only = process.argv.slice(2);
const apps = await loadRegistry();
const ids = new Set(apps.map((a) => a.id));
for (const id of only) if (!ids.has(id)) throw new Error(`${id}: not in shared/apps.js`);
for (const id of Object.keys(OFFLINE_APPS)) if (!ids.has(id)) throw new Error(`${id}: in the offline manifest but not in shared/apps.js`);

const out = path.join(ROOT, 'downloads');
await mkdir(out, { recursive: true });
let failed = 0;
for (const app of apps) {
  if (only.length && !only.includes(app.id)) continue;
  const M = OFFLINE_APPS[app.id];
  if (!M) { console.log(`${app.id.padEnd(12)} no offline build`); continue; }
  if (M.offline === false) { console.log(`${app.id.padEnd(12)} not on the shared builder: ${M.note}`); continue; }
  try {
    const html = await buildApp(app.id);
    await writeFile(path.join(out, `${app.id}.html`), html);
    console.log(`${app.id.padEnd(12)} ${(html.length / 1024).toFixed(0).padStart(6)} KB  downloads/${app.id}.html`);
  } catch (e) { failed++; console.log(`${app.id.padEnd(12)} FAILED: ${e.message}`); }
}
if (failed) process.exit(1);
