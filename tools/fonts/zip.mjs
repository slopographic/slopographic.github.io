// The members of a zip file in Node (stored or deflated), enough to check the font download (shared/fonts/brand/*.zip)
// and to let the leak scan read inside archives (tools/whitelabel/unpack.mjs).
// Node only. Tests: tests/node/brand-font.test.mjs, tests/node/whitelabel-font.test.mjs.
import { inflateRawSync } from 'node:zlib';

/** The members of a zip: [{ name, data }] (stored or deflated; anything else is skipped). */
export function zipMembers(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) return [];
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count && buf.readUInt32LE(at) === 0x02014b50; i++) {
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30), comment = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: inflateRawSync(raw) });
    at += 46 + nameLen + extra + comment;
  }
  return out;
}
