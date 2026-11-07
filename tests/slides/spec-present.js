/* Slop Slides: Present mode. Arrow, Page, Space and Enter keys advance; Left and Up go back; Home and End jump;
   hidden slides are skipped; B blacks the screen; editing is off while the show runs; Escape returns to the
   slide you were on. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  let w;

  describe('present mode', () => {
    it('starts on the current slide, full screen, with the show overlay', async () => {
      w = await ST.open('../../slides/');
      w.SS.ops.newSlide();
      w.SS.ops.newSlide();
      w.SS.app.go(1);
      w.SS.present.start();
      expect(w.SS.present.on).toBe(true);
      expect(w.SS.app.mode).toBe('present');
      expect(w.SS.present.current()).toBe(1);
      expect(w.document.querySelector('.present')).toBeTruthy();
    });
    it('ArrowRight, Space and PageDown advance; ArrowLeft and Backspace go back; clamped at the ends', async () => {
      ST.key(w, 'ArrowRight');
      expect(w.SS.present.current()).toBe(2);
      ST.key(w, 'ArrowRight');
      expect(w.SS.present.current()).toBe(2);
      ST.key(w, ' ');
      expect(w.SS.present.current()).toBe(2);
      ST.key(w, 'ArrowLeft');
      expect(w.SS.present.current()).toBe(1);
      ST.key(w, 'Backspace');
      expect(w.SS.present.current()).toBe(0);
      ST.key(w, 'PageDown');
      expect(w.SS.present.current()).toBe(1);
      ST.key(w, 'Enter');
      expect(w.SS.present.current()).toBe(2);
      ST.key(w, 'PageUp');
      expect(w.SS.present.current()).toBe(1);
    });
    it('Home and End jump to the first and last slide', async () => {
      ST.key(w, 'End');
      expect(w.SS.present.current()).toBe(2);
      ST.key(w, 'Home');
      expect(w.SS.present.current()).toBe(0);
    });
    it('B blacks the screen out and back', async () => {
      ST.key(w, 'b');
      expect(w.document.querySelector('.present').classList.contains('black')).toBe(true);
      ST.key(w, 'b');
      expect(w.document.querySelector('.present').classList.contains('black')).toBe(false);
    });
    it('editing keys do nothing while the show runs', async () => {
      const n = w.SS.app.deck.slides[0].objects.length;
      ST.key(w, 'Delete');
      ST.key(w, 'Backspace', {});
      ST.ctrl(w, 'z');
      ST.ctrl(w, 'd');
      expect(w.SS.app.deck.slides[0].objects.length).toBe(n);
      expect(w.SS.app.mode).toBe('present');
    });
    it('Escape ends the show on the slide that was on screen', async () => {
      ST.key(w, 'ArrowRight');
      ST.key(w, 'Escape');
      expect(w.SS.present.on).toBe(false);
      expect(w.SS.app.mode).toBe('edit');
      expect(w.document.querySelector('.present')).toBe(null);
      expect(w.SS.app.idx).toBe(1);
    });
    it('hidden slides are skipped by the show', async () => {
      w.SS.app.go(0);
      w.SS.ops.setHidden(true);
      w.SS.app.go(0);
      w.SS.app.go(1);
      w.SS.present.start();
      expect(w.SS.present.list).toEqual([1, 2]);
      expect(w.SS.present.current()).toBe(1);
      ST.key(w, 'ArrowRight');
      expect(w.SS.present.current()).toBe(2);
      ST.key(w, 'Escape');
    });
    it('a click advances, and a click on the left third goes back', async () => {
      w.SS.app.go(0);
      w.SS.app.go(0);
      w.SS.present.start();
      const root = w.document.querySelector('.present');
      root.dispatchEvent(new w.MouseEvent('click', { clientX: w.innerWidth * 0.6, bubbles: true }));
      expect(w.SS.present.n).toBe(1);
      root.dispatchEvent(new w.MouseEvent('click', { clientX: 5, bubbles: true }));
      expect(w.SS.present.n).toBe(0);
      ST.key(w, 'Escape');
      expect(w.SS.present.on).toBe(false);
    });
    it('the Present button and F5 start the show', async () => {
      w.document.getElementById('btnPresent').click();
      expect(w.SS.present.on).toBe(true);
      ST.key(w, 'Escape');
      ST.key(w, 'F5');
      expect(w.SS.present.on).toBe(true);
      ST.key(w, 'Escape');
      expect(w.SS.present.on).toBe(false);
      ST.close(w);
    });
  });
})();
