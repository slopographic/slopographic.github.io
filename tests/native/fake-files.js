/* A stand-in for the iPhone/iPad app's Capacitor bridge and its SiteFiles plugin (mobile/ios/SiteFiles.swift): the three
 * roots as maps in memory, the same calls and answers. window.__fs lets a test look inside and act as the Files app.
 * Load it before mobile/ios/native.js and files.js. */
(function () {
  'use strict';
  const ROOTS = { documents: 'file:///docs/', cache: 'file:///cache/', icloud: 'file:///icloud/' };
  const files = new Map(), dirs = new Set();          // 'root:path' → { bytes, mtime }; 'root:path' of folders
  let clock = 1000, icloudOn = false;
  const key = (r, p) => (r || 'documents') + ':' + p;
  const parents = (r, p) => { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(key(r, parts.slice(0, i).join('/'))); };
  const hidden = (p) => p.split('/').some((n) => n.startsWith('.')) || p === 'Inbox' || p.startsWith('Inbox/');
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const stat = (r, p) => { const f = files.get(key(r, p)); return { size: f.bytes.length, mtime: f.mtime }; };
  const put = (r, p, bytes) => { parents(r, p); files.set(key(r, p), { bytes, mtime: (clock += 1000) }); return stat(r, p); };
  const under = (r, p) => [...files.keys(), ...dirs].filter((k) => k.startsWith(key(r, p) + '/'));
  const fs = {
    calls: [], back: {}, exported: [], shared: [], opened: [],
    put: (r, p, text) => put(r, p, typeof text === 'string' ? enc.encode(text) : text),
    text: (r, p) => { const f = files.get(key(r, p)); return f ? dec.decode(f.bytes) : null; },
    has: (r, p) => files.has(key(r, p)),
    list: (r) => [...files.keys()].filter((k) => k.startsWith(r + ':')).map((k) => k.slice(r.length + 1)).filter((p) => !hidden(p)).sort(),
    del: (r, p) => { files.delete(key(r, p)); for (const k of under(r, p)) { files.delete(k); dirs.delete(k); } dirs.delete(key(r, p)); },
    mkdir: (r, p) => { parents(r, p + '/x'); },
    isDir: (r, p) => dirs.has(key(r, p)),
    reset: () => { files.clear(); dirs.clear(); icloudOn = false; fs.calls = []; fs.back = {}; fs.exported = []; fs.shared = []; },
  };
  const info = () => ({ documents: ROOTS.documents, cache: ROOTS.cache, icloud: ROOTS.icloud, container: 'iCloud.example.test', icloudOn });
  const SiteFiles = {
    info: async () => info(),
    setICloud: async ({ on }) => { icloudOn = !!on; return info(); },
    tree: async ({ root }) => {
      const entries = [];
      for (const k of dirs) if (k.startsWith(root + ':')) { const p = k.slice(root.length + 1); if (!hidden(p)) entries.push({ path: p, dir: true, size: 0, mtime: 0, placeholder: false }); }
      for (const p of fs.list(root)) entries.push(Object.assign({ path: p, dir: false, placeholder: false }, stat(root, p)));
      return { entries };
    },
    write: async ({ root, path, data, append }) => {
      fs.calls.push(['write', root, path]);
      const bytes = b64(data), prev = append && files.get(key(root, path));
      return put(root, path, prev ? new Uint8Array([...prev.bytes, ...bytes]) : bytes);
    },
    move: async ({ root, from, to }) => {
      fs.calls.push(['move', root, from, to]);
      const f = files.get(key(root, from));
      if (!f) throw new Error('nothing at ' + from);
      files.delete(key(root, from)); parents(root, to); files.set(key(root, to), f);
      return stat(root, to);
    },
    remove: async ({ root, path, emptyOnly }) => {
      fs.calls.push(['remove', root, path]);
      if (emptyOnly && under(root, path).some((k) => files.has(k))) return { removed: false };
      fs.del(root, path);
      return { removed: true };
    },
    mkdir: async ({ root, path }) => { fs.mkdir(root, path); return {}; },
    takeOpened: async () => ({ files: fs.opened.splice(0) }),
    writeBack: async ({ token, root, path }) => { fs.back[token] = fs.text(root, path); return { name: 'doc.pdf' }; },
    exportFile: async ({ root, path }) => { fs.exported.push([root, path]); return { saved: true }; },
    addListener: async () => ({ remove() {} }),
  };
  window.Capacitor = {
    isPluginAvailable: (n) => n === 'SiteFiles',
    Plugins: { SiteFiles, Share: { share: async (o) => { fs.shared.push(o); } } },
    convertFileSrc: (u) => {
      const r = Object.keys(ROOTS).find((k) => u.startsWith(ROOTS[k]));
      const p = u.slice(ROOTS[r].length).split('/').map(decodeURIComponent).join('/'), f = files.get(key(r, p));
      return f ? URL.createObjectURL(new Blob([f.bytes])) : '/__missing__';
    },
  };
  window.__fs = fs;
})();
