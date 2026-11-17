// The bridge to the Slopographic tabs: a WebSocket server on 127.0.0.1 only, the Origin and Host checks, pairing with a
// short code, a token per tab after pairing, the tabs and their tools, calls into a tab and files both ways in chunks.
//   createBridge({ ports, origins, log }) → bridge
//   bridge.listen() → port (the first free one of ports)          bridge.close()
//   bridge.newCode() → 'K7Q-4MZ' (single use, 10 minutes; a new code replaces the old one)
//   bridge.tabs() → [{ id, app, appName, title, url, tools: n, active }]    bridge.active() → tab | null    bridge.use(id)
//   bridge.call(tab, name, args, { signal, timeout }) → the page's result     bridge.sendFile(tab, file, opts) / getFile(tab, ref)
//   bridge.on('change', fn): a tab paired, left, or sent new tools
// Wire format (JSON text frames). Page → bridge: hello { token?, app, appName, title, url }, pair { code }, tools { tools },
// result { id, result }, chunk { id, i, data } (base64), bye. Bridge → page: need-pair { client }, paired { token, tab, client },
// pair-wrong { left }, refused { reason }, call { id, name, args }, chunk { id, i, data }, client { name }.
import http from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { upgrade } from './ws.mjs';

export const DEFAULT_PORT = 47821;
export const PORTS = Array.from({ length: 10 }, (_, i) => DEFAULT_PORT + i);
export const ORIGINS = ['https://slopographic.com', 'https://www.slopographic.com', 'https://slopographic.github.io'];
export const CHUNK = 256 * 1024;                  // raw bytes per chunk (≈350 KB of base64 per frame)
export const MAX_FILE = 512 * 1024 * 1024;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I
const CODE_TTL = 10 * 60 * 1000, MAX_TRIES = 5;

/** origins: exact origins; 'http://localhost' (no port) admits http://localhost:* and http://127.0.0.1:* (tests). */
export function originAllowed(origin, origins = ORIGINS) {
  if (!origin || origin === 'null') return false;
  let u;
  try { u = new URL(origin); } catch (e) { return false; }
  if (u.origin !== origin) return false;
  if (origins.includes(origin)) return true;
  return origins.includes('http://localhost') && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}
/** Host must name this machine (a DNS-rebinding page sends its own host name). */
export const hostAllowed = (host, port) => [`127.0.0.1:${port}`, `localhost:${port}`].includes(String(host || '').toLowerCase());
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function createBridge({ ports = PORTS, origins = ORIGINS, log = () => {}, clientName = () => 'your AI app' } = {}) {
  const ev = new EventEmitter();
  const tabs = new Map();        // id → { id, conn, token, app, appName, title, url, tools, at }
  const pending = new Map();     // call id → { resolve, reject, tab, chunks }
  let code = null, server = null, port = 0, activeId = null, seq = 0;

  function newCode() {
    let s = '';
    for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    code = { value: s, expires: Date.now() + CODE_TTL, tries: 0 };
    return s.slice(0, 3) + '-' + s.slice(3);
  }
  const changed = () => ev.emit('change');
  const info = (t) => ({ id: t.id, app: t.app, appName: t.appName, title: t.title, url: t.url, tools: t.tools.length, active: t.id === activeId });
  const active = () => tabs.get(activeId) || null;
  function pickActive() {
    if (tabs.has(activeId)) return;
    const last = [...tabs.values()].sort((a, b) => b.at - a.at)[0];
    activeId = last ? last.id : null;
  }

  const conns = new Set();
  function attach(conn) {
    let tab = null;
    conns.add(conn);
    conn.on('close', () => conns.delete(conn));
    setTimeout(() => { if (!tab && !conn.closed) conn.close(4008, 'pairing timed out'); }, CODE_TTL).unref();   // an unpaired page does not stay
    const send = (m) => conn.send(JSON.stringify(m));
    const refuse = (reason) => { send({ t: 'refused', reason }); conn.close(4003, reason.slice(0, 100)); };
    function admit(token, hello) {
      const old = [...tabs.values()].find((x) => x.token === token);
      if (old) { tabs.delete(old.id); if (old.conn !== conn) old.conn.close(4000, 'replaced'); }
      const mem = remembered.find((x) => x.token === token);
      tab = { id: old ? old.id : mem ? mem.id : 't' + (++seq), conn, token, tools: [], at: Date.now(),
        app: String(hello.app || '').slice(0, 40), appName: String(hello.appName || hello.app || 'Slopographic').slice(0, 80),
        title: String(hello.title || '').slice(0, 160), url: String(hello.url || '').slice(0, 400) };
      tabs.set(tab.id, tab);
      activeId = tab.id;
      send({ t: 'paired', token, tab: tab.id, client: clientName() });
      log(`tab ${tab.id} paired: ${tab.appName}`);
      changed();
    }
    let hello = null;
    conn.on('message', (text) => {
      let m;
      try { m = JSON.parse(text); } catch (e) { refuse('not JSON'); return; }
      if (!m || typeof m.t !== 'string') { refuse('no message type'); return; }
      if (!tab) {
        // before pairing only hello and pair are understood: no tools, no calls, no files
        if (m.t === 'hello') {
          hello = m;
          const known = typeof m.token === 'string' && [...tabs.values(), ...remembered].some((x) => same(x.token, m.token));
          if (known) admit(m.token, m); else send({ t: 'need-pair', client: clientName() });
          return;
        }
        if (m.t === 'pair' && hello) {
          if (!code || Date.now() > code.expires) { refuse(`No pairing code is waiting. Ask ${clientName()} to connect to Slopographic first; it shows a new code.`); code = null; return; }
          if (!same(normCode(m.code), code.value)) {
            code.tries++;
            const left = MAX_TRIES - code.tries;
            if (left <= 0) { code = null; refuse(`Too many wrong codes. Ask ${clientName()} for a new one.`); return; }
            send({ t: 'pair-wrong', left });
            return;
          }
          code = null;   // single use
          admit(randomBytes(32).toString('hex'), hello);
          return;
        }
        refuse('Pair first.');
        return;
      }
      tab.at = Date.now();
      if (m.t === 'tools' && Array.isArray(m.tools)) { tab.tools = m.tools.filter((x) => x && typeof x.name === 'string').slice(0, 300); changed(); return; }
      if (m.t === 'hello') { Object.assign(tab, { app: String(m.app || tab.app), appName: String(m.appName || tab.appName), title: String(m.title || ''), url: String(m.url || '') }); changed(); return; }
      if (m.t === 'chunk') { const p = pending.get(m.id); if (p && p.tab === tab && typeof m.data === 'string') { p.size += m.data.length * 0.75; if (p.size > MAX_FILE * 1.01) { p.reject(new Error('The file is too large.')); pending.delete(m.id); } else p.chunks[m.i] = m.data; } return; }
      if (m.t === 'result') { const p = pending.get(m.id); if (p && p.tab === tab) { pending.delete(m.id); p.resolve({ result: m.result, chunks: p.chunks }); } return; }
      if (m.t === 'bye') { tab.bye = true; conn.close(1000, 'bye'); }
    });
    conn.on('close', () => {
      if (!tab || tabs.get(tab.id) !== tab) return;
      tabs.delete(tab.id);
      if (!tab.bye) remember(tab.token, tab.id);   // a reload or the next app page in this tab comes back with the same token
      for (const [id, p] of pending) if (p.tab === tab) { pending.delete(id); p.reject(new Error(`The ${tab.appName} tab closed or left the page.`)); }
      log(`tab ${tab.id} left`);
      pickActive();
      changed();
    });
    const beat = setInterval(() => { if (conn.closed) clearInterval(beat); else conn.ping(); }, 20000);
    beat.unref();
  }
  // tokens of tabs that left recently: a page navigation reconnects within seconds; kept for 10 minutes
  const remembered = [];
  function remember(token, id) {
    remembered.push({ token, id, until: Date.now() + CODE_TTL });
    while (remembered.length && (remembered[0].until < Date.now() || remembered.length > 50)) remembered.shift();
  }

  function call(tab, name, args, { signal, timeout = 15 * 60 * 1000, before } = {}) {
    if (!tab || !tabs.has(tab.id)) return Promise.reject(new Error('No Slopographic tab is connected.'));
    const id = 'c' + (++seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${tab.appName} did not answer in time.`)); }, timeout);
      timer.unref();
      const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
      pending.set(id, { tab, chunks: [], size: 0, resolve: done(resolve), reject: done(reject) });
      if (signal) signal.addEventListener('abort', () => { if (pending.delete(id)) { clearTimeout(timer); reject(new Error('Cancelled.')); } }, { once: true });
      if (before) before(id);
      tab.conn.send(JSON.stringify({ t: 'call', id, name, args: args || {} }));
    });
  }
  /** Bytes into the tab: chunks first, then the call '@receive' that names them (one socket keeps the order). */
  function sendFile(tab, { name, type, bytes }, opts = {}) {
    if (bytes.length > MAX_FILE) return Promise.reject(new Error(`The file is larger than ${MAX_FILE / 1048576} MB.`));
    const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
    return call(tab, '@receive', { name, type, size: bytes.length, chunks, into: opts.into || 'app', mode: opts.mode || null }, {
      signal: opts.signal,
      before: (id) => { for (let i = 0; i < chunks; i++) tab.conn.send(JSON.stringify({ t: 'chunk', id, i, data: bytes.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64') })); },
    }).then((r) => r.result);
  }
  /** A file out of the tab: the page sends chunks, then a result { name, type, size, chunks }. */
  async function getFile(tab, ref, opts = {}) {
    const { result, chunks } = await call(tab, '@export', { file: ref }, opts);
    if (!result || result.isError) throw new Error((result && result.content && result.content[0] && result.content[0].text) || 'The page sent no file.');
    const parts = [];
    for (let i = 0; i < result.chunks; i++) { if (typeof chunks[i] !== 'string') throw new Error('A part of the file was lost on the way.'); parts.push(Buffer.from(chunks[i], 'base64')); }
    const bytes = Buffer.concat(parts);
    if (bytes.length !== result.size) throw new Error(`The file arrived with ${bytes.length} of ${result.size} bytes.`);
    return { name: result.name, type: result.type, bytes };
  }

  function listen() {
    return new Promise((resolve, reject) => {
      const list = ports.slice();
      const next = () => {
        const p = list.shift();
        if (p === undefined) { reject(new Error(`No free port in ${ports[0]}–${ports[ports.length - 1]}.`)); return; }
        const s = http.createServer((req, res) => { res.writeHead(426, { 'content-type': 'text/plain' }).end('Slopographic MCP bridge: WebSocket only.'); });
        s.on('upgrade', (req, socket) => {
          const conn = upgrade(req, socket, { maxMessage: 4 * 1024 * 1024, check: (r) => {
            if (!hostAllowed(r.headers.host, port)) return 'This bridge answers only on 127.0.0.1.';
            if (!originAllowed(r.headers.origin, origins)) { log(`refused origin ${r.headers.origin || '(none)'}`); return 'This page may not use the bridge.'; }
            return true;
          } });
          if (conn) attach(conn);
        });
        s.once('error', (e) => { if (e.code === 'EADDRINUSE' || e.code === 'EACCES') next(); else reject(e); });
        s.listen(p, '127.0.0.1', () => { server = s; port = s.address().port; resolve(port); });
      };
      next();
    });
  }

  return Object.assign(ev, {
    listen, newCode, call, sendFile, getFile, active,
    port: () => port,
    tabs: () => [...tabs.values()].map(info),
    tab: (id) => tabs.get(id) || null,
    use(id) { if (!tabs.has(id)) throw new Error(`No tab "${id}". Use status to see the tabs.`); activeId = id; changed(); return info(tabs.get(id)); },
    codeWaiting: () => !!(code && Date.now() < code.expires),
    notifyClient(name) { for (const t of tabs.values()) t.conn.send(JSON.stringify({ t: 'client', name })); },
    disconnect(id) { const t = id ? tabs.get(id) : null; for (const x of t ? [t] : [...tabs.values()]) x.conn.close(1000, 'disconnected'); remembered.length = 0; },
    close() { for (const c of [...conns]) c.close(1001, 'the bridge stopped'); if (server) server.close(); },
  });
}
