/* Slop Docs — model/outline: the document outline, read from the real heading structure. Pure functions over the
 * body blocks: no DOM and no state. A heading is a paragraph whose style is Heading 1, 2 or 3 (styles.js headingLevel).
 * The outline shows those three levels as a tree: H2 nests under the H1 above it, H3 under the H2 above it. A heading
 * owns the blocks after it up to the next heading of the same or a higher level, so a section is always a run of blocks.
 * Every change returns new blocks (copy-on-write, like ops.js) and is committed by ui/outline-actions.js. */
import { paraText, para } from './doc.js';
import { headingLevel } from './styles.js';
import { replaceText, marksAt } from './ops.js';

export const OUT_MAX = 3;
const isP = (b) => !!b && b.type === 'p';
const setAt = (arr, i, v) => { const out = arr.slice(); out[i] = v; return out; };

/** Heading level 1 to 6 of a block, 0 when it is not a heading. */
export const levelOf = (b) => (isP(b) ? headingLevel(b.style) : 0);
/** Whether a block is an outline entry (Heading 1 to 3). */
export const listed = (b) => { const L = levelOf(b); return L >= 1 && L <= OUT_MAX; };
/** The heading's text on one line (objects dropped). */
export const headingText = (b) => paraText(b).replace(/￼/g, '').replace(/\s+/g, ' ').trim();

/** The outline as a tree: [{ b, id, level, text, children }], b the block index. */
export function buildTree(blocks) {
  const roots = [], stack = [];
  blocks.forEach((blk, b) => {
    if (!listed(blk)) return;
    const node = { b, id: blk.id, level: levelOf(blk), text: headingText(blk), children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  });
  return roots;
}
/** Every node in document order. */
export function allNodes(tree) {
  const out = [];
  const walk = (ns) => ns.forEach((n) => { out.push(n); walk(n.children); });
  walk(tree);
  return out;
}
/** The nodes from the top of the tree down to the node at block b, or null. */
export function pathTo(tree, b) {
  const walk = (ns, path) => {
    for (const n of ns) {
      const p = path.concat(n);
      if (n.b === b) return p;
      const r = walk(n.children, p);
      if (r) return r;
    }
    return null;
  };
  return walk(tree, []);
}
/** Rows as drawn: [{ node, depth, hasKids, open }] in order, without the children of collapsed nodes. */
export function visibleRows(tree, collapsed = new Set()) {
  const rows = [];
  const walk = (ns, depth) => ns.forEach((n) => {
    const open = !collapsed.has(n.id);
    rows.push({ node: n, depth, hasKids: n.children.length > 0, open });
    if (open) walk(n.children, depth + 1);
  });
  walk(tree, 0);
  return rows;
}

/** The end of the section that heading b starts: the next heading of the same or a higher level, or the body's end. */
export function sectionEnd(blocks, b) {
  const L = levelOf(blocks[b]);
  let e = b + 1;
  while (e < blocks.length && !(levelOf(blocks[e]) >= 1 && levelOf(blocks[e]) <= L)) e++;
  return e;
}
/** How many blocks sit under the heading at b (its content, sub-sections included). */
export const sectionSize = (blocks, b) => sectionEnd(blocks, b) - b - 1;
/** The outline heading that owns block b (the nearest listed heading at or before it), or -1. */
export function headingAt(blocks, b) {
  for (let i = Math.min(b, blocks.length - 1); i >= 0; i--) if (listed(blocks[i])) return i;
  return -1;
}

/** Move the section at b up (dir -1) or down (1) past its sibling of the same level. Returns { blocks, start } with
 * start the section's new index, or null when there is no sibling in that direction (a higher heading or the end). */
export function moveSection(blocks, b, dir) {
  if (!listed(blocks[b])) return null;
  const L = levelOf(blocks[b]), end = sectionEnd(blocks, b);
  let aS, aE, bS, bE;
  if (dir > 0) {
    if (end >= blocks.length || levelOf(blocks[end]) !== L) return null;
    aS = b; aE = end; bS = end; bE = sectionEnd(blocks, end);
  } else {
    let p = b - 1;
    while (p >= 0 && !(levelOf(blocks[p]) >= 1 && levelOf(blocks[p]) <= L)) p--;
    if (p < 0 || levelOf(blocks[p]) !== L) return null;
    aS = p; aE = b; bS = b; bE = end;
  }
  const out = [...blocks.slice(0, aS), ...blocks.slice(bS, bE), ...blocks.slice(aS, aE), ...blocks.slice(bE)];
  return { blocks: out, start: dir > 0 ? aS + (bE - bS) : aS };
}

/** Demote (delta 1) or promote (-1) a listed heading within Heading 1 to 3. Null when it would leave that range. */
export function changeLevel(blocks, b, delta) {
  if (!listed(blocks[b])) return null;
  const N = levelOf(blocks[b]) + delta;
  if (N < 1 || N > OUT_MAX) return null;
  return setAt(blocks, b, { ...blocks[b], style: 'H' + N });
}

/** A paragraph index at or after b (else before it) to hold the caret. */
function paraNear(blocks, b) {
  const i = Math.min(b, blocks.length - 1);
  for (let k = i; k < blocks.length; k++) if (isP(blocks[k])) return k;
  for (let k = i; k >= 0; k--) if (isP(blocks[k])) return k;
  return 0;
}

/** Add a Heading 1 at paragraph b: an empty paragraph becomes one, otherwise a new one follows it. Returns { blocks, b }
 * with b the heading's index. */
export function addSection(blocks, b, text = 'New section') {
  const cur = blocks[b];
  if (isP(cur) && !paraText(cur)) {
    const props = { ...(cur.props || {}) };
    delete props.list;
    return { blocks: setAt(blocks, b, { ...cur, style: 'H1', props }), b };
  }
  const out = blocks.slice();
  out.splice(b + 1, 0, para(text, 'H1'));
  return { blocks: out, b: b + 1 };
}

/** Remove the heading at b. withContent also removes the section's blocks; otherwise only the heading line goes.
 * Returns { blocks, b }, b a paragraph index for the caret. */
export function deleteSection(blocks, b, withContent) {
  const end = withContent ? sectionEnd(blocks, b) : b + 1;
  let out = blocks.slice(0, b).concat(blocks.slice(end));
  if (!out.length || !isP(out[out.length - 1])) out = out.concat(para());
  return { blocks: out, b: paraNear(out, b) };
}

/** Replace a heading's text. The new text takes the look of the heading's first run. */
export function renameSection(blocks, b, text) {
  const p = blocks[b];
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return replaceText(blocks, { a: { b, o: 0 }, f: { b, o: paraText(p).length } }, clean, marksAt(p, 0)).blocks;
}
