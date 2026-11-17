/* Slop Code, hex view: finding bytes in a blob without reading it all at once. The blob is read a megabyte at a time
 * (each window overlaps the next by the needle's length minus one, so a match across the join is found), with an await
 * between windows so the page keeps drawing, and a cancelled() check after each so a newer search can take over. */
const STEP = 1 << 20;

/** The first (or, going back, last) index in buf, from `from`, where the needle starts; -1 if none. */
function indexOfSeq(buf, nd, from, back) {
  let i = back ? buf.lastIndexOf(nd[0], from) : buf.indexOf(nd[0], from);
  while (i !== -1) {
    let k = 1;
    while (k < nd.length && buf[i + k] === nd[k]) k++;
    if (k === nd.length && i + k <= buf.length) return i;
    i = back ? (i > 0 ? buf.lastIndexOf(nd[0], i - 1) : -1) : buf.indexOf(nd[0], i + 1);
  }
  return -1;
}

const read = async (blob, from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer());

/** A match starting between lo and hi (inclusive): the first one, or the last going back. -1 none, -2 cancelled. */
async function scan(blob, nd, lo, hi, back, cancelled, progress) {
  const L = nd.length, last = Math.min(hi, blob.size - L);
  lo = Math.max(0, lo);
  if (lo > last) return -1;
  const total = last - lo + 1;
  for (let step = 0; step * STEP < total; step++) {
    const a = back ? Math.max(lo, last - (step + 1) * STEP + 1) : lo + step * STEP;
    const z = back ? last - step * STEP : Math.min(last, a + STEP - 1);   // the starts this window can hold: a to z
    const buf = await read(blob, a, z + L);
    if (cancelled()) return -2;
    const i = indexOfSeq(buf, nd, back ? buf.length - L : 0, back);
    if (i >= 0) return a + i;
    progress(Math.min(1, (step + 1) * STEP / total));
  }
  return -1;
}

/** Look for needle (a Uint8Array) in blob, starting just after `from` (just before it, if back) and wrapping round at the
 *  end of the file. Resolves with the offset of the match, or -1 for none (also when cancelled() turns true). */
export async function search(blob, nd, from, back, cancelled, progress = () => {}) {
  const size = blob.size;
  if (!nd.length || nd.length > size) return -1;
  const parts = back ? [[0, from - 1], [from, size]] : [[from + 1, size], [0, from]];
  for (const [lo, hi] of parts) {
    const at = await scan(blob, nd, lo, hi, back, cancelled, progress);
    if (at >= 0) return at;
    if (at === -2) return -1;
  }
  return -1;
}
