/* Slop PDF find and text selection: the find bar (Ctrl+F) counts matches across pages, Next and Previous step through
   them with Enter and Shift+Enter, Match case and Whole word change the count, the highlights sit on every match
   (the current one stronger), and the page's text layer gives a real selection that returns the expected string. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;

  const doc = () => PT.win.document;
  const label = () => doc().querySelector('.find-count').textContent;
  const rects = () => doc().querySelectorAll('.pv-hits rect').length;
  const cur = () => doc().querySelectorAll('.pv-hits rect.cur').length;
  const input = () => doc().querySelector('.find-input');
  const type = async (s) => { input().value = s; input().dispatchEvent(new PT.win.Event('input', { bubbles: true })); await sleep(450); };
  const key = (k, init = {}) => { const el = input(); el.dispatchEvent(new PT.win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init))); return sleep(250); };
  const toggle = async (label2) => { doc().querySelector('.find-opt[aria-label="' + label2 + '"]').click(); await sleep(450); };

  async function openFind(texts) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    const pages = texts.map((t) => ({ text: t, w: 300, h: 200 }));
    await PT.open(await PT.makePdf(pages), 'find.pdf');
    PT.A.openPage(PT.E.state.pages[0].id);
    await waitFor(() => doc().querySelector('.pv-textlayer span'), { timeout: 8000 });
    doc().dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    await sleep(120);
    return input();
  }

  describe('Slop PDF find', () => {
    it('Ctrl+F opens the bar; the count runs across pages and Enter and Shift+Enter step through the matches', async () => {
      const el = await openFind(['apple pie apple', 'Apple tart', 'pineapple']);
      expect(doc().activeElement === el).toBe(true);
      expect(doc().querySelector('.find-bar').hidden).toBe(false);
      await type('apple');
      expect(label()).toBe('1 of 4');
      expect(rects()).toBe(4);
      expect(cur()).toBe(1);
      await key('Enter');
      expect(label()).toBe('2 of 4');
      await key('Enter'); await key('Enter');
      expect(label()).toBe('4 of 4');
      await key('Enter');
      expect(label()).toBe('1 of 4', 'Next wraps to the first match');
      await key('Enter', { shiftKey: true });
      expect(label()).toBe('4 of 4', 'Previous wraps to the last match');
    });

    it('Whole word and Match case change the count; the highlights follow', async () => {
      await openFind(['apple pie apple', 'Apple tart', 'pineapple']);
      await type('apple');
      await toggle('Whole word');
      expect(label()).toBe('1 of 3');
      expect(rects()).toBe(3);
      await toggle('Match case');
      expect(label()).toBe('1 of 2', 'lower-case apple only: the two on page 1');
      await type('Apple');
      expect(label()).toBe('1 of 1');
      await type('zebra');
      expect(label()).toBe('No results');
      expect(rects()).toBe(0);
    });

    it('a page text layer gives a real selection that returns the selected string', async () => {
      await openFind(['apple pie apple', 'Apple tart', 'pineapple']);
      await type('zzz');
      doc().querySelector('.find-bar').hidden = true;
      const span = [...doc().querySelectorAll('.pv-textlayer span')].find((s) => s.textContent === 'apple pie apple');
      expect(!!span).toBe(true);
      const sel = PT.win.getSelection();
      sel.removeAllRanges();
      const r = doc().createRange(); r.selectNodeContents(span); sel.addRange(r);
      expect(sel.toString()).toBe('apple pie apple');
      sel.removeAllRanges();
    });
  });
})();
