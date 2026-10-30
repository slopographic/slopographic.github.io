/* SlopIsolate intake: the picker, the drop zone, the queue sidebar, paste, the sample, Open from Slop Drive (both menus)
 * and a file sent from another app all end in CO.files.take (once per batch), take hands the whole batch to
 * CO.process.add in one call, and the first-use notice is asked once per batch. Nothing else calls CO.process.add. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  let f, W, CO, takes, adds, gates;

  async function boot() {
    try { localStorage.removeItem('slop-firstrun:slopisolate'); } catch (e) { /* private window */ }
    f = document.createElement('iframe');
    f.style.cssText = 'width:1200px;height:800px;border:0;display:block';
    f.src = '../../slopisolate/index.html?t=' + Date.now();
    document.body.append(f);
    await waitFor(() => f.contentWindow.CO && f.contentWindow.CO.files && f.contentWindow.CO.files.drop, { timeout: 15000 });
    W = f.contentWindow; CO = W.CO;
    takes = []; adds = []; gates = 0;
    // spy on the one entry (calls through), stub the queue (no model) and count the first-use notices
    const take = CO.files.take;
    CO.files.take = function (files, opts) { takes.push({ n: [...files].length, source: opts && opts.source }); return take.call(this, files, opts); };
    CO.process.add = (files, opts) => { adds.push({ n: files.length, driveId: opts && opts.driveId }); const r = []; r.videos = []; return r; };
    W.SlopFirstRun.once = () => { gates++; return Promise.resolve(true); };
  }
  const png = (name) => new W.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: 'image/png' });
  const two = () => [png('a.png'), png('b.png')];
  const dt = (files) => { const d = new W.DataTransfer(); for (const x of files) d.items.add(x); return d; };
  const dropOn = (sel, files) => W.document.querySelector(sel).dispatchEvent(new W.DragEvent('drop', { dataTransfer: dt(files), bubbles: true, cancelable: true }));
  /** Run one route and expect exactly one take, one add of the whole batch and one notice. */
  async function once(label, fn, n = 2) {
    const t = takes.length, a = adds.length, g = gates;
    await fn();
    await waitFor(() => adds.length > a, { timeout: 8000 });
    await sleep(150); // nothing more may follow
    expect(label + ' takes ' + (takes.length - t)).toBe(label + ' takes 1');
    expect(label + ' adds ' + (adds.length - a) + ' of ' + adds[adds.length - 1].n).toBe(label + ' adds 1 of ' + n);
    expect(label + ' notices ' + (gates - g)).toBe(label + ' notices 1');
  }

  describe('one way in', () => {
    it('boots with the spy in place', async () => { await boot(); expect(typeof CO.files.take).toBe('function'); }, { timeout: 20000 });
    it('the sample button', () => once('sample', () => W.document.getElementById('emptySample').click(), 1), { timeout: 15000 });
    it('the file picker', () => once('picker', () => { W.SlopUI.pickFiles = async () => two(); return CO.files.open(); }), { timeout: 15000 });
    it('a drop on the workspace (the drop zone)', () => once('drop', () => dropOn('#workspace', two())), { timeout: 15000 });
    it('a drop on the queue sidebar, without the "drop on the highlighted area" warning', async () => {
      const toasts = [];
      const toast = W.SlopDrop.panel.toast;
      W.SlopDrop.panel.toast = (msg, kind) => { toasts.push(msg); return toast(msg, kind); };
      await once('queue', () => dropOn('#queue', two()));
      expect(toasts.some((t) => /highlighted area/.test(t))).toBe(false);
    }, { timeout: 15000 });
    it('the drop zone\'s own Choose files', () => once('choose', () => {
      const input = W.document.querySelector('#isoDrop input[type=file]');
      Object.defineProperty(input, 'files', { configurable: true, get: () => dt(two()).files });
      input.dispatchEvent(new W.Event('change'));
    }), { timeout: 15000 });
    it('a paste', () => once('paste', () => {
      W.document.body.dispatchEvent(new W.ClipboardEvent('paste', { clipboardData: dt(two()), bubbles: true, cancelable: true }));
    }), { timeout: 15000 });
    it('Open from Slop Drive (File menu and Drive) and a file another app sent', async () => {
      const rec = { id: 'd1', blob: new W.Blob([new Uint8Array(8)], { type: 'image/png' }), name: 'drive.png', type: 'image/png' };
      W.SlopHub.pickFromDrive = async () => rec;
      await once('drive', () => CO.drive.open(), 1);
      expect(adds[adds.length - 1].driveId).toBe('d1');
      await once('hub', () => CO.files.fromDrive(rec, { source: 'hub', origin: { from: 'photoslop', meta: {} } }), 1);
    }, { timeout: 15000 });
    it('a batch that arrives while the notice is open waits on the same notice', async () => {
      let open = 0, answer;
      W.SlopFirstRun.once = () => { open++; return new Promise((r) => { answer = r; }); };
      const a = CO.files.take(two(), { source: 'x' }), b = CO.files.take([png('c.png')], { source: 'y' });
      await sleep(50);
      expect(open).toBe(1);
      answer(true);
      await a; await b;
      W.SlopFirstRun.once = () => { gates++; return Promise.resolve(true); };
    });
    it('a cancelled notice adds nothing; non-images are refused', async () => {
      const a = adds.length;
      W.SlopFirstRun.once = () => Promise.resolve(false);
      expect((await CO.files.take(two())).length).toBe(0);
      W.SlopFirstRun.once = () => Promise.resolve(true);
      expect((await CO.files.take([new W.File(['x'], 'notes.txt', { type: 'text/plain' })])).length).toBe(0);
      expect(adds.length).toBe(a);
    });
    it('a video runs with the app\'s model too (it has none of its own)', async () => {
      const V = CO.video, seen = [];
      V.analyze = async (src, o) => { seen.push(o.model); return { cancelled: true }; };
      CO.state.model = 'portrait';
      const it = CO.state.createItem(new W.File([new Uint8Array(4)], 'clip.mp4', { type: 'video/mp4' }));
      Object.assign(it, { kind: 'video', status: 'ready', vid: { src: { w: 64, h: 36 }, res: null, ac: null } }); // as V.addItem makes it
      expect(it.model).toBe(null);
      await V.run(it);
      CO.state.model = 'fast';
      expect(seen).toEqual(['portrait']);
    }, { timeout: 15000 });
    it('no app script but io/files.js calls CO.process.add, and none adds its own drop or paste listener', async () => {
      const srcs = [...W.document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter((s) => /^js\//.test(s));
      expect(srcs.length > 20).toBe(true);
      for (const src of srcs) {
        const text = await (await fetch('../../slopisolate/' + src)).text();
        const calls = (text.match(/process\.add\(/g) || []).length;
        expect(src + ' ' + calls).toBe(src + ' ' + (src === 'js/io/files.js' ? 1 : 0));
        expect(src + ' ' + /addEventListener\('(drop|paste)'/.test(text)).toBe(src + ' false');
      }
    }, { timeout: 15000 });
  });
})();
