/* Slop Code, hex view: the file's bytes, read lazily. The blob is cut into aligned 64 KB chunks (a 16-byte row never
 * straddles two), each read with blob.slice().arrayBuffer() when a row needs it, and the sixteen used last are kept. A
 * chunk that is not here yet answers null and its read starts; onLoad(index) says when it has arrived. Only blob.size and
 * blob.slice are used. */
export const CHUNK = 65536;
const KEEP = 16;

export function createChunks(blob, onLoad) {
  const cache = new Map(), busy = new Set();
  let dead = false;

  function load(i) {
    busy.add(i);
    const from = i * CHUNK;
    blob.slice(from, Math.min(blob.size, from + CHUNK)).arrayBuffer().then((buf) => {
      busy.delete(i);
      if (dead) return;
      cache.set(i, new Uint8Array(buf));
      while (cache.size > KEEP) cache.delete(cache.keys().next().value);
      onLoad(i);
    }, () => { busy.delete(i); });   // a chunk that cannot be read stays blank
  }

  return {
    /** The chunk holding byte `offset` (its first byte is at offset - offset % CHUNK), or null while it is being read. */
    at(offset) {
      const i = Math.floor(offset / CHUNK), hit = cache.get(i);
      if (hit) { cache.delete(i); cache.set(i, hit); return hit; }
      if (!busy.has(i) && !dead) load(i);
      return null;
    },
    /** How many chunks are kept right now. */
    get size() { return cache.size; },
    dispose() { dead = true; cache.clear(); },
  };
}
