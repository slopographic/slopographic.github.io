/* Slop Docs: the shared config kind 'document' for app 'docs' (shared/config, HANDOFF.md there). The file holds the page
   setup (size, orientation, margins), the paragraphs (style, alignment, text) and the tables (cell text). Marks (bold and
   the rest), lists, images, footnotes, headers and footers are not in the file yet. Export reads the open document; import
   builds a new document and opens it after the person confirms discarding unsaved changes. Classic script: uses the engine
   (window.SlopDocEngine) and the UI (window.SlopDocs) at call time only. Exposes window.SlopDocsConfig. */
(function () {
  'use strict';
  const C = window.SlopConfig, D = window.SlopConfigDialog, APP = 'docs';
  const STYLES = ['Normal', 'Title', 'Subtitle', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Quote', 'Code', 'List'];
  const SIZES = ['A4', 'Letter', 'Legal', 'A5'];
  const MAX_ROWS = 200, MAX_COLS = 20;
  const engine = () => window.SlopDocEngine;
  const ui = () => window.SlopDocs;

  const SECTION = C ? C.F.obj({
    size: C.F.enum(SIZES, { required: true, desc: 'paper size' }), // i18n-ignore: config schema and sample content (API)
    orient: C.F.enum(['portrait', 'landscape'], { required: true, desc: 'page orientation' }), // i18n-ignore: config schema and sample content (API)
    margin: C.F.obj({
      top: C.F.num({ min: 0, max: 300, desc: 'top margin in points (72 is one inch)' }), // i18n-ignore: config schema and sample content (API)
      right: C.F.num({ min: 0, max: 300, desc: 'right margin in points' }), // i18n-ignore: config schema and sample content (API)
      bottom: C.F.num({ min: 0, max: 300, desc: 'bottom margin in points' }), // i18n-ignore: config schema and sample content (API)
      left: C.F.num({ min: 0, max: 300, desc: 'left margin in points' }), // i18n-ignore: config schema and sample content (API)
    }, { desc: 'page margins' }), // i18n-ignore: config schema and sample content (API)
  }, { required: true, desc: 'page setup' }) : null; // i18n-ignore: config schema and sample content (API)

  /** The document as file data. Tables with more rows or columns than the format allows are refused by name. */
  function docData(doc) {
    const E = engine(), M = E.M, sec = doc.section;
    const blocks = [];
    for (const b of doc.blocks) {
      if (b.type === 'p') {
        const o = { type: 'p', style: STYLES.includes(b.style) ? b.style : 'Normal', text: M.paraText(b).slice(0, 5000) };
        const al = b.props && b.props.align;
        if (al && ['left', 'center', 'right', 'justify'].includes(al)) o.align = al;
        blocks.push(o);
      } else if (b.type === 'table') {
        const rows = b.rows.map((r) => r.cells.map((c) => c.blocks.map((p) => M.paraText(p)).join('\n').slice(0, 5000)));
        if (rows.length > MAX_ROWS || rows.some((r) => r.length > MAX_COLS)) throw new Error(`a table is bigger than ${MAX_ROWS} rows or ${MAX_COLS} columns`);
        blocks.push({ type: 'table', rows });
      }
    }
    const size = typeof sec.size === 'string' && SIZES.includes(sec.size) ? sec.size : 'Letter';
    return {
      section: { size, orient: sec.orient === 'landscape' ? 'landscape' : 'portrait', margin: { top: sec.margin.top, right: sec.margin.right, bottom: sec.margin.bottom, left: sec.margin.left } },
      blocks: blocks.length ? blocks : [{ type: 'p', style: 'Normal', text: '' }],
    };
  }

  /** The file as a new document (its page setup, paragraphs and tables). */
  function docFrom(data) {
    const M = engine().M;
    const doc = M.newDoc({ size: data.section.size });
    const m = data.section.margin;
    doc.section = Object.assign({}, doc.section, { size: data.section.size, orient: data.section.orient, margin: Object.assign({}, doc.section.margin, m) });
    doc.blocks = data.blocks.map((b) => {
      if (b.type === 'table') {
        const cols = Math.max(1, ...b.rows.map((r) => r.length));
        const t = M.table(Math.max(1, b.rows.length), cols);
        b.rows.forEach((r, ri) => r.forEach((text, ci) => { t.rows[ri].cells[ci].blocks = [M.para(text)]; }));
        return t;
      }
      return M.para(b.text, b.style || 'Normal', b.align ? { align: b.align } : {});
    });
    return doc;
  }

  /** Apply: the new document replaces the open one after the person confirms discarding unsaved changes. */
  async function apply(data, ctx) {
    const doc = docFrom(data);
    const S = ui();
    if (S && S.confirmDiscard && !(await S.confirmDiscard())) return { ok: false, message: 'the open document was kept' }; // i18n-ignore: config schema and sample content (API)
    S.setDoc(engine().M.normalizeDoc(doc), { file: { id: null, name: ctx.name, dirty: true } });
  }

  if (C && D && SECTION) {
    C.registerKind('document', APP, {
      strict: true,
      fields: {
        section: SECTION,
        blocks: C.F.list(C.F.obj({
          type: C.F.enum(['p', 'table'], { required: true, desc: 'p: a paragraph; table: a table of cell text' }),
          style: C.F.enum(STYLES, { desc: 'paragraph style: Normal, Title, Subtitle, H1 to H6, Quote, Code, List' }), // i18n-ignore: config schema and sample content (API)
          align: C.F.enum(['left', 'center', 'right', 'justify'], { desc: 'alignment of a paragraph' }), // i18n-ignore: config schema and sample content (API)
          text: C.F.text({ desc: 'the words of a paragraph' }), // i18n-ignore: config schema and sample content (API)
          rows: C.F.list(C.F.list(C.F.text({}), { max: MAX_COLS }), { max: MAX_ROWS, desc: 'table rows; each row is a list of cell texts' }),
        }), { required: true, max: 2000, desc: 'the content, in order' }), // i18n-ignore: config schema and sample content (API)
      },
    }, apply, {
      label: 'Document', description: 'Page setup, paragraphs in their styles, and tables with their text', // i18n-ignore: config schema and sample content (API)
      read: () => docData(ui().doc),
    });
    const example = { kind: 'document', value: { section: { size: 'Letter', orient: 'portrait', margin: { top: 72, right: 72, bottom: 72, left: 72 } },
      blocks: [{ type: 'p', style: 'Title', text: 'Document title' }, { type: 'p', style: 'Normal', text: 'Replace this with your text.' }] } }; // i18n-ignore: config schema and sample content (API)
    window.SlopDocsConfig = {
      commands: () => D.commands({ app: APP, prefix: 'docs', example }),
      menu: () => ({ label: window.SlopI18n ? SlopI18n.t('docs.menu.config') : 'Config', sub: D.menuItems({ app: APP, example }) }),
    };
    D.install({ app: APP, dragover: true });
  }
})();
