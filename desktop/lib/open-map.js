/* Which app opens a file the system hands the desktop app (a double-click, "Open with", a drop on the Dock icon, File ▸
 * Open…). The site's own two mappings, in this order:
 *   1. the installed web app's file handlers (manifest.webmanifest "file_handlers": pdf → /pdf/, png → /photoslop/, …),
 *      what the browser opens an installed copy of the site with;
 *   2. Slop Drive's default app for a file (drive/js/core/io.js DR.appsFor, without a remembered choice): the app that
 *      makes the type, else the most specific "accepts" match in the registry (shared/apps.js), tools never first.
 * Anything else opens in Slop Drive (/drive/), which takes every file. Pure apart from loadRegistry (reads the site).
 * The one table of the types the suite's apps open: the desktop installers and the iPhone/iPad app's document types
 * (mobile/ios/doctypes.mjs: Open in…, the share sheet, Files) both register it.
 *   ASSOCIATIONS                 the types the apps register: [{ ext: ['jpg', 'jpeg'], mime, name, uti }] (uti: the
 *                                Apple type identifiers, the first one the type's own)
 *   extOf(name)                  'pdf' (lower case, no dot; '' when none)
 *   mimeOfExt(ext)               the MIME type the site's apps match against
 *   driveRoute(ext, apps)        '/docs/' or null: Drive's default app for the type (rule 2)
 *   openMap(manifest, apps)      { ext: route } for every extension in ASSOCIATIONS and the manifest
 *   routeFor(name, map)          the route a file opens at ('/drive/' when no app takes it)
 *   loadRegistry(siteDir)        { manifest, apps } read from a site folder (shared/apps.js run in a sandbox) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ASSOCIATIONS = [
  { ext: ['pdf'], mime: 'application/pdf', name: 'PDF document', uti: ['com.adobe.pdf'] },
  { ext: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Word document', uti: ['org.openxmlformats.wordprocessingml.document'] },
  { ext: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'Excel workbook', uti: ['org.openxmlformats.spreadsheetml.sheet'] },
  { ext: ['csv'], mime: 'text/csv', name: 'CSV file', uti: ['public.comma-separated-values-text'] },
  { ext: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', name: 'PowerPoint presentation', uti: ['org.openxmlformats.presentationml.presentation'] },
  { ext: ['png'], mime: 'image/png', name: 'PNG image', uti: ['public.png'] },
  { ext: ['jpg', 'jpeg'], mime: 'image/jpeg', name: 'JPEG image', uti: ['public.jpeg'] },
  { ext: ['heic', 'heif'], mime: 'image/heic', name: 'HEIC image', uti: ['public.heic', 'public.heif'] },
  { ext: ['webp'], mime: 'image/webp', name: 'WebP image', uti: ['org.webmproject.webp'] },
  { ext: ['svg'], mime: 'image/svg+xml', name: 'SVG image', uti: ['public.svg-image'] },
  { ext: ['psd'], mime: 'image/vnd.adobe.photoshop', name: 'Photoshop document', uti: ['com.adobe.photoshop-image'] },
  { ext: ['txt'], mime: 'text/plain', name: 'Text file', uti: ['public.plain-text'] },
  { ext: ['md'], mime: 'text/markdown', name: 'Markdown file', uti: ['net.daringfireball.markdown'] },
  { ext: ['json'], mime: 'application/json', name: 'JSON file', uti: ['public.json'] },
  { ext: ['eml'], mime: 'message/rfc822', name: 'Email message', uti: ['com.apple.mail.email'] },
];
const MIME_OF = new Map(ASSOCIATIONS.flatMap((a) => a.ext.map((e) => [e, a.mime])));

const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(path.basename(String(name || ''))); return m ? m[1].toLowerCase() : ''; };
const mimeOfExt = (ext) => MIME_OF.get(ext) || '';

/** A MIME pattern match as shared/hub.js does it: '*', 'type/*' or the exact type. */
const matches = (type, p) => p === '*' || (p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) : type === p);

function driveRoute(ext, apps) {
  const type = mimeOfExt(ext);
  const rank = (a) => {
    if ((a.creates || []).some((c) => (type && c.mime === type) || (!!ext && c.ext === ext))) return 3;
    let best = 0;
    for (const p of a.accepts || []) if (type && matches(type, p)) best = Math.max(best, p.includes('*') || a.tool ? 1 : 2);
    return best;
  };
  const list = (apps || []).filter((a) => a.kind === 'app' && a.id !== 'drive' && rank(a) > 0);
  if (!list.length) return null;
  const top = list.reduce((b, a) => (rank(a) > rank(b) ? a : b));   // the first of the best, as a stable sort gives
  return '/' + String(top.path).replace(/^\/+/, '');
}

function openMap(manifest, apps) {
  const map = {};
  for (const h of (manifest && manifest.file_handlers) || []) {
    for (const exts of Object.values(h.accept || {})) for (const e of exts) {
      const ext = String(e).replace(/^\./, '').toLowerCase();
      if (!map[ext]) map[ext] = h.action;
    }
  }
  for (const a of ASSOCIATIONS) for (const ext of a.ext) if (!map[ext]) map[ext] = driveRoute(ext, apps) || '/drive/';
  return map;
}

const routeFor = (name, map) => (map && map[extOf(name)]) || '/drive/';

function loadRegistry(siteDir) {
  const read = (f) => fs.readFileSync(path.join(siteDir, f), 'utf8');
  let manifest = null, apps = [];
  try { manifest = JSON.parse(read('manifest.webmanifest')); } catch (e) { manifest = null; }
  try {
    const win = {};
    vm.runInNewContext(read('shared/apps.js'), { window: win, Object, Array, JSON }, { timeout: 2000 });
    apps = JSON.parse(JSON.stringify(win.SLOP_APPS || []));
  } catch (e) { apps = []; }   // the manifest's handlers and Slop Drive still open files
  return { manifest, apps };
}

module.exports = { ASSOCIATIONS, extOf, mimeOfExt, driveRoute, openMap, routeFor, loadRegistry };
