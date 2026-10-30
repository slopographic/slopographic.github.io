// Git plumbing for the history builder (history.mjs): the chain of source commits to map, the paths a commit changed, blob
// reads in one batch, git's blob hash, and a fast-import writer that adds commits to the output repository without a
// working tree. Node only. Tests: tests/node/whitelabel-history.test.mjs.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
// git hooks export GIT_DIR and friends, which would point -C at the hook's repository instead of `repo`.
export const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|COMMON_DIR)$/.test(k)));
const BIG = { maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'inherit'], env: ENV };
/** git in repo, output as a string (or a Buffer with raw). */
export function git(repo, args, input, raw = false) {
  const out = execFileSync('git', ['-C', repo, ...args], Object.assign({ input }, BIG));
  return raw ? out : out.toString('utf8');
}

/** The commits to map, oldest first: the first-parent chain of ref, except that at a merge whose tree is the tree of
 * another parent (a milestone merge that takes a branch as it is) the walk follows that parent, so the branch's own
 * commits are kept one by one instead of arriving as one merge. The walk stops before a commit in `stop` (the ones a
 * previous run mapped) and throws when it reaches the root without meeting one (the history was rewritten). */
export function chain(repo, ref, stop = new Set()) {
  const info = new Map();
  for (const line of git(repo, ['log', '--format=%H %T %P', ref]).split('\n')) {
    if (!line) continue;
    const [sha, tree, ...parents] = line.split(' ');
    info.set(sha, { tree, parents });
  }
  const out = [];
  let c = git(repo, ['rev-parse', `${ref}^{commit}`]).trim();
  while (c && !stop.has(c)) {
    out.push(c);
    const { tree, parents } = info.get(c);
    c = parents.slice(1).find((p) => info.get(p).tree === tree) || parents[0];
  }
  if (stop.size && !c) throw new Error(`${ref} does not lead back to a commit mapped before: the source history was rewritten (run a rebuild)`);
  return out.reverse();
}

/** Author time (seconds), and the message of each commit. */
export function commits(repo, shas) {
  if (!shas.length) return new Map();
  const out = new Map();
  const text = git(repo, ['log', '--no-walk=unsorted', '--stdin', '--format=%H%x00%at%x00%B%x01'], shas.join('\n') + '\n');
  for (const rec of text.split('\x01')) {
    const [sha, at, msg] = rec.replace(/^\n/, '').split('\0');
    if (sha) out.set(sha, { time: Number(at), message: msg || '' });
  }
  return out;
}

/** Paths that differ between two commits (a null base: everything in b): [{ path, sha }], sha null for a deleted path.
 * Submodule links are left out (a build copies files). */
export function diffTree(repo, a, b) {
  const raw = git(repo, ['diff-tree', '-r', '-z', '--no-renames', a || EMPTY_TREE, b]).split('\0');
  const out = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const m = /^:(\d+) (\d+) [0-9a-f]+ ([0-9a-f]+) (\w)/.exec(raw[i]);
    if (!m) { i--; continue; }
    if (m[1] === '160000' || m[2] === '160000') continue;
    out.push({ path: raw[i + 1], sha: m[4] === 'D' ? null : m[3] });
  }
  return out;
}

/** Every file of a commit: Map path -> blob sha. */
export function lsTree(repo, ref) {
  const out = new Map();
  for (const e of git(repo, ['ls-tree', '-r', '-z', ref]).split('\0')) {
    const m = /^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/.exec(e);
    if (m) out.set(m[2], m[1]);
  }
  return out;
}

/** The contents of blobs, read through one cat-file process per 400 of them: Map sha -> Buffer. */
export function readBlobs(repo, shas) {
  const out = new Map(), todo = [...new Set(shas)];
  for (let k = 0; k < todo.length; k += 400) {
    const buf = git(repo, ['cat-file', '--batch'], todo.slice(k, k + 400).join('\n') + '\n', true);
    let i = 0;
    while (i < buf.length) {
      const nl = buf.indexOf(10, i), [sha, type, size] = buf.subarray(i, nl).toString().split(' ');
      if (type !== 'blob') throw new Error(`cat-file: ${sha} is ${type}`);
      out.set(sha, buf.subarray(nl + 1, nl + 1 + Number(size)));
      i = nl + 2 + Number(size);
    }
  }
  return out;
}

/** git's blob id of some bytes. */
export const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

/** A path for fast-import: quoted when it needs it. */
const quote = (p) => (/^"|[\n"\\]/.test(p) ? JSON.stringify(p) : p);

/** Writes commits into a repository through git fast-import. commit() returns the mark; done() waits for git and returns
 * Map mark -> commit sha. */
export class FastImport {
  constructor(repo, marksFile) {
    this.marksFile = marksFile;
    this.child = spawn('git', ['-C', repo, 'fast-import', '--quiet', '--date-format=raw', `--export-marks=${marksFile}`], { stdio: ['pipe', 'inherit', 'inherit'], env: ENV });
    this.closed = new Promise((ok, fail) => this.child.on('close', (code) => (code ? fail(new Error(`git fast-import exited with ${code}`)) : ok())));
    this.n = 0;
  }
  async write(chunk) { if (!this.child.stdin.write(chunk)) await new Promise((ok) => this.child.stdin.once('drain', ok)); }
  /** c: { ref, from?, name, email, time, message, changes: [{ path, data? }] } (no data: delete the path). */
  async commit(c) {
    const mark = ++this.n, who = `${c.name} <${c.email}> ${c.time} +0000`, msg = Buffer.from(c.message);
    let head = `commit ${c.ref}\nmark :${mark}\nauthor ${who}\ncommitter ${who}\ndata ${msg.length}\n`;
    await this.write(head); await this.write(msg); head = '\n';
    if (c.from) head += `from ${c.from}\n`;
    await this.write(head);
    for (const ch of c.changes) {
      if (!ch.data) { await this.write(`D ${quote(ch.path)}\n`); continue; }
      await this.write(`M 100644 inline ${quote(ch.path)}\ndata ${ch.data.length}\n`);
      await this.write(ch.data); await this.write('\n');
    }
    await this.write('\n');
    return mark;
  }
  async done() {
    this.child.stdin.end();
    await this.closed;
    const marks = new Map();
    if (existsSync(this.marksFile)) for (const l of readFileSync(this.marksFile, 'utf8').split('\n')) { const [m, s] = l.split(' '); if (s) marks.set(Number(m.slice(1)), s); }
    return marks;
  }
}
