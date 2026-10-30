/* Reel Remix drop feedback (in the app's iframe, through shared/drop): a drag over the window labels the drop zone,
   a dropped picture shows a progress entry and then the new clip in the bin, a refused file is named in the toast, and
   the drop zone keeps its Choose files button. The drops are simulated with a DataTransfer. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const frame = () => document.getElementById('app');
  const win = () => frame().contentWindow;
  const doc = () => win().document;
  const RM = () => win().RM;
  const $ = (id) => doc().getElementById(id);

  async function ready() { await waitFor(() => win() && win().RM && win().RM.ready, { timeout: 20000 }); }
  let seq = 0;
  /** A PNG the app can decode, named by the caller. */
  async function picture(name) {
    const c = doc().createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + ((seq++ * 83) % 360) + ' 70% 45%)'; g.fillRect(0, 0, 320, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new (win().File)([blob], name, { type: 'image/png' });
  }
  const ev = (name, dt, el) => el.dispatchEvent(new (win().DragEvent)(name, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 0, clientY: 0 }));
  const dataTransfer = (files) => {
    const dt = new (win().DataTransfer)();
    for (const f of files) dt.items.add(f);
    return dt;
  };
  const rows = () => Array.from(doc().querySelectorAll('#rm-drop .sd-row'));
  const binNames = () => Array.from(doc().querySelectorAll('#rm-bin .rm-name')).map((el) => el.textContent);
  const toast = () => { const t = doc().querySelector('.sd-toast'); return t ? t.textContent : ''; };

  describe('reel remix: drop feedback', () => {
    it('the drop zone has a Choose files button and its message, before anything is dropped', async () => {
      await ready();
      expect(doc().querySelector('#rm-drop .sd-msg').textContent).toBe('Drop files here or choose files');
      expect(doc().querySelector('#rm-drop .sd-choose').tagName).toBe('BUTTON');
      expect(doc().querySelectorAll('#rm-drop .sd-row').length).toBe(0);
    });

    it('a file drag over the window outlines the bin and the stage, and labels the bin "Drop to add N files"', async () => {
      await ready();
      const dt = dataTransfer([await picture('one.png'), await picture('two.png')]);
      ev('dragenter', dt, $('rm-canvas'));
      const hints = Array.from(doc().querySelectorAll('.sd-hint'));
      expect(hints.length).toBe(2);
      expect(hints[0].querySelector('b').textContent).toBe('Drop to add 2 files');
      ev('dragleave', dt, $('rm-canvas'));
      expect(doc().querySelectorAll('.sd-hint').length).toBe(0);
    });

    it('a dropped picture on the stage shows a progress entry, then the new clip in the bin, and is scrolled into view', async () => {
      await ready();
      const before = RM().state.items.length;
      const dt = dataTransfer([await picture('stage-drop.png')]);
      ev('dragenter', dt, $('rm-canvas'));
      ev('dragover', dt, $('rm-canvas'));
      ev('drop', dt, $('rm-canvas'));
      // the progress entry for the file is listed in the drop zone, with its name
      await waitFor(() => rows().some((r) => r.querySelector('.sd-name').textContent === 'stage-drop.png'), { timeout: 20000 });
      // then the clip is in the bin, and the drop zone says it is ready
      await waitFor(() => RM().state.items.length >= before + 1, { timeout: 20000 });
      expect(RM().state.items.length).toBe(before + 1);
      await waitFor(() => binNames().some((n) => n.indexOf('stage-drop.png') >= 0), { timeout: 5000 });
      const row = rows().find((r) => r.querySelector('.sd-name').textContent === 'stage-drop.png');
      expect(row.classList.contains('ready')).toBe(true);
      expect(row.querySelector('.sd-msg-row').textContent).toBe('Ready');
      expect(toast()).toBe('Added 1 file');
      const li = doc().querySelector('#rm-bin li[data-id="' + RM().state.items[RM().state.items.length - 1].id + '"]');
      expect(!!li).toBe(true);
      expect(li.classList.contains('sd-flash')).toBe(true);
      expect(doc().querySelector('.sd-hint')).toBe(null);
    });

    it('a dropped text file is refused and the toast says why; the picture beside it is still added', async () => {
      await ready();
      const before = RM().state.items.length;
      const notes = new (win().File)(['hello'], 'notes.txt', { type: 'text/plain' });
      const dt = dataTransfer([notes, await picture('beside.png')]);
      ev('drop', dt, $('rm-bin'));
      await waitFor(() => toast() === 'Added 1 file, 1 skipped: notes.txt is not a picture or video', { timeout: 20000 });
      expect(toast()).toBe('Added 1 file, 1 skipped: notes.txt is not a picture or video');
      expect(RM().state.items.length).toBe(before + 1);
      const refused = rows().find((r) => r.querySelector('.sd-name').textContent === 'notes.txt');
      expect(refused.classList.contains('error')).toBe(true);
      expect(refused.querySelector('.sd-msg-row').textContent).toBe('notes.txt is not a picture or video');
    });

    it('a drop outside the bin and the stage is not taken, and the toast says where to drop', async () => {
      await ready();
      const before = RM().state.items.length;
      const dt = dataTransfer([await picture('nowhere.png')]);
      ev('drop', dt, doc().querySelector('.rm-top'));
      await waitFor(() => toast() === 'Drop files on the highlighted area', { timeout: 5000 });
      expect(RM().state.items.length).toBe(before);
    });
  });
})();
