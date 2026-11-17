/* Slopographic font catalogue (window.SlopFontCatalog), for every app. One answer to "which families can this app use":
 * - the bundled library, from SlopFonts.bundledIndex() (shared/fonts/library/index.json, the one font list);
 * - the fonts installed from "Get more" packs and the font files the person added, both in IndexedDB (shared/library/store.js).
 * It also reads PostScript font names ("ABCDEF+Barlow-SemiBold"), picks a face by weight and style, names the closest bundled
 * family for a font that is not installed, and checks a font file the person owns with fontkit (vendor/fontkit) before storing it.
 * Nothing is downloaded here. A face is embeddable in a saved PDF when it is a TTF, OTF or WOFF file (fontkit cannot subset
 * WOFF2); a bundled face names its embeddable copy in index.json ("pdf"). Classic script; needs shared/fonts/picker.js. */
(function (root) {
  'use strict';
  const doc = root.document;
  const SELF = (doc && doc.currentScript && doc.currentScript.src) || root.location.href;
  const LIB = new URL('library/', SELF).href;
  const FONTKIT = new URL('../../vendor/fontkit/fontkit.min.js', SELF).href;
  /** The bundled family that stands in for a font the app does not have, by category. A narrow sans (Barlow Condensed, Arial
   * Narrow) takes the bundled condensed family, so its lines keep about the same length. */
  const CLOSEST = { sans: 'Source Sans 3', serif: 'Merriweather', mono: 'Space Mono' };
  const CONDENSED = 'Oswald', NARROW = /condensed|narrow|compressed|\bcond\b/i;
  const WEIGHTS = { thin: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };
  const WEIGHT_WORDS = Object.keys(WEIGHTS).sort((a, b) => b.length - a.length);
  const SUBSET = /^[A-Z]{6}\+/;
  /** A refusal shown to the person (ui.fonts.err_*), in the chosen language at throw time. */
  const tr = (k, v) => { const I = root.SlopI18n; return I ? I.t(k, v) : k; };
  const fail = (k, v) => new Error(tr('ui.fonts.err_' + k, v));
  let fkP = null;

  /** Resolves once the picker's library scripts (store, manifest, Get more) are on the page. */
  function ready() { return root.SlopFonts ? root.SlopFonts.ready() : Promise.resolve(); }
  /** The bundled faces, from the picker's index reader (the one place that reads index.json). */
  function bundled() {
    return root.SlopFonts.bundledIndex().then((fs) => fs.map((f) => ({ family: f.family, weight: String(f.weight), style: f.style || 'normal', category: f.category || 'sans', source: 'bundled', site: !!f.brand, url: LIB + f.file, embed: f.pdf ? LIB + f.pdf : null })));
  }
  /** The open document's own fonts (kept in the document file by Slop Docs, Slop Slides and Slop Press): [{ family, weight,
   * italic, bytes }]. They are listed as "own" (source 'own'), the same as the person's own files. */
  let docFaces = [], docOnly = false;
  /** With opts.only, the app's list is its own engine fonts plus these (the person's files from other apps are not listed). */
  function setDocumentFonts(list, opts) {
    docFaces = (list || []).map((f) => ({ family: f.family, weight: String(f.weight || 400), style: f.italic ? 'italic' : 'normal', category: guessCategory(f.family), source: 'own', user: true, key: 'doc/' + f.family, bytes: f.bytes, embed: true }));
    docOnly = !!(opts && opts.only);
  }
  /** Every face the app can load: bundled faces, the document's own, then installed ones. A face has family, weight (a number or
   * "min max"), style. */
  async function faces() {
    if (docOnly) return docFaces.slice();
    const list = (await bundled()).concat(docFaces);
    try {
      await ready();
      const store = root.SlopLibraryStore;
      if (!store) return list;
      for (const p of await store.listPacks()) {
        if (p.kind === 'model') continue; // AI models are not fonts
        for (const f of p.files) list.push({ family: f.family, weight: String(f.weight), style: f.style || 'normal', category: guessCategory(f.family), source: 'installed', user: p.licence === 'user', key: `${p.id}/${f.name}`, embed: !/\.woff2$/i.test(f.name), metricFor: f.metricFor || [] });
      }
    } catch (e) { /* storage unavailable: bundled faces only */ }
    return list;
  }
  /** Families the app can use: name, category, source ('bundled', 'installed', or 'own' for a font file the person added) and
   * metricFor (the fonts it has the same widths as, from its pack: Carlito lists Calibri). */
  async function families() {
    const seen = new Map();
    for (const f of await faces()) {
      if (!seen.has(f.family)) seen.set(f.family, { name: f.family, category: f.category, source: f.user ? 'own' : f.source, metricFor: [], ...(f.site ? { site: true } : {}) });
      const r = seen.get(f.family);
      for (const m of f.metricFor || []) if (!r.metricFor.includes(m)) r.metricFor.push(m);
    }
    return [...seen.values()];
  }
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  /** The family that sets a name: the name itself when it has a face, else an installed family with the same widths (Carlito
   * for "Calibri"), else null. */
  async function standIn(name) {
    const all = await faces();
    if (all.some((f) => f.family === name)) return name;
    const hit = all.find((f) => (f.metricFor || []).some((m) => same(m, name)));
    return hit ? hit.family : null;
  }
  /** Whether a name has at least one face installed or bundled: its own, or a family with the same widths. */
  async function hasFamily(name) { return !!(await standIn(name)); }
  /** The weight range a face covers: [400, 400] for a static face, [100, 900] for a variable one. */
  function range(w) { const n = String(w).trim().split(/\s+/).map(Number); return [n[0], n[1] || n[0]]; }
  /** The embeddable face of a family that best fits a weight (100-900) and style (style counts after weight), or null when
   * the family has no embeddable face. */
  async function pickFace(family, weight, italic) {
    const want = italic ? 'italic' : 'normal', target = Number(weight) || 400;
    family = (await standIn(family)) || family;
    let best = null, bestD = Infinity;
    for (const f of await faces()) {
      if (f.family !== family || !f.embed) continue;
      const [lo, hi] = range(f.weight);
      const d = (target >= lo && target <= hi ? 0 : Math.min(Math.abs(target - lo), Math.abs(target - hi))) + (f.style === want ? 0 : 1000);
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }
  /** The file bytes of a face for embedding: fetched for a bundled face, read from IndexedDB for an installed one. */
  async function bytesOf(face) {
    if (face.bytes) return face.bytes;
    if (face.source === 'bundled') {
      const r = await fetch(face.embed, { cache: 'force-cache' });
      if (!r.ok) throw new Error(`${face.embed}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }
    const blob = await root.SlopLibraryStore.getBlob(face.key);
    if (!blob) throw fail('gone');
    return new Uint8Array(await blob.arrayBuffer());
  }
  /** A PostScript font name as { family, weight, italic, subset, name }. "ABCDEF+BarlowCondensed-SemiBold" is the subset
   * "Barlow Condensed", weight 600. A name with no style part is Regular. A subset is marked by its six-letter tag (most
   * writers) or by a numeric suffix ("Barlow-Regular-9742", pdf-lib). */
  function parseName(ps) {
    let s = String(ps || '');
    let subset = SUBSET.test(s);
    if (subset) s = s.slice(7);
    if (/-\d{3,}$/.test(s)) { subset = true; s = s.replace(/-\d{3,}$/, ''); }
    const dash = s.indexOf('-');
    const base = dash < 0 ? s : s.slice(0, dash), style = (dash < 0 ? '' : s.slice(dash + 1)).toLowerCase().replace(/[\s_]/g, '');
    let weight = 400;
    const word = WEIGHT_WORDS.find((w) => style.includes(w));
    if (word) weight = WEIGHTS[word];
    return { family: base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim(), weight, italic: /italic|oblique/.test(style), subset, name: s };
  }
  /** Whether a family reads as serif, mono or sans, from its name. */
  function guessCategory(name) {
    const n = String(name || '');
    if (/mono|courier|consol|code/i.test(n)) return 'mono';
    if (/serif|times|georgia|garamond|palatino|cambria|minion|caslon|bodoni|roman/i.test(n) && !/sans/i.test(n)) return 'serif';
    return 'sans';
  }
  /** The bundled family that stands in for a family the app does not have (same category; condensed for a narrow sans). */
  function closestFamily(name) {
    const cat = guessCategory(name);
    return cat === 'sans' && NARROW.test(parseName(name).family + ' ' + name) ? CONDENSED : CLOSEST[cat];
  }
  /** The "Get more" pack that lists a family, or a family with the same widths: { id, name }, or null when no listed pack has it. */
  async function packFor(family) {
    try {
      await ready();
      const m = await root.SlopLibrary.loadManifest();
      const p = m.packs.find((x) => x.kind !== 'model' && x.files.some((f) => f.family === family || (f.metricFor || []).some((m) => same(m, family))));
      return p ? { id: p.id, name: p.name } : null;
    } catch (e) { return null; }
  }
  /** fontkit, loaded once from vendor/fontkit on first use. */
  function fontkit() {
    if (root.fontkit) return Promise.resolve(root.fontkit);
    if (!fkP) fkP = new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = FONTKIT; s.async = false;
      s.onload = () => (root.fontkit ? resolve(root.fontkit) : reject(new Error('fontkit did not load')));
      s.onerror = () => reject(new Error('fontkit could not be loaded'));
      doc.head.append(s);
    });
    return fkP;
  }
  /** Family name, weight and italic flag of a font file (fontkit). Throws a message for a file it cannot read. */
  async function fontNames(bytes) {
    let f;
    try { const fk = await fontkit(); f = fk.create(bytes); if (f.fonts) f = f.fonts[0]; } catch (e) { throw fail('not_font'); }
    const family = String(f.familyName || '').trim();
    if (!family) throw fail('no_family');
    return { family, weight: (f['OS/2'] && f['OS/2'].usWeightClass) || 400, italic: /italic|oblique/i.test(f.subfamilyName || '') };
  }
  /** Reads a font file the person chose for one app (app: its name, for the message): { family, weight, italic, bytes, ext }.
   * Only TTF and OTF: WOFF and WOFF2 are refused with a message, because the apps' engines read the sfnt tables of a file. */
  async function readFontFile(file, app) {
    const ext = (String(file.name).split('.').pop() || '').toLowerCase();
    if (ext === 'woff' || ext === 'woff2') throw fail('woff_app', { format: ext.toUpperCase(), app });
    if (ext !== 'ttf' && ext !== 'otf') throw fail('ttf_otf');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw fail('too_big', { size: '20 MB' });
    return { ...(await fontNames(bytes)), bytes, ext };
  }
  /** A font file as a data URL (what a document keeps in its file) and back. */
  function toDataURL(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:font/ttf;base64,' + btoa(s);
  }
  function fromDataURL(url) {
    const b = atob(String(url).slice(String(url).indexOf(',') + 1)), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  /** Adds a font file the person owns (TTF, OTF, WOFF or WOFF2). fontkit must read it; it is then stored in IndexedDB the
   * same way a pack is (one pack per file, marked as the person's own). Resolves { family, weight, italic }. */
  async function addUserFile(file) {
    const ext = (String(file.name).split('.').pop() || '').toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) throw fail('ttf_otf_woff');
    if (ext === 'woff2') throw fail('woff2_pdf');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw fail('too_big', { size: '20 MB' });
    await ready();
    const store = root.SlopLibraryStore;
    if (!store || !(await store.available())) throw fail('no_store');
    const { family, weight: w, italic } = await fontNames(bytes);
    const sha = await root.SlopLibraryManifest.sha256Hex(bytes), id = 'user-' + family.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + sha.slice(0, 8);
    const name = 'font.' + ext, style = italic ? 'italic' : 'normal';
    const pack = { id, kind: 'font', name: tr('ui.fonts.own_pack_name', { family }), licence: 'user', licenceUrl: '', description: tr('ui.fonts.own_pack_desc'), size: bytes.length,
      files: [{ name, url: '', size: bytes.length, sha256: sha, family, weight: String(w), style }] };
    await store.savePack(pack, { [name]: new Blob([bytes], { type: 'font/' + ext }) });
    return { family, weight: w, italic, id };
  }

  root.SlopFontCatalog = { ready, faces, families, hasFamily, standIn, pickFace, bytesOf, parseName, guessCategory, closestFamily, packFor, fontkit, addUserFile, readFontFile, setDocumentFonts, toDataURL, fromDataURL, range };
})(typeof window !== 'undefined' ? window : globalThis);
