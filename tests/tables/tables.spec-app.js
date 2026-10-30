/* Slop Tables: boot, the grid, typing and formulas, selection, styles, undo, freeze panes, sheets. */
(function () {
  'use strict';
  const { describe, it, expect, sleep } = SlopTest;
  const T = () => TB.T, doc = () => TB.doc;

  describe('boot', () => {
    it('starts a blank workbook named Untitled spreadsheet', async () => {
      await TB.boot();
      expect(T().ready).toBe(true);
      expect(T().wb.sheets.length).toBe(1);
      expect(T().S.file.name).toBe('Untitled spreadsheet');
      expect(T().S.file.driveId).toBe(null);
    });
    it('renders the grid, the name box and the sheet tab', () => {
      T().flush();
      expect(doc().getElementById('namebox').value).toBe('A1');
      expect(doc().querySelectorAll('.ch').length).toBeGreaterThan(5);
      expect(doc().querySelectorAll('.rh').length).toBeGreaterThan(5);
      expect(doc().querySelectorAll('.tab:not(.tab-add)').length).toBe(1);
      expect(doc().getElementById('saveState').textContent).toBe('Not saved yet');
    });
    it('opens the File menu from the top bar', () => {
      const b = [...doc().querySelectorAll('.menu-b')].find((x) => x.textContent === 'File');
      expect(b).toBeTruthy();
      b.click();
      const labels = [...doc().querySelectorAll('.sui-menu .sui-lbl')].map((x) => x.textContent);
      TB.win.SlopUI.closeMenu();
      expect(labels).toContain('Save');
      expect(labels).toContain('New workbook');
    });
  });

  describe('formulas and values', () => {
    it('enters a value and a formula and shows the computed result', () => {
      T().type('A1', '4');
      T().type('A2', '=A1*2+1');
      expect(T().value('A2')).toBe(9);
      T().flush();
      expect(TB.T.text('A2')).toBe('9');
      expect(TB.T.el('A2').classList.contains('a-r')).toBeTruthy();
    });
    it('recalculates dependents when an input changes', () => {
      T().type('A3', '=SUM(A1:A2)');
      expect(T().value('A3')).toBe(13);
      T().setCell('A1', '10');
      expect(T().value('A2')).toBe(21);
      expect(T().value('A3')).toBe(31);
    });
    it('shows engine errors', () => {
      T().type('B1', '=1/0');
      T().flush();
      expect(TB.T.text('B1')).toBe('#DIV/0!');
      expect(TB.T.el('B1').classList.contains('err')).toBeTruthy();
    });
    it('the formula bar shows the formula of the active cell', () => {
      T().select('A2');
      T().flush();
      expect(doc().getElementById('fx').value).toBe('=A1*2+1');
      expect(doc().getElementById('namebox').value).toBe('A2');
    });
    it('keeps text that looks like a number as text', () => {
      T().type('C1', "'007");
      expect(T().value('C1')).toBe('007');
      T().select('C1');
      T().flush();
      expect(doc().getElementById('fx').value).toBe("'007");
    });
  });

  describe('keyboard editing', () => {
    it('typing starts an edit, Enter commits and moves down', () => {
      T().select('D1');
      TB.key('x');
      expect(T().editing()).toBeTruthy();
      expect(doc().getElementById('editor').value).toBe('x');
      TB.key('Enter', { on: doc().getElementById('editor') });
      expect(T().editing()).toBeFalsy();
      expect(T().value('D1')).toBe('x');
      expect(T().S.sel.r).toBe(1);
    });
    it('Tab commits and moves right', () => {
      T().select('D2');
      TB.key('y');
      TB.key('Tab', { on: doc().getElementById('editor') });
      expect(T().value('D2')).toBe('y');
      expect(T().S.sel.c).toBe(4);
    });
    it('Escape cancels an edit', () => {
      T().select('E1');
      TB.key('z');
      TB.key('Escape', { on: doc().getElementById('editor') });
      expect(T().editing()).toBeFalsy();
      expect(T().value('E1')).toBe(null);
    });
    it('F2 keeps the text and puts the caret at the end', () => {
      T().select('A2');
      TB.key('F2');
      const ed = doc().getElementById('editor');
      expect(ed.value).toBe('=A1*2+1');
      TB.key('Escape', { on: ed });
    });
    it('arrow keys move the active cell and Ctrl+arrow jumps to the edge of the data', () => {
      T().select('A1');
      TB.key('ArrowRight');
      expect(T().S.sel.c).toBe(1);
      TB.key('ArrowRight', { ctrl: true });
      expect(T().S.sel.c).toBe(3);
      TB.key('ArrowLeft', { shift: true });
      expect(T().S.sel.er).toBe(0);
      expect(T().S.sel.ec).toBe(2);
    });
    it('Delete clears the selection', () => {
      T().select('D1');
      TB.key('Delete');
      expect(T().value('D1')).toBe(null);
    });
  });

  describe('styles, number formats and undo', () => {
    it('bold on the active cell, and undo removes it', () => {
      T().select('A1');
      TB.key('b', { ctrl: true });
      T().flush();
      expect(TB.T.el('A1').classList.contains('b')).toBeTruthy();
      T().undo();
      T().flush();
      expect(TB.T.el('A1').classList.contains('b')).toBeFalsy();
      T().redo();
      T().flush();
      expect(TB.T.el('A1').classList.contains('b')).toBeTruthy();
    });
    it('italic via the toolbar button', () => {
      T().select('A1');
      doc().getElementById('btnItalic').click();
      T().flush();
      expect(TB.T.el('A1').classList.contains('i')).toBeTruthy();
    });
    it('number format from the toolbar uses the engine formats', () => {
      T().setCell('F1', '0.25');
      T().select('F1');
      const nf = doc().getElementById('nf');
      nf.value = '0.00%';
      nf.dispatchEvent(new Event('change'));
      T().flush();
      expect(TB.T.text('F1')).toBe('25.00%');
    });
    it('a typed currency or percent sets its number format', () => {
      T().type('F2', '12.5%');
      expect(T().value('F2')).toBe(0.125);
      T().flush();
      expect(TB.T.text('F2')).toBe('12.50%');
    });
  });

  describe('layout', () => {
    it('column width changes the cell box', () => {
      T().sheet.colProp(0).w = 240;
      T().flush();
      expect(TB.T.el('A1').style.width).toBe('240px');
      T().sheet.colProp(0).w = 100;
    });
    it('only the visible cells are in the DOM', () => {
      T().wb.batch(() => { for (let r = 0; r < 3000; r++) T().wb.setValue(T().sheet, r, 6, r); });
      T().flush();
      const n = doc().querySelectorAll('#cells .cell').length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(200);
    });
    it('scrolling brings far rows into the DOM and drops the top ones', async () => {
      const vp = doc().getElementById('vp');
      vp.scrollTop = 2590 * 22;
      await sleep(40);
      T().flush();
      expect(doc().querySelector('#cells [data-rc="2600,6"]')).toBeTruthy();
      expect(doc().querySelector('#cells [data-rc="0,6"]')).toBe(null);
      vp.scrollTop = 0;
      await sleep(40);
      T().flush();
    });
    it('freeze panes keep the frozen row and column in place while scrolling', async () => {
      T().sheet.freeze = { r: 1, c: 1 };
      T().wb.setValue(T().sheet, 0, 0, 'top-left');
      T().flush();
      const vp = doc().getElementById('vp');
      vp.scrollTop = 400;
      await sleep(40);
      T().flush();
      const d = doc().querySelector('#cells [data-rc="0,0"]');
      expect(d).toBeTruthy();
      expect(d.style.top).toBe('0px');
      expect(d.style.left).toBe('0px');
      vp.scrollTop = 0;
      T().sheet.freeze = { r: 0, c: 0 };
      T().flush();
    });
  });

  describe('sheets', () => {
    it('adds a sheet and switches to it', () => {
      T().addSheet();
      T().flush();
      expect(T().wb.sheets.length).toBe(2);
      expect(T().S.si).toBe(1);
      expect(doc().querySelectorAll('.tab:not(.tab-add)').length).toBe(2);
      T().undo();
      expect(T().wb.sheets.length).toBe(1);
    });
  });
})();
