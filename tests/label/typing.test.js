/* SlopLabel: typing in the Properties panel keeps focus and every character (a rebuild or a global
 * shortcut must not drop the field mid-word). Keys are dispatched the way a browser delivers them:
 * keydown, then the character is inserted at the caret, then input. */
(function () {
  const { describe, it, expect } = SlopTest;
  const frame = () => new Promise((r) => WIN.requestAnimationFrame(() => WIN.requestAnimationFrame(r)));
  function typeInto(el, text) {
    el.focus();
    const ctrlA = new WIN.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(ctrlA);
    if (!ctrlA.defaultPrevented) el.select(); // the browser's own Select all, which only selects this field's text
    for (const ch of text) {
      el.dispatchEvent(new WIN.KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      el.setRangeText(ch, el.selectionStart, el.selectionEnd, 'end');
      el.dispatchEvent(new WIN.Event('input', { bubbles: true }));
    }
  }
  describe('typing in the properties panel', () => {
    it('keeps focus and every character when a word is typed into the content field', async () => {
      const t = W.App.doc.objects.find((o) => o.type === 'text');
      W.showDock('props', false); W.select([t.id]); await frame();
      typeInto(W.$('pContent'), 'Hello');
      await frame();
      expect(W.objById(t.id).content).toBe('Hello');
      expect(W.document.activeElement).toBe(W.$('pContent'));
      expect(W.$('pContent').value).toBe('Hello');
      expect(W.App.sel).toEqual([t.id]); // Ctrl+A stayed in the field and did not select every object
    });
    it('keeps focus and every character when a word is typed into the name field', async () => {
      const t = W.App.doc.objects.find((o) => o.type === 'text');
      W.showDock('props', false); W.select([t.id]); await frame();
      const nameField = () => W.document.querySelector('#dockBody > .sec .row input[type="text"]:not(#pContent)');
      typeInto(nameField(), 'Price tag');
      await frame();
      expect(W.objById(t.id).name).toBe('Price tag');
      expect(W.document.activeElement).toBe(nameField());
      expect(nameField().value).toBe('Price tag');
    });
  });
})();
