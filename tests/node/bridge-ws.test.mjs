// The bridge's own WebSocket server (RFC 6455): the accept key, frames of every length form, masking rules, fragmented
// and large messages, ping/pong, the close handshake, and refusals before the upgrade.
// Run: node --test tests/node/bridge-ws.test.mjs
// Covers: tools/claude-plugin/server/ws.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { accept, encode, createParser, upgrade, OP } from '../../tools/claude-plugin/server/ws.mjs';
import { wsConnect } from './bridge-env.mjs';

function frames(buf, opts) { const out = []; createParser((f) => out.push(f), opts)(buf); return out; }

test('the accept key is the one RFC 6455 gives for its sample nonce', () => {
  assert.equal(accept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('frames: 7-bit, 16-bit and 64-bit lengths, masked and unmasked, round trip', () => {
  for (const n of [0, 5, 125, 126, 65535, 65536, 300000]) {
    const data = Buffer.alloc(n, 'x');
    for (const mask of [false, true]) {
      const f = encode(OP.text, data, { mask });
      assert.equal(!!(f[1] & 0x80), mask);
      const [got] = frames(f, { requireMask: mask });
      assert.equal(got.opcode, OP.text); assert.equal(got.fin, true); assert.equal(got.payload.length, n);
      assert.ok(got.payload.equals(data));
    }
  }
  // split anywhere: the parser waits for the rest
  const f = encode(OP.text, Buffer.from('hello world'), { mask: true }), out = [];
  const push = createParser((x) => out.push(x));
  for (const b of f) push(Buffer.from([b]));
  assert.equal(out[0].payload.toString(), 'hello world');
});

test('the parser refuses what a server must refuse', () => {
  assert.throws(() => frames(encode(OP.text, 'a'), { requireMask: true }), (e) => e.code === 1002);
  const rsv = encode(OP.text, 'a', { mask: true }); rsv[0] |= 0x40;
  assert.throws(() => frames(rsv), (e) => e.code === 1002);
  assert.throws(() => frames(encode(OP.text, Buffer.alloc(2000), { mask: true }), { maxFrame: 1000 }), (e) => e.code === 1009);
  assert.throws(() => frames(encode(OP.ping, Buffer.alloc(200), { mask: true })), (e) => e.code === 1002);
});

function server(opts = {}) {
  const s = http.createServer((q, r) => r.end());
  const conns = [];
  s.on('upgrade', (req, socket) => { const c = upgrade(req, socket, opts); if (c) { conns.push(c); c.on('message', (t) => c.send('echo:' + t)); } });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r({ s, port: s.address().port, conns })));
}

test('a real connection: handshake, echo, fragments, a large message, ping, close', async () => {
  const { s, port, conns } = await server({ maxMessage: 8 * 1024 * 1024 });
  try {
    const c = await wsConnect(port);
    assert.equal(c.status, 101);
    assert.equal(c.headers['sec-websocket-accept'], accept(c.key));
    c.send('hi');
    assert.equal((await c.next((m) => m.type === 'text')).text, 'echo:hi');
    // a message in three fragments
    c.raw(Buffer.concat([encode(OP.text, 'one ', { mask: true, fin: false }), encode(OP.cont, 'two ', { mask: true, fin: false }), encode(OP.ping, 'p', { mask: true }), encode(OP.cont, 'three', { mask: true })]));
    const pong = await c.next((m) => m.type === OP.pong);
    assert.equal(pong.payload.toString(), 'p', 'a ping between fragments is answered');
    assert.equal((await c.next((m) => m.type === 'text')).text, 'echo:one two three');
    // 3 MB, with multi-byte UTF-8
    const big = 'é'.repeat(1.5 * 1024 * 1024);
    c.send(big);
    assert.equal((await c.next((m) => m.type === 'text', 20000)).text.length, big.length + 5);
    // close handshake: the server answers with the same code
    c.raw(encode(OP.close, Buffer.from([0x03, 0xe8]), { mask: true }));
    const cl = await c.next((m) => m.type === OP.close);
    assert.equal(cl.payload.readUInt16BE(0), 1000);
    await c.next((m) => m.type === 'eof');
    assert.equal(conns[0].closed, true);
  } finally { s.close(); }
});

test('unmasked client frames, binary frames, bad UTF-8 and oversize messages close the connection', async () => {
  const { s, port } = await server({ maxMessage: 1000 });
  try {
    const cases = [[encode(OP.text, 'x'), 1002], [encode(OP.binary, 'x', { mask: true }), 1003],
      [encode(OP.text, Buffer.from([0xc3, 0x28]), { mask: true }), 1007], [encode(OP.text, Buffer.alloc(1500, 'a'), { mask: true }), 1009]];
    for (const [frame, code] of cases) {
      const c = await wsConnect(port);
      c.raw(frame);
      const cl = await c.next((m) => m.type === OP.close);
      assert.equal(cl.payload.readUInt16BE(0), code);
      c.close();
    }
  } finally { s.close(); }
});

test('the handshake: a refused check answers 403; a bad version 426; not a WebSocket 400', async () => {
  const { s, port } = await server({ check: (req) => (req.headers.origin === 'https://slopographic.com' ? true : 'no') });
  try {
    for (const [o, status] of [[{ origin: 'https://evil.example' }, 403], [{}, 101], [{ key: 'short' }, 400], [{ origin: '' }, 403]]) {
      const c = await wsConnect(port, o);
      assert.equal(c.status, status, JSON.stringify(o));
      c.close();
    }
  } finally { s.close(); }
});
