// The git side of the content check: every object of a repository with its contents (git cat-file --batch-all-objects,
// read as a stream, reachable or not), the paths of the reachable ones, every ref name, the entry names of a tree and the
// text of a commit or tag that a person wrote (ids and signatures left out).
// Node only. Tests: tests/node/content-check.test.mjs.
import { spawn, execFileSync } from 'node:child_process';

const run = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });

/** Every ref name: branches, tags, remote-tracking branches, notes, stash. */
export const refNames = (repo) => run(repo, ['for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean);

/** Map object id -> path for every tree and blob a ref reaches (the root tree's path is ''). */
export function objectPaths(repo) {
  const out = new Map();
  for (const line of run(repo, ['rev-list', '--objects', '--all']).split('\n')) {
    const at = line.indexOf(' ');
    if (at > 0 && !out.has(line.slice(0, at))) out.set(line.slice(0, at), line.slice(at + 1));
  }
  return out;
}

/** The entry names of a tree object (idLen: the bytes of an object id, 20 for SHA-1 and 32 for SHA-256). */
export function treeNames(data, idLen) {
  const out = [];
  for (let at = 0; at < data.length;) {
    const sp = data.indexOf(0x20, at), nul = sp < 0 ? -1 : data.indexOf(0, sp);
    if (nul < 0) break;
    out.push(data.toString('utf8', sp + 1, nul));
    at = nul + 1 + idLen;
  }
  return out;
}

/** An armoured signature (a commit's gpgsig header, a tag's signature, a merged tag's), its lines indented or not. */
const SIGNATURE = /-----BEGIN (PGP SIGNATURE|SSH SIGNATURE|SIGNED MESSAGE)-----(?:\n ?(?:[A-Za-z0-9+/=]*|[\w-]+: [^\n]*))*\n ?-----END \1-----/g;
/** The text of a commit or tag object without its object ids and signatures: author, committer, tagger, the tag name,
 * any other header, and the message. As UTF-8, and also as Latin-1 when the bytes are not UTF-8. */
export function objectTexts(data) {
  const read = (enc) => data.toString(enc).replace(SIGNATURE, '').replace(/^(tree|parent|object) [0-9a-f]{40,64}$/gm, '');
  const utf8 = read('utf8');
  return utf8.includes('�') ? [utf8, read('latin1')] : [utf8];
}

/** Calls fn({ id, type, data }) for every object of the repository (in pack order) and returns how many there were. */
export async function eachObject(repo, fn) {
  const git = spawn('git', ['-C', repo, 'cat-file', '--batch-all-objects', '--batch', '--unordered'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  git.stderr.on('data', (d) => { err += d; });
  const done = new Promise((resolve) => { git.on('error', (e) => { err += e.message; resolve(-1); }); git.on('close', resolve); });
  let parts = [], size = 0, head = null, count = 0;
  const join = () => { if (parts.length > 1) parts = [Buffer.concat(parts, size)]; return parts[0]; };
  const take = (n) => { const b = join(); parts = n < b.length ? [b.subarray(n)] : []; size -= n; return b.subarray(0, n); };
  for await (const chunk of git.stdout) {
    parts.push(chunk); size += chunk.length;
    for (;;) {
      if (!head) {                      // "<id> <type> <size>\n", then the contents and a newline
        const nl = size ? join().indexOf(10) : -1;
        if (nl < 0) break;
        const [id, type, len] = take(nl + 1).toString('latin1').trim().split(' ');
        head = { id, type, len: Number(len) };
      }
      if (size < head.len + 1) break;
      fn({ id: head.id, type: head.type, data: take(head.len + 1).subarray(0, head.len) });
      count++; head = null;
    }
  }
  const code = await done;
  if (code !== 0 || head) throw new Error(`git cat-file stopped (${code}): ${err.trim()}`);
  return count;
}
