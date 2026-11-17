/* The files that come with a model (an OBJ's .mtl and textures, a glTF's .bin and pictures, FBX and Collada textures).
 * A model names them by path; they are found here by file name, case-insensitively, among the files given with it.
 * Nothing is fetched from the network: a name that is not among the files is reported as missing and loads as nothing.
 * Browser and Node (Node has no textures, so models read there use no pictures). */
import { baseOf } from './formats.js';

/** An image that fails at once, so a missing texture never waits and never asks the network. */
const MISSING = 'data:image/gif;base64,';

export class Resources {
  /** T: three.js. files: [{ name, blob }] (the model itself may be among them). */
  constructor(T, files = []) {
    this.byName = new Map();
    this.urls = [];
    this.missing = new Set();
    this.used = new Set();
    for (const f of files) this.byName.set(baseOf(f.name).toLowerCase(), f.blob);
    this.pending = 0;
    this.waiters = [];
    const m = (this.manager = new T.LoadingManager());
    m.onStart = () => {};
    m.itemStart = (url) => { this.pending++; };
    m.itemEnd = (url) => { this.pending = Math.max(0, this.pending - 1); if (!this.pending) this.flush(); };
    m.itemError = (url) => { if (!/^(blob:|data:)/.test(url) || url === MISSING) return; this.missing.add(this.nameOf(url)); };
    m.setURLModifier((url) => this.resolve(url));
    this.reverse = new Map();
  }

  /** The blob URL for a referenced path (data: and blob: URLs pass unchanged). */
  resolve(url) {
    if (/^(data:|blob:)/.test(url)) return url;
    let name = baseOf(String(url).split(/[?#]/)[0]);
    try { name = decodeURIComponent(name); } catch (e) { /* keep as written */ }
    const blob = this.byName.get(name.toLowerCase());
    if (!blob) { this.missing.add(name); return MISSING; }
    this.used.add(name.toLowerCase());
    const u = URL.createObjectURL(blob);
    this.urls.push(u);
    this.reverse.set(u, name);
    return u;
  }
  nameOf(url) { return this.reverse.get(url) || url; }

  /** The text or bytes of a named companion file, or null. */
  async text(name) { const b = this.byName.get(baseOf(name).toLowerCase()); if (!b) return null; this.used.add(baseOf(name).toLowerCase()); return b.text(); }
  has(name) { return this.byName.has(baseOf(name).toLowerCase()); }

  flush() { const w = this.waiters; this.waiters = []; for (const f of w) f(); }
  /** Resolves when every texture the loaders started has finished (or after ms, so a stuck image never hangs a job). */
  idle(ms = 15000) {
    if (!this.pending) return new Promise((r) => setTimeout(r, 0)).then(() => (this.pending ? this.idle(ms) : undefined));
    return new Promise((resolve) => { const t = setTimeout(resolve, ms); this.waiters.push(() => { clearTimeout(t); resolve(); }); });
  }
  /** Releases the blob URLs (after the model and its pictures have loaded). */
  dispose() { for (const u of this.urls) URL.revokeObjectURL(u); this.urls = []; }
}
