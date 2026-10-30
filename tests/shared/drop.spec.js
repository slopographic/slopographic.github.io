/* SlopDrop (shared/drop) in the page itself: the zone and its Choose files button, a drop that adds some files and
   refuses others with a reason in the toast, a per-drop limit, progress on a row, the files hook, and window: false
   (a drop elsewhere on the page is left alone). The drops are simulated with a DataTransfer. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const zone = () => document.getElementById('zone');
  const other = () => document.getElementById('other');
  const rows = () => Array.from(zone().querySelectorAll('.sd-row'));
  const toast = () => { const t = document.querySelector('.sd-toast'); return t ? t.textContent : ''; };
  const ev = (name, dt, el) => el.dispatchEvent(new DragEvent(name, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 5, clientY: 5 }));
  const dt = (files) => { const d = new DataTransfer(); for (const f of files) d.items.add(f); return d; };
  const png = (name) => new File(['x'.repeat(40)], name, { type: 'image/png' });
  const text = (name) => new File(['hello'], name, { type: 'text/plain' });
  // Every module attached in a test is destroyed before the next one (their window listeners would still run).
  const live = [];
  const attach = (el, o) => { const h = SlopDrop.attach(el, o); live.push(h); return h; };
  const clear = () => {
    live.splice(0).forEach((h) => h.destroy());
    zone().replaceChildren();
    document.querySelectorAll('.sd-toast, .sd-hint').forEach((n) => n.remove());
  };
  const wait = (ms) => sleep(ms);

  describe('SlopDrop: the zone', () => {
    it('shows its message and a Choose files button, with an empty progress list', () => {
      clear();
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, process: async () => 'x' });
      expect(zone().querySelector('.sd-msg').textContent).toBe('Drop files here or choose files');
      expect(zone().querySelector('button.sd-choose').textContent).toBe('Choose files');
      expect(rows().length).toBe(0);
    });

    it('a drop adds the pictures, names the refused file in the toast, and reports the batch to done()', async () => {
      clear();
      const seen = [], done = [];
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, process: async (f) => { seen.push(f.name); return 'id-' + f.name; }, done: (s) => done.push(s), reveal: () => zone() });
      ev('drop', dt([png('a.png'), text('notes.txt'), png('b.png')]), zone());
      await waitFor(() => toast() !== '', { timeout: 5000 });
      expect(toast()).toBe('Added 2 files, 1 skipped: notes.txt is not a picture');
      expect(seen).toEqual(['a.png', 'b.png']);
      expect(done[0].added.length).toBe(2);
      expect(done[0].added[1].value).toBe('id-b.png');
      expect(rows().find((r) => r.querySelector('.sd-name').textContent === 'notes.txt').classList.contains('error')).toBe(true);
      expect(rows().filter((r) => r.classList.contains('ready')).length).toBe(2);
    });

    it('a reader error is a row with its message, and the batch carries on', async () => {
      clear();
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, process: async (f) => { if (f.name === 'bad.png') throw new Error('could not be decoded'); return 1; } });
      ev('drop', dt([png('bad.png'), png('good.png')]), zone());
      await waitFor(() => toast() !== '', { timeout: 5000 });
      expect(toast()).toBe('Added 1 file, 1 skipped: bad.png could not be decoded');
      const bad = rows().find((r) => r.querySelector('.sd-name').textContent === 'bad.png');
      expect(bad.querySelector('.sd-msg-row').textContent).toBe('bad.png could not be decoded');
    });

    it('limit: 1 takes the first file and refuses the rest with a reason', async () => {
      clear();
      const seen = [];
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, limit: 1, process: async (f) => { seen.push(f.name); return f.name; } });
      ev('drop', dt([png('one.png'), png('two.png')]), zone());
      await waitFor(() => toast() !== '', { timeout: 5000 });
      expect(seen).toEqual(['one.png']);
      expect(toast()).toBe('Added 1 file, 1 skipped: two.png is not taken: only one file at a time');
    });

    it('progress: a row shows the bar at the reported share while reading, then Ready', async () => {
      clear();
      let report = null, finish = null;
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, process: (f, progress) => { report = progress; return new Promise((res) => { finish = res; }); } });
      ev('drop', dt([png('slow.png')]), zone());
      await waitFor(() => rows().length === 1, { timeout: 5000 });
      expect(rows()[0].classList.contains('reading')).toBe(true);
      report(0.5);
      expect(rows()[0].querySelector('.sd-bar i').style.width).toBe('50%');
      finish('ok');
      await waitFor(() => rows()[0].classList.contains('ready'), { timeout: 5000 });
      expect(rows()[0].querySelector('.sd-msg-row').textContent).toBe('Ready');
    });

    it('files(dataTransfer) supplies the files, read at the drop (a folder walk can run there)', async () => {
      clear();
      const seen = [];
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, files: async () => [png('from-hook.png')], process: async (f) => { seen.push(f.name); return 1; } });
      ev('drop', dt([text('ignored.txt')]), zone());
      await waitFor(() => seen.length === 1, { timeout: 5000 });
      expect(seen).toEqual(['from-hook.png']);
    });

    it('window: false leaves a drop elsewhere on the page alone (no toast, nothing taken)', async () => {
      clear();
      let taken = 0;
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, window: false, process: async () => { taken++; return 1; } });
      ev('dragenter', dt([png('x.png')]), other());
      expect(document.querySelectorAll('.sd-hint').length).toBe(0);
      ev('drop', dt([png('x.png')]), other());
      await wait(150);
      expect(toast()).toBe('');
      expect(taken).toBe(0);
    });

    it('a drag over the target marks it .sd-over, and a drop removes the mark', () => {
      clear();
      attach(zone(), { accept: { types: ['image/*'], noun: 'a picture' }, window: false, process: async () => 1 });
      ev('dragenter', dt([png('x.png')]), zone());
      expect(zone().classList.contains('sd-over')).toBe(true);
      ev('drop', dt([]), zone());
      expect(zone().classList.contains('sd-over')).toBe(false);
    });
  });
})();
