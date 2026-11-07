// A server for the slow-first-paint tests: serves root like tools/speed/serve.mjs, but sends the homepage's HTML a line at
// a time from <body> to the end of the hero, with a pause after each line, so every half-parsed state of the hero gets
// painted; then it holds the rest back for hold ms (held resolves when it starts holding). Used by
// tests/node/cls.test.mjs, tests/node/first-paint-lang.test.mjs and tests/node/first-paint-page-lang.test.mjs. dir: another
// homepage than the root one, such as a language's copy ('sv/': served at /sv/).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { serve } from '../../tools/speed/serve.mjs';

export async function trickle(root, pause, hold = 0, dir = '') {
  const inner = await serve(root, 0);
  const html = await readFile(path.join(root, dir, 'index.html'), 'utf8');
  const a = html.indexOf('<body'), b = html.indexOf('</section>', html.indexOf('id="hero"')) + 10;
  assert.ok(a > 0 && b > a, 'the homepage has a body and a hero');
  const parts = [html.slice(0, a), ...html.slice(a, b).split(/(?<=\n)/)];
  let onHeld;
  const held = new Promise((r) => { onHeld = r; });
  const server = http.createServer(async (req, res) => {
    if (new URL(req.url, 'http://x').pathname !== '/' + dir) {
      const r = await fetch(inner.url + req.url.slice(1), { headers: { 'accept-encoding': 'identity' } });
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream' });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    for (const p of parts) { res.write(p); await new Promise((r) => setTimeout(r, pause)); }
    onHeld();
    await new Promise((r) => setTimeout(r, hold));
    res.end(html.slice(b));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/${dir}`, held, close: () => { server.closeAllConnections?.(); server.close(); return inner.close(); } };
}
