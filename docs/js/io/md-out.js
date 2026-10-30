/* Slop Docs — io/md-out: a document as Markdown. Pure (no DOM), so File convert and the Node tests use it as it is.
 *   toMarkdown(doc, { underline = true })   headings (# to ######), bullet and numbered lists (nested by level, four
 *     spaces a level), quotes, code paragraphs as fenced blocks, **bold**, *italic*, ~~strike~~, `code` (Cousine 10 pt, as
 *     Markdown import makes it, or a monospaced font), [links](https://…) and tables as GitHub pipe tables (the first row
 *     is the header; merged cells are left empty; a cell's paragraphs are joined with <br>). underline: __text__, as Slop
 *     Docs' own Markdown import reads it; false leaves underline out (standard Markdown has none, and __ means bold there).
 *   Characters Markdown would read as marks are escaped with a backslash (sdoc.js mdRuns reads them back).
 *   spans(runs) the runs of a paragraph merged into spans of the same marks (also used by html-out.js).
 * Pictures, fields, footnotes, headers and footers are left out. */
const OBJ = '￼';
const HEAD = { Title: '# ', H1: '# ', H2: '## ', H3: '### ', H4: '#### ', H5: '##### ', H6: '###### ' };
const MONO = /^(cousine|courier|courier new|consolas|menlo|monaco|jetbrains mono|liberation mono|lucida console|source code pro|roboto mono)$/i;

export const isCode = (r) => !!r && ((r.font === 'Cousine' && r.size === 10) || MONO.test(String(r.font || '')));
const key = (r) => [r.b ? 'b' : '', r.i ? 'i' : '', r.u ? 'u' : '', r.s ? 's' : '', isCode(r) ? 'c' : '', r.va || '', r.link || '', r.color || ''].join('|');

/** The text runs of a paragraph (objects dropped), joined into spans that share every mark. */
export function spans(runs) {
  const out = [];
  for (const r of runs || []) {
    if (r.obj || !r.text) continue;
    const t = r.text.replace(new RegExp(OBJ, 'g'), '');
    if (!t) continue;
    const last = out[out.length - 1];
    if (last && key(last) === key(r)) last.text += t;
    else out.push({ ...r, text: t });
  }
  return out;
}

const esc = (s) => s.replace(/[\\`*_[\]<~]/g, '\\$&');
/** A span with its marks; spaces at its ends stay outside the marks (Markdown needs that). */
function inline(sp, o) {
  if (isCode(sp)) {
    const fence = sp.text.includes('`') ? '``' : '`';
    return fence + (fence === '``' ? ' ' + sp.text + ' ' : sp.text) + fence;
  }
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(sp.text);
  let t = esc(m[2]);
  if (t) {
    if (sp.b && sp.i) t = `***${t}***`; else if (sp.b) t = `**${t}**`; else if (sp.i) t = `*${t}*`;
    if (sp.s) t = `~~${t}~~`;
    if (sp.u && o.underline !== false && !sp.link) t = `__${t}__`;
  }
  return m[1] + t + m[3];
}
/** A paragraph's Markdown text: spans, with each run of linked spans written as one [text](address). */
export function paraMd(p, o = {}) {
  const sp = spans(p.runs), out = [];
  for (let i = 0; i < sp.length; i++) {
    if (!sp[i].link) { out.push(inline(sp[i], o)); continue; }
    let j = i, body = '';
    while (j < sp.length && sp[j].link === sp[i].link) body += inline(sp[j++], o);
    out.push(`[${body.trim() || esc(sp[i].link)}](${sp[i].link.replace(/[()\s]/g, encodeURIComponent)})`);
    i = j - 1;
  }
  return out.join('').replace(/\t/g, ' ').replace(/\n/g, '  \n');
}
/** A line that would start a heading, quote or list is escaped so it stays a paragraph. */
const guard = (s) => s.replace(/^(\s*)([#>+-]|\d+(?=[.)]\s))/, (m, a, b) => (/^\d/.test(b) ? `${a}${b}\\` : `${a}\\${b}`));

function cellText(cell, o) {
  return (cell.blocks || []).flatMap((b) => (b.type === 'p' ? [paraMd(b, o)] : b.type === 'table' ? b.rows.flatMap((r) => r.cells.map((c) => cellText(c, o))) : []))
    .filter((t) => t.trim()).join('<br>').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}
/** A table as a pipe table: one cell per grid column (a spanned or merged cell leaves the next ones empty). */
export function tableMd(t, o = {}) {
  const rows = t.rows.map((r) => {
    const cells = [];
    for (const c of r.cells) {
      cells.push(c.vmerge === 'continue' ? '' : cellText(c, o));
      for (let k = 1; k < (c.span || 1); k++) cells.push('');
    }
    return cells;
  });
  const n = Math.max(1, ...rows.map((r) => r.length));
  const line = (cells) => '| ' + Array.from({ length: n }, (_, i) => cells[i] || ' ').join(' | ') + ' |';
  return [line(rows[0] || []), '|' + ' --- |'.repeat(n), ...rows.slice(1).map(line)].join('\n');
}

const ordered = (doc, id) => ((doc.lists && doc.lists[id] && doc.lists[id].kind) || (id === 'num' ? 'number' : 'bullet')) !== 'bullet';

export function toMarkdown(doc, o = {}) {
  const out = [];
  let prevList = null, code = null;
  const counters = new Map();   // `${list id}:${level}` → the number of the next item
  const push = (text, isList = false) => {
    if (out.length && !(isList && prevList)) out.push('');
    out.push(text);
  };
  const endCode = () => { if (code) { push('```\n' + code.join('\n') + '\n```'); code = null; } };
  for (const b of doc.blocks || []) {
    if (b.type === 'p' && b.style === 'Code') { (code = code || []).push(spans(b.runs).map((s) => s.text).join('')); prevList = null; continue; }
    endCode();
    if (b.type === 'table') { push(tableMd(b, o)); prevList = null; counters.clear(); continue; }
    if (b.type !== 'p') continue;
    const body = paraMd(b, o), list = b.props && b.props.list;
    if (!body.trim()) { if (!list) { prevList = null; counters.clear(); } continue; }
    if (list) {
      const lvl = Math.max(0, Math.min(8, list.lvl || 0)), k = `${list.id}:${lvl}`;
      for (const c of [...counters.keys()]) if (Number(c.split(':')[1]) > lvl) counters.delete(c);   // a new parent item restarts its children
      if (prevList && prevList.id !== list.id && !lvl) { prevList = null; counters.clear(); }
      const n = counters.get(k) || 1;
      counters.set(k, n + 1);
      push('    '.repeat(lvl) + (ordered(doc, list.id) ? `${n}. ` : '- ') + body, true);
      prevList = list;
      continue;
    }
    prevList = null; counters.clear();
    const head = HEAD[b.style];
    push(head ? head + body.replace(/ {2}\n/g, ' ') : (b.style === 'Quote' ? '> ' + body.replace(/\n/g, '\n> ') : guard(body)));
  }
  endCode();
  return out.join('\n') + '\n';
}
