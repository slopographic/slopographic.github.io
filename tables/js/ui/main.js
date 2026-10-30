/* Slop Tables: boot. Wires the grid, keyboard, mouse, editor, toolbar, menus and storage together, and
   exposes window.SlopTables (used by the tests and by the console). */
import { S, $, setPainter, on, redraw, sheet } from './state.js';
import { restorePlace } from './view-state.js';
import * as grid from './grid.js';
import * as pointer from './pointer.js';
import * as keys from './keys.js';
import * as editor from './editor.js';
import * as chrome from './chrome.js';
import * as cmd from './commands.js';
import * as F from './storage.js';
import { tabs } from './tabs.js';
import * as A from './actions.js';
import * as ctxmenu from './ctxmenu.js';
import * as TPL from './templates.js';
import * as sidebar from './sidebar.js';
import * as objects from './objects.js';
import { wireDrop } from './drop.js';
import { undo, redo, canUndo, canRedo } from './history.js';
import { moveTo } from './nav.js';
import { toCsv } from '../io/csv.js';
import { toXlsx } from '../io/xlsx.js';
import { toBlob } from '../io/native.js';
import { parseCell } from '../engine/refs.js';
import { onLang } from '../i18n.js';

const paint = () => { grid.render(); objects.render(); chrome.render(); sidebar.render(); };

function bindToolbar() {
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('btnBold').addEventListener('click', () => A.toggleStyle('b'));
  $('btnItalic').addEventListener('click', () => A.toggleStyle('i'));
  $('nf').addEventListener('change', (e) => A.setFormat(e.target.value));
  $('btnSave').addEventListener('click', () => F.save());
  const bar = $('menus');
  for (const name of Object.keys(cmd.menus())) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'menu-b'; b.dataset.menu = name; b.textContent = cmd.menuLabel(name);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = b.getBoundingClientRect();
      window.SlopUI.menu(cmd.menus()[name], r.left, r.bottom + 2);
    });
    bar.append(b);
  }
  onLang(() => { for (const b of bar.querySelectorAll('.menu-b')) b.textContent = cmd.menuLabel(b.dataset.menu); redraw(); });
}

function boot() {
  grid.init(); pointer.init(); keys.init(); editor.init(); chrome.init(); cmd.init(); A.bindClipboard(); ctxmenu.init(); sidebar.init(); objects.init(); wireDrop();
  setPainter(paint);
  $('vp').addEventListener('scroll', () => redraw());
  addEventListener('resize', () => redraw());
  bindToolbar();
  F.launch().then(() => restorePlace()).then(() => { if (window.SlopTables) window.SlopTables.ready = true; redraw(); });
  expose();
}

/* ---- test and console API (not used by the UI itself) ---- */
function expose() {
  const at = (ref) => { const p = parseCell(ref); if (!p) throw new Error('bad ref ' + ref); return p; };
  window.SlopTables = {
    S,
    get wb() { return S.wb; },
    get sheet() { return sheet(); },
    /** Type into a cell the way a user does: keys go to the grid, then Enter commits. */
    type(ref, text) {
      moveTo(at(ref).r, at(ref).c);
      const { r, c } = at(ref);
      S.sel = { r, c, er: r, ec: c };
      editor.startEdit(null);
      const ed = $('editor');
      ed.value = text;
      ed.dispatchEvent(new Event('input'));
      ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      grid.render();
    },
    setCell(ref, text) { const p = at(ref); S.wb.input(sheet(), p.r, p.c, text); redraw(); },
    value(ref) { const p = at(ref); return sheet().value(p.r, p.c); },
    /** Text of a rendered cell (null when it is not on screen). */
    text(ref) { const p = at(ref); const el = document.querySelector(`#cells [data-rc="${p.r},${p.c}"]`); return el ? el.textContent : null; },
    /** The rendered cell element, or null. */
    el(ref) { const p = at(ref); return document.querySelector(`#cells [data-rc="${p.r},${p.c}"]`); },
    select(ref) { const p = at(ref); S.sel = { r: p.r, c: p.c, er: p.r, ec: p.c }; grid.ensureVisible(p.r, p.c); redraw(); },
    addSheet: () => { cmd.run('sheet.add'); },
    flush: () => paint(),
    /** Writes the open tabs to this device now (the session of the strip). */
    flushTabs: () => tabs.flush(),
    tabs,
    command: (id) => cmd.run(id),
    undo, redo, canUndo, canRedo,
    save: () => F.save(),
    csv: () => toCsv(sheet()),
    xlsx: () => toXlsx(S.wb),
    native: () => toBlob(S.wb),
    editing: () => !!S.edit,
    templates: TPL,
    objects,
    /** Opens a File (or Blob with a name) the way a drop or File ▸ Open file does. */
    openFile: (file) => F.openFile(file),
  };
}

/** Convert… in the header (shared/convert/provided.js): the open workbook, as XLSX. */
addEventListener('slop:convert-files', (e) => e.detail.provide(async () => (S.wb ? [{ name: F.fileName('xlsx'), blob: await toXlsx(S.wb) }] : null)));

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else boot();
