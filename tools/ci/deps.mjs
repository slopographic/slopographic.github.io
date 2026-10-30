// Which repo files a browser test page depends on, for tools/ci/affected.mjs. A page depends on what it loads (script src,
// link href, import, importScripts, new Worker, an iframe or fetch of a repo path: any quoted path that names a repo
// file; in a page, only in its inline scripts: an <a href> link is not a load), on the files named in its "Covers:"
// lines, and on everything those files load in turn: a test that opens ../../pdf/index.html depends on every script of
// Slop PDF and every module and worker they load. Paths in a script are tried against the script's own folder, the
// folder of the page that loaded it, and the repo root (a script runs in its page, so a spec's "../../x/index.html" is
// relative to the test page). Paths built at run time are not seen.
// Pure: the files come in as a Set of paths and a reader of their text; no file system access here.
import path from 'node:path';

const QUOTED = /(['"`])((?:\.{1,2}\/|\/)?[\w@~+.\-/]*?[\w-]\.(?:m?js|html|css|json|wasm|onnx|svg|png|jpe?g|webp|pdf|csv|txt|woff2|ttf|ogg|wav|mp3|mp4|webm)|(?:\.{1,2}\/)+[\w@~+.\-/]*\/)(?:[?#][^'"`\s]*)?\1/g;
// What a tag loads: a script, frame, picture or media src, a stylesheet or preload href (a link to another page, <a href>,
// is not a load).
const ATTR = /<(?:script|iframe|img|source|video|audio|embed|link)\b[^>]*?\s(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
const COVERS = /Covers:\s*([^\n*]+)/g;
// Files that are not scanned for what they load (they are still dependencies): vendored libraries, data, and the offline
// copy's lists (the service worker and its precache name every file of the site, but load them only for later visits).
const OPAQUE = /^vendor\/|^service-worker\.js$|(^|\/)sw-precache(-\d+)?\.js$|\.(?:json|wasm|onnx|svg|png|jpe?g|webp|pdf|csv|txt|woff2|ttf|ogg|wav|mp3|mp4|webm)$/;

/** The raw paths a file's text names: quoted paths (in a page: in its inline scripts), what its tags load, and Covers:
 *  lines (those are repo paths). */
export function namedPaths(text, html = false) {
  const rel = new Set(), repo = new Set();
  const code = html ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n') : text;
  for (const m of code.matchAll(QUOTED)) rel.add(m[2]);
  for (const m of text.matchAll(ATTR)) rel.add((m[1] || m[2]).split(/[?#]/)[0]);
  for (const m of text.matchAll(COVERS)) for (const p of m[1].split(/[,\s]+/)) if (/^[\w@.-]+\/[\w@./-]*\.\w+$/.test(p)) repo.add(p.replace(/[.,;]$/, ''));
  return { rel: [...rel].filter((p) => !/^(?:https?:|data:|blob:|mailto:|#)/.test(p)), repo: [...repo] };
}

/** A named path as a repo file: tried against each folder in turn ('' is the repo root); a folder means its index.html. */
export function resolvePath(p, dirs, has) {
  const tries = p.startsWith('/') ? [p.slice(1)] : dirs.map((d) => path.posix.normalize(path.posix.join(d, p)));
  for (let t of tries) {
    if (t.startsWith('..')) continue;
    if (t.endsWith('/')) t += 'index.html';
    if (has(t)) return t;
  }
  return null;
}

/** A dependency graph over the repo. files: a Set of repo paths; read(path): its text (or null). */
export function makeGraph(files, read) {
  const has = (f) => files.has(f);
  const direct = new Map();
  /** What one file loads, as repo paths, with the folder of its page (where its relative strings resolve too). */
  function depsOf(f, pageDir) {
    const key = f + '\0' + pageDir;
    if (direct.has(key)) return direct.get(key);
    const out = new Set();
    const text = OPAQUE.test(f) ? null : read(f);
    if (text) {
      const own = path.posix.dirname(f), dirs = [...new Set([own, pageDir, ''])];
      const named = namedPaths(text, f.endsWith('.html'));
      for (const p of named.rel) { const r = resolvePath(p, dirs, has); if (r && r !== f) out.add(r); }
      for (const p of named.repo) if (has(p)) out.add(p);
    }
    direct.set(key, out);
    return out;
  }
  const closures = new Map();
  /** Every file a page depends on (itself included). */
  function closure(page) {
    if (closures.has(page)) return closures.get(page);
    const seen = new Set([page]);
    const todo = [[page, path.posix.dirname(page)]];
    while (todo.length) {
      const [f, pageDir] = todo.pop();
      for (const d of depsOf(f, pageDir)) {
        if (seen.has(d)) continue;
        seen.add(d);
        todo.push([d, d.endsWith('.html') ? path.posix.dirname(d) : pageDir]);
      }
    }
    closures.set(page, seen);
    return seen;
  }
  return { closure, depsOf };
}
