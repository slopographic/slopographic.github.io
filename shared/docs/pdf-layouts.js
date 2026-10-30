// The shared document templates for Slop Orders and Slop Invoices: five layouts for the PDF export, the print view and
// the paper view. A layout is data only (no drawing here). A document has a seed (pdfSeed, an integer kept on the record);
// the seed picks the layout and the accent colour, so the same document always exports the same way. A document may
// also pick its layout (pdfLayout); the seed still picks the accent. Pure: no DOM, no storage. Classic script.
// Exposes window.SlopDocs.layouts.
(function (g) {
  'use strict';
  const NS = (g.SlopDocs = g.SlopDocs || {});

  /** Accents: rgb for the PDF (0 to 1) and css for the screen. Layouts with accent false use ink. */
  const ACCENTS = [
    { id: 'slate', name: 'Slate', rgb: [0.20, 0.27, 0.36], css: '#33455c' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
    { id: 'teal', name: 'Teal', rgb: [0.04, 0.42, 0.43], css: '#0b6b6e' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
    { id: 'plum', name: 'Plum', rgb: [0.36, 0.16, 0.36], css: '#5c295c' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
    { id: 'forest', name: 'Forest', rgb: [0.16, 0.37, 0.21], css: '#295e35' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
  ];
  const INK = { id: 'ink', name: 'Ink', rgb: [0.10, 0.10, 0.10], css: '#1a1a1a' };   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)

  /** The five templates. family: the font pair (sans = Helvetica, serif = Times). header: plain, rule, or band (a full
   *  width accent band). table: rules, zebra, plain. totals: box (tinted) or rule. sidebar: a left column with the
   *  company, bill-to and number block. accent: whether the seed's accent colour is used. */
  const LAYOUTS = [
    { id: 'classic', name: 'Classic', family: 'serif', header: 'rule', table: 'rules', totals: 'rule', sidebar: false, accent: false,   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
      titleAlign: 'right', description: 'Serif type, a rule under the header, ruled table, plain black totals.' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
    { id: 'modern', name: 'Modern', family: 'sans', header: 'plain', table: 'zebra', totals: 'box', sidebar: false, accent: true,   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
      titleAlign: 'right', description: 'Sans type, accent title, zebra rows, a tinted totals box.' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
    { id: 'minimal', name: 'Minimal', family: 'sans', header: 'plain', table: 'plain', totals: 'rule', sidebar: false, accent: false,   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
      titleAlign: 'left', description: 'Light grey type, open table with no row rules, generous space.' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
    { id: 'bold', name: 'Bold header', family: 'sans', header: 'band', table: 'rules', totals: 'box', sidebar: false, accent: true,   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
      titleAlign: 'left', description: 'A full width accent band with the company and title in white.' },   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
    { id: 'sidebar', name: 'Side bar', family: 'sans', header: 'plain', table: 'rules', totals: 'rule', sidebar: true, accent: true,   // i18n-ignore: the PDF code's names (the page shows biz.lay.* and biz.acc.*)
      titleAlign: 'left', description: 'A tinted left column with the company, bill-to and numbers; the table on the right.' },
  ];
  const IDS = LAYOUTS.map((l) => l.id);

  /** FNV-1a over the decimal text of the seed, then an avalanche, so near seeds pick different layouts. Unsigned 32-bit. */
  function hash(seed) {
    let h = 0x811c9dc5;
    for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }

  /** A new seed for a new document (a random integer 0 to 2147483647). Stored on the record, never recomputed. */
  function newSeed() {
    const c = g.crypto && g.crypto.getRandomValues ? g.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
    return c & 0x7fffffff;
  }

  /** The seed of a document: its stored pdfSeed, or (for a record saved before seeds) a stable value from its id. */
  function seedOf(doc) {
    if (Number.isInteger(doc.pdfSeed) && doc.pdfSeed >= 0) return doc.pdfSeed;
    return hash(doc.id || doc.number || 'draft') & 0x7fffffff;
  }

  /** The style for a document: { id, name, family, header, table, totals, sidebar, titleAlign, seed, accent{ id, name, rgb, css } }.
   *  The layout is the document's pick when it has one, else the seed's. Same document, same style. */
  function resolve(doc) {
    const seed = seedOf(doc || {});
    const h = hash(seed);
    const picked = LAYOUTS.find((l) => l.id === (doc && doc.pdfLayout)) || LAYOUTS[h % LAYOUTS.length];
    const accent = picked.accent ? ACCENTS[Math.floor(h / LAYOUTS.length) % ACCENTS.length] : INK;
    return { ...picked, seed, accent };
  }

  /** One line for the layout note: "Modern, Teal (seed 1234)". */
  // the names and descriptions above are the PDF code's (English); the page shows biz.lay.<id>, biz.lay.<id>_d and biz.acc.<id>
  const t = (k) => (g.SlopI18n && g.SlopI18n.has && g.SlopI18n.has(k) ? g.SlopI18n.t(k) : null);
  const nameOf = (l) => t('biz.lay.' + l.id) || l.name;
  const descriptionOf = (l) => t(`biz.lay.${l.id}_d`) || l.description;
  const accentName = (a) => t('biz.acc.' + a.id) || a.name;
  const describe = (style) => (g.SlopI18n ? g.SlopI18n.t('biz.pg.describe', { layout: nameOf(style), accent: accentName(style.accent), seed: String(style.seed) }) : `${style.name}, ${style.accent.name} (seed ${style.seed})`);

  NS.layouts = { LAYOUTS, IDS, ACCENTS, hash, newSeed, seedOf, resolve, describe, nameOf, descriptionOf, byId: (id) => LAYOUTS.find((l) => l.id === id) || null };
})(typeof window !== 'undefined' ? window : globalThis);
