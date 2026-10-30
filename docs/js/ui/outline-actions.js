/* Slop Docs — ui/outline-actions: what the outline does to the document: go to a heading, add, rename, move,
 * promote, demote and delete sections. Each works on the blocks from model/outline.js and commits through
 * SlopDocs.edit, so one action is one undo step. ES module, used by ui/outline.js and ui/outline-menu.js. */
import * as M from '../model/outline.js';
import { paraText } from '../model/doc.js';

const S = window.SlopDocs;
const t = (k, v) => S.t(k, v);
const at = (b, o = 0) => ({ b, o });
const toast = (m) => window.SlopUI && SlopUI.toast(m);
const focus = () => { if (S.focusIme) S.focusIme(); };
const commit = (blocks, sel) => S.edit(blocks, sel, 'outline');

/** Put the caret at the start of block b and scroll so its line sits near the top of the page area. */
export function goTo(b) {
  if (!S.doc || !S.doc.blocks[b]) return;
  S.select(at(b), at(b));
  const c = document.querySelector('.caret'), stage = document.getElementById('stage');
  if (c && stage) stage.scrollTop += c.getBoundingClientRect().top - stage.getBoundingClientRect().top - 60;
  focus();
}

/** Move the section at block b one place up (dir -1) or down (1). The caret moves with it when it was inside. */
export function move(b, dir) {
  const blocks = S.doc.blocks, res = M.moveSection(blocks, b, dir);
  if (!res) { toast(t(dir < 0 ? 'docs.ol.first' : 'docs.ol.last')); return false; }
  const end = M.sectionEnd(blocks, b), sel = S.sel;
  const inside = sel.f.b >= b && sel.f.b < end;
  const f = inside ? at(res.start + sel.f.b - b, sel.f.o) : at(res.start);
  commit(res.blocks, { a: f, f });
  return true;
}

/** Add a Heading 1 at the caret (see model addSection), with its text selected so that typing replaces it. */
export function add() {
  if (!S.doc) return;
  const r = M.addSection(S.doc.blocks, S.sel.f.b);
  const n = paraText(r.blocks[r.b]).length;
  commit(r.blocks, { a: at(r.b), f: at(r.b, n) });
  focus();
}

/** Demote (delta 1) or promote (-1) the heading at b. */
export function level(b, delta) {
  const blocks = M.changeLevel(S.doc.blocks, b, delta);
  if (!blocks) { toast(t(delta > 0 ? 'docs.ol.lowest' : 'docs.ol.top')); return; }
  commit(blocks, S.sel);
}

/** Rename the heading at b in a SlopUI prompt. */
export async function rename(b) {
  const cur = M.headingText(S.doc.blocks[b]);
  const v = await SlopUI.prompt(t('docs.ol.rename_title'), t('docs.ol.rename_label'), cur, { ok: t('ui.rename') });
  const name = v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  if (!name || name === cur) return;
  const clamp = (p) => (p.b === b ? at(b, Math.min(p.o, name.length)) : p);
  commit(M.renameSection(S.doc.blocks, b, name), { a: clamp(S.sel.a), f: clamp(S.sel.f) });
  focus();
}

/** Delete the heading at b. A section with content asks first: the heading line only, or the heading and its content. */
export async function remove(b) {
  const blocks = S.doc.blocks, n = M.sectionSize(blocks, b);
  let withContent = false;
  if (n > 0) {
    let choice = null;
    await new Promise((done) => SlopUI.dialog({
      title: t('docs.ol.delete'),
      body: t('docs.ol.delete_body', { name: M.headingText(blocks[b]) || t('docs.ol.untitled_heading'), n }),
      buttons: [
        { label: t('menu.cancel') },
        { label: t('docs.ol.heading_only'), primary: true, act: () => { choice = 'line'; } },
        { label: t('docs.ol.heading_content'), danger: true, act: () => { choice = 'all'; } },
      ],
      onClose: () => done(),
    }));
    if (!choice) { focus(); return; }
    withContent = choice === 'all';
  }
  const r = M.deleteSection(S.doc.blocks, b, withContent);
  commit(r.blocks, { a: at(r.b), f: at(r.b) });
  focus();
}
