// A static server for the speed check: the checkout over http the way GitHub Pages serves it, text compressed with gzip,
// cache-control max-age=600, dir/ served as dir/index.html, dir without a slash redirected to dir/, 404.html for a missing
// file. Used by tools/speed/run.mjs; tests/node/speed-serve.test.mjs checks it.
//   const { url, close } = await serve(root, port)   port 0 picks a free one
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.pdf': 'application/pdf', '.onnx': 'application/octet-stream',
};
/** Whether Pages compresses a content type (text, scripts, JSON, SVG, manifests, wasm). */
export const compressible = (type) => /^text\/|javascript|json|xml|svg|manifest|wasm/.test(type);

const gzipCache = new Map();
async function send(req, res, file, status = 200) {
  const body = await readFile(file);
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.setHeader('content-type', type);
  res.setHeader('cache-control', 'max-age=600');
  res.setHeader('vary', 'Accept-Encoding');
  if (compressible(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    let gz = gzipCache.get(file);
    if (!gz) gzipCache.set(file, (gz = zlib.gzipSync(body, { level: 6 })));
    res.setHeader('content-encoding', 'gzip');
    res.writeHead(status).end(req.method === 'HEAD' ? undefined : gz);
  } else res.writeHead(status).end(req.method === 'HEAD' ? undefined : body);
}

async function handle(root, req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return res.writeHead(400).end(); }
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  const st = await stat(file).catch(() => null);
  if (st && st.isDirectory()) {
    if (!rel.endsWith('/')) return res.writeHead(301, { location: rel + '/' }).end();
    const index = path.join(file, 'index.html');
    if (await stat(index).catch(() => null)) return send(req, res, index);
  } else if (st) return send(req, res, file);
  const notFound = path.join(root, '404.html');
  if (await stat(notFound).catch(() => null)) return send(req, res, notFound, 404);
  res.writeHead(404).end();
}

/** Serves root on port (0: a free one). Resolves { url, port, close() }. */
export function serve(root, port = 0) {
  const abs = path.resolve(root);
  const server = http.createServer((req, res) => handle(abs, req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }));
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({ url: `http://127.0.0.1:${p}/`, port: p, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) });
    });
  });
}
