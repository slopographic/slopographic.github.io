// Shared helpers for the capture tools: a tiny static server, Playwright loader,
// the app registry (shared/apps.js evaluated in Node) and ffmpeg wrappers.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

/** Serve the repo root on a random local port. Resolves with { server, base }. */
export function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if ((await stat(f).catch(() => null))?.isDirectory()) f = path.join(f, 'index.html');
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, base: `http://127.0.0.1:${server.address().port}/` })));
}

export async function loadPlaywright() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
  try { return await import('playwright'); } catch { /* fall through */ }
  for (const p of ['/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
    try { return createRequire(import.meta.url)(p); } catch { /* next */ }
  }
  throw new Error('Playwright not found (npm i -D playwright).');
}

export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'];

/** window.SLOP_APPS, read from shared/apps.js without a browser. */
export async function loadApps() {
  const src = await readFile(path.join(ROOT, 'shared/apps.js'), 'utf8');
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx);
  return ctx.window.SLOP_APPS;
}

/** Parse --only a,b and --skip-clips style flags. */
export function args(argv = process.argv.slice(2)) {
  const o = { only: null, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') o.only = new Set(argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (argv[i].startsWith('--only=')) o.only = new Set(argv[i].slice(7).split(','));
    else if (argv[i].startsWith('--')) o.flags.add(argv[i].slice(2));
  }
  return o;
}

export const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
export function ffmpeg(list) {
  const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...list], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + list.join(' '));
}
