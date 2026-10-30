// What a compressed binary holds, for the leak scan: a WOFF2 font's tables (Brotli: a name table is unreadable in the
// file itself) and a zip's members (inflated, and unpacked again when a member is a font or a zip). The scan searches
// these bytes as well as the file's own.
// Node only. Tests: tests/node/whitelabel-scan.test.mjs, tests/node/whitelabel-font.test.mjs.
import { woff2Tables } from '../fonts/woff2.mjs';
import { zipMembers } from '../fonts/zip.mjs';

/** [{ label, data }]: the uncompressed contents of a binary file (empty for a file that is not compressed). */
export function unpack(file, buf, depth = 0) {
  if (depth > 2) return [];
  try {
    if (/\.woff2$/i.test(file) || buf.toString('latin1', 0, 4) === 'wOF2') {
      return Object.entries(woff2Tables(buf)).map(([tag, data]) => ({ label: `table ${tag}`, data }));
    }
    if (/\.zip$/i.test(file) || buf.readUInt32LE(0) === 0x04034b50) {
      return zipMembers(buf).flatMap((m) => [{ label: m.name, data: m.data }, ...unpack(m.name, m.data, depth + 1).map((x) => ({ label: `${m.name}: ${x.label}`, data: x.data }))]);
    }
  } catch (e) {
    return [{ label: `(could not unpack: ${e.message})`, data: Buffer.alloc(0) }];
  }
  return [];
}

