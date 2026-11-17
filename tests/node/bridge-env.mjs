// Helpers for the Slopographic MCP bridge tests (tools/claude-plugin/server/): a raw WebSocket client that masks its
// frames as a browser does, and an MCP client over a pair of streams or a child process's stdio.
//   wsConnect(port, { origin, host, path }) → { status, headers, socket, send(text), frames(), next(pred, ms), raw(buf), close() }
//   mcpClient(input, output) → { request(method, params, ms), notify(method, params), notes, next(pred, ms) }
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { encode, createParser, OP } from '../../tools/claude-plugin/server/ws.mjs';

function waiter(list) {
  const subs = new Set();
  return {
    push(x) { list.push(x); for (const s of subs) s(); },
    next(pred, ms = 5000) {
      return new Promise((resolve, reject) => {
        const look = () => { const i = list.findIndex(pred); if (i >= 0) { subs.delete(look); clearTimeout(t); resolve(list.splice(i, 1)[0]); return true; } return false; };
        const t = setTimeout(() => { subs.delete(look); reject(new Error('timed out waiting; have ' + JSON.stringify(list).slice(0, 400))); }, ms);
        if (!look()) subs.add(look);
      });
    },
  };
}

export function wsConnect(port, { origin = 'https://slopographic.com', host = `127.0.0.1:${port}`, key = randomBytes(16).toString('base64') } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let head = Buffer.alloc(0), done = false;
    const got = [], w = waiter(got);
    const parse = createParser((f) => w.push(f.opcode === OP.text ? { type: 'text', text: f.payload.toString('utf8'), data: (() => { try { return JSON.parse(f.payload.toString('utf8')); } catch (e) { return null; } })() } : { type: f.opcode, payload: f.payload }), { requireMask: false, maxFrame: 64 * 1024 * 1024 });
    socket.on('error', reject);
    socket.on('close', () => w.push({ type: 'eof' }));
    socket.on('connect', () => socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${origin ? `Origin: ${origin}\r\n` : ''}\r\n`));
    socket.on('data', (chunk) => {
      if (done) { parse(chunk); return; }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      done = true;
      const lines = head.subarray(0, end).toString().split('\r\n'), status = Number(lines[0].split(' ')[1]);
      const headers = Object.fromEntries(lines.slice(1).map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
      const rest = head.subarray(end + 4);
      if (rest.length && status === 101) parse(rest);
      resolve({
        status, headers, socket, key, body: status === 101 ? '' : rest.toString(),
        send: (text) => socket.write(encode(OP.text, Buffer.from(typeof text === 'string' ? text : JSON.stringify(text)), { mask: true })),
        raw: (buf) => socket.write(buf),
        next: (pred, ms) => w.next(typeof pred === 'string' ? (m) => m.data && m.data.t === pred : pred, ms),
        close: () => socket.destroy(),
      });
    });
  });
}

export function mcpClient(toServer, fromServer) {
  let id = 0, buf = '';
  const msgs = [], w = waiter(msgs);
  fromServer.on('data', (c) => {
    buf += c.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) w.push(JSON.parse(line)); }
  });
  return {
    async request(method, params, ms = 10000) {
      const my = ++id;
      toServer.write(JSON.stringify({ jsonrpc: '2.0', id: my, method, ...(params !== undefined ? { params } : {}) }) + '\n');
      const r = await w.next((m) => m.id === my, ms);
      return r;
    },
    notify(method, params) { toServer.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n'); },
    send(obj) { toServer.write((typeof obj === 'string' ? obj : JSON.stringify(obj)) + '\n'); },
    next: (pred, ms) => w.next(pred, ms),
    raw: msgs,
  };
}
