// A small WebSocket server (RFC 6455) on node:http, no dependencies. Only what the bridge needs: the opening handshake,
// text frames (fragmented or not), ping/pong, close; binary frames are refused (1003). Client frames must be masked
// (RFC 6455 5.1: a server closes the connection with 1002 on an unmasked frame); server frames are never masked.
//   accept(key)                        → the Sec-WebSocket-Accept value
//   encode(opcode, payload, { mask })  → one frame (FIN set); mask only for a client (the tests' fake client)
//   createParser(onFrame, { maxFrame, requireMask }) → push(buf): calls onFrame({ fin, opcode, payload }) per frame
//   upgrade(req, socket, { check(req) → true | 'reason', maxMessage }) → Conn | null (a refusal answers 403 and closes)
//   Conn: send(text), ping(), close(code, reason), on('message' | 'close', fn), closed, origin
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';

export const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const OP = { cont: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 };
export const accept = (key) => createHash('sha1').update(String(key) + GUID).digest('base64');

export function encode(opcode, payload = Buffer.alloc(0), { mask = false, fin = true } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const n = data.length;
  const head = n < 126 ? 2 : n < 65536 ? 4 : 10;
  const out = Buffer.alloc(head + (mask ? 4 : 0) + n);
  out[0] = (fin ? 0x80 : 0) | opcode;
  if (n < 126) out[1] = n;
  else if (n < 65536) { out[1] = 126; out.writeUInt16BE(n, 2); }
  else { out[1] = 127; out.writeBigUInt64BE(BigInt(n), 2); }
  if (mask) {
    out[1] |= 0x80;
    const key = randomBytes(4);
    key.copy(out, head);
    for (let i = 0; i < n; i++) out[head + 4 + i] = data[i] ^ key[i & 3];
  } else data.copy(out, head);
  return out;
}

export class ProtocolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Parses frames from a byte stream. Throws ProtocolError for a frame the server must refuse. */
export function createParser(onFrame, { maxFrame = 16 * 1024 * 1024, requireMask = true } = {}) {
  let buf = Buffer.alloc(0);
  return function push(chunk) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 2) return;
      const fin = !!(buf[0] & 0x80), rsv = buf[0] & 0x70, opcode = buf[0] & 0x0f, masked = !!(buf[1] & 0x80);
      let len = buf[1] & 0x7f, at = 2;
      if (rsv) throw new ProtocolError(1002, 'reserved bits set (no extension was agreed)');
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(maxFrame)) throw new ProtocolError(1009, 'frame too large');
        len = Number(big); at = 10;
      }
      if (len > maxFrame) throw new ProtocolError(1009, 'frame too large');
      if (requireMask && !masked) throw new ProtocolError(1002, 'client frames must be masked');
      if (opcode >= 8 && (!fin || len > 125)) throw new ProtocolError(1002, 'bad control frame');
      const keyAt = at; if (masked) at += 4;
      if (buf.length < at + len) return;
      let payload = buf.subarray(at, at + len);
      if (masked) {
        const key = buf.subarray(keyAt, keyAt + 4), p = Buffer.alloc(len);
        for (let i = 0; i < len; i++) p[i] = payload[i] ^ key[i & 3];
        payload = p;
      } else payload = Buffer.from(payload);
      buf = buf.subarray(at + len);
      onFrame({ fin, opcode, payload });
    }
  };
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

export class Conn extends EventEmitter {
  constructor(socket, { maxMessage = 64 * 1024 * 1024, maxFrame, origin = '' } = {}) {
    super();
    this.socket = socket; this.closed = false; this.origin = origin;
    let parts = [], size = 0, kind = 0;
    const push = createParser((f) => this.#frame(f), { maxFrame: maxFrame || maxMessage });
    this.#onData = (chunk) => {
      try { push(chunk); } catch (e) { this.close(e.code || 1002, e.message); }
    };
    this.#message = (f) => {
      if (f.opcode === OP.binary) { this.close(1003, 'text frames only'); return; }
      if (f.opcode === OP.text) { if (kind) { this.close(1002, 'a new message inside a fragmented one'); return; } kind = 1; parts = []; size = 0; }
      else if (!kind) { this.close(1002, 'continuation without a start'); return; }
      size += f.payload.length;
      if (size > maxMessage) { this.close(1009, 'message too large'); return; }
      parts.push(f.payload);
      if (!f.fin) return;
      kind = 0;
      let text;
      try { text = utf8.decode(Buffer.concat(parts)); } catch (e) { this.close(1007, 'not UTF-8'); return; }
      parts = []; size = 0;
      this.emit('message', text);
    };
    socket.on('data', this.#onData);
    socket.on('end', () => { socket.end(); this.#gone(1006, ''); });   // the peer went away without a close frame
    socket.on('close', () => this.#gone(1006, ''));
    socket.on('error', () => this.#gone(1006, ''));
  }
  #onData; #message; #sentClose = false;
  #frame(f) {
    if (this.closed) return;
    if (f.opcode === OP.ping) { this.#write(encode(OP.pong, f.payload)); return; }
    if (f.opcode === OP.pong) { this.emit('pong'); return; }
    if (f.opcode === OP.close) {
      const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005;
      if (!this.#sentClose) { this.#sentClose = true; this.#write(encode(OP.close, f.payload.subarray(0, 2))); }
      this.socket.end();
      this.#gone(code, f.payload.subarray(2).toString());
      return;
    }
    if (f.opcode === OP.text || f.opcode === OP.cont || f.opcode === OP.binary) { this.#message(f); return; }
    this.close(1002, 'unknown opcode');
  }
  #write(b) { if (!this.socket.destroyed) this.socket.write(b); }
  #gone(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', code, reason);
  }
  send(text) { if (!this.closed) this.#write(encode(OP.text, Buffer.from(String(text), 'utf8'))); }
  ping(data = '') { if (!this.closed) this.#write(encode(OP.ping, data)); }
  close(code = 1000, reason = '') {
    if (this.closed) return;
    if (!this.#sentClose) {
      this.#sentClose = true;
      const r = Buffer.from(String(reason).slice(0, 120), 'utf8'), p = Buffer.alloc(2 + r.length);
      p.writeUInt16BE(code, 0); r.copy(p, 2);
      this.#write(encode(OP.close, p));
    }
    setTimeout(() => this.socket.destroy(), 200).unref();
    this.#gone(code, reason);
  }
}

function refuse(socket, status, reason) {
  socket.end(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Bad Request'}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(reason)}\r\n\r\n${reason}`);
  return null;
}

/** The opening handshake (RFC 6455 4.2). check(req) decides on the Origin and Host before anything is accepted. */
export function upgrade(req, socket, { check = () => true, maxMessage, maxFrame } = {}) {
  const h = req.headers, key = h['sec-websocket-key'];
  if (req.method !== 'GET' || !/\bwebsocket\b/i.test(h.upgrade || '') || !/\bupgrade\b/i.test(h.connection || '')) return refuse(socket, 400, 'not a WebSocket request');
  if (!key || Buffer.from(key, 'base64').length !== 16) return refuse(socket, 400, 'bad Sec-WebSocket-Key');
  if (h['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\nConnection: close\r\n\r\n');
    return null;
  }
  const ok = check(req);
  if (ok !== true) return refuse(socket, 403, typeof ok === 'string' ? ok : 'refused');
  socket.setNoDelay(true);
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept(key)}`, '', ''].join('\r\n'));
  return new Conn(socket, { maxMessage, maxFrame, origin: h.origin || '' });
}
