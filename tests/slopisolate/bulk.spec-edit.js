/* SlopIsolate bulk editing in the real app (real model, WebAssembly): three pictures ticked in the queue are edited at
 * once from the settings panel (threshold, background colour, shadow), each one's result changes and the model does not
 * run; a value they differ on shows as mixed; one Undo restores all three; Copy / Paste settings; a model change re-runs
 * only the selected pictures; the selection goes to a workflow; saved work keeps each picture's settings.
 * Covers: slopisolate/js/ui/bulk.js, slopisolate/js/ui/bulk-act.js, slopisolate/js/ui/edit.js, slopisolate/js/ui/kit.js,
 * slopisolate/js/ui/panel.js, slopisolate/js/ui/panel-look.js, slopisolate/js/ui/panel-head.js, slopisolate/js/ui/queue.js,
 * slopisolate/js/ui/menus.js, slopisolate/js/ui/ctxmenu.js, slopisolate/js/ui/commands.js, slopisolate/js/ui/openin.js,
 * slopisolate/js/render/thumbs.js, slopisolate/js/render/compose.js, slopisolate/js/core/settings.js,
 * slopisolate/js/core/history.js, slopisolate/js/core/state.js, slopisolate/js/io/process.js, slopisolate/js/io/export.js,
 * slopisolate/js/ui/view-state.js, slopisolate/css/workspace.css, slopisolate/css/panel.css */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  let W, CO, S, D;
  const MAGENTA = [255, 0, 255, 255];

  describe('bulk editing from the settings panel', () => {
    it('three pictures, one with its own threshold; ticking all three: "Editing 3 pictures", threshold mixed', async () => {
      W = await BT.open({ model: 'fast', workers: 2 }); CO = W.CO; S = CO.state; D = W.document;
      await CO.viewState.clear();
      const files = [];
      for (let i = 0; i < 3; i++) files.push(await BT.photo(300 + i, 480, 360, i === 1 ? 'tri' : 'circle'));
      BT.drop(files);
      await BT.settled(3);
      await waitFor(() => CO.process.active && CO.process.active.item === S.items[0], { timeout: 30000 });
      BK.slide('Edges', 'Threshold', 0.3);                     // only the picture on screen
      expect(S.items.map((it) => it.s.threshold)).toEqual([0.3, 0.5, 0.5]);
      expect(D.querySelector('#props .pp-title h2').textContent).toBe('Settings');
      for (let i = 0; i < 3; i++) BK.tick(i);
      expect(S.sel.size).toBe(3);
      expect(D.querySelector('#queue .q-n').textContent).toBe('3 selected');
      expect(D.getElementById('qSelAll').textContent).toBe('Select none');
      expect(D.querySelector('#props .pp-title h2').textContent).toBe('Editing 3 pictures');
      expect(D.getElementById('bulkNote').hidden).toBe(false);
      expect(D.getElementById('bulkNote').textContent).toMatch(/Brush edits stay with each picture/);
      const th = BK.row('Edges', 'Threshold');
      expect(th.classList.contains('mixed')).toBe(true);
      expect(th.querySelector('.pp-val').textContent).toBe('Mixed');
      expect(BK.row('Edges', 'Softness').classList.contains('mixed')).toBe(false);
    }, { timeout: 300000 });

    it('threshold, background colour and shadow change on all three, each result follows, and the model does not run', async () => {
      const before = [];
      for (const it of S.items) before.push(await BK.picture(it));
      const runs = BK.spy();
      BK.slide('Edges', 'Threshold', 0.8);
      BK.seg('Background', 'Colour');
      BK.colour('Background', 'Colour', '#ff00ff');
      BK.check('Shadow', 'Drop shadow');
      BK.slide('Shadow', 'Opacity', 1);
      expect(S.items.map((it) => [it.s.threshold, it.bg.mode, it.bg.color, it.shadow.on, it.shadow.opacity])).toEqual(S.items.map(() => [0.8, 'color', '#ff00ff', true, 1]));
      expect(BK.row('Edges', 'Threshold').classList.contains('mixed')).toBe(false);
      for (let i = 0; i < 3; i++) {
        const p = await BK.picture(S.items[i]);
        expect(BK.px(p, 0, 0)).toEqual(MAGENTA);                // the new background
        expect(BK.px(before[i], 0, 0)[3] < 128).toBe(true);      // was see-through
        expect(BK.solid(p.mask) < BK.solid(before[i].mask)).toBe(true);   // a higher threshold keeps less
        expect(BK.shadowed(p, MAGENTA) > 50).toBe(true);        // the drop shadow around the subject
      }
      // the queue tiles show each new result too (drawn in the background)
      await waitFor(() => S.items.every((it) => { const c = BK.tileCorner(it); return c && c.join() === MAGENTA.join(); }), { timeout: 10000 });
      await sleep(300);
      expect(runs.length).toBe(0);
      expect(S.items.every((it) => it.status === 'done')).toBe(true);
      runs.stop();
    }, { timeout: 120000 });

    it('one undo step per change, for all three: Undo five times restores every picture', async () => {
      const want = [0.3, 0.5, 0.5];
      for (let i = 0; i < 5; i++) D.getElementById('btnUndo').click();   // opacity, shadow, colour, mode, threshold
      expect(S.items.map((it) => it.s.threshold)).toEqual(want);
      expect(S.items.map((it) => [it.bg.mode, it.shadow.on])).toEqual(S.items.map(() => ['transparent', false]));
      expect(BK.row('Edges', 'Threshold').classList.contains('mixed')).toBe(true);
      D.getElementById('btnRedo').click();
      expect(S.items.map((it) => it.s.threshold)).toEqual([0.8, 0.8, 0.8]);
      D.getElementById('btnUndo').click();
    }, { timeout: 30000 });

    it('Escape clears the selection; Copy settings on one, Paste settings on two others', async () => {
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(S.sel.size).toBe(0);
      expect(D.querySelector('#props .pp-title h2').textContent).toBe('Settings');
      CO.queue.open(S.items[0]);
      await waitFor(() => CO.process.active && CO.process.active.item === S.items[0], { timeout: 30000 });
      BK.seg('Background', 'Blur');
      BK.slide('Background', 'Blur', 40);
      BK.seg('Crop', 'Subject');
      expect(S.items.map((it) => it.bg.mode)).toEqual(['blur', 'transparent', 'transparent']);
      await BK.menu('Copy settings');
      BK.tick(1); BK.tick(2);
      await waitFor(() => S.current() === S.items[1] || S.current() === S.items[2], { timeout: 3000 });   // a ticked picture goes on screen
      expect(D.querySelector('#props .pp-title h2').textContent).toBe('Editing 2 pictures');
      await BK.menu('Paste settings on 2 pictures');
      expect(S.items.map((it) => [it.bg.mode, it.bg.blur, it.crop.mode, it.s.threshold])).toEqual(S.items.map(() => ['blur', 40, 'subject', 0.3]));
      const p = await BK.picture(S.items[2]);
      D.getElementById('btnUndo').click();                      // the paste is one step for both
      expect(S.items.map((it) => it.bg.mode)).toEqual(['blur', 'transparent', 'transparent']);
      D.getElementById('btnRedo').click();
    }, { timeout: 60000 });

    it('a model change re-runs only the selected pictures', async () => {
      const runs = BK.spy();
      BT.pick('portrait');
      await waitFor(() => runs.length === 2, { timeout: 20000 });
      await BT.settled(3, 300000);
      runs.stop();
      expect(runs.map((r) => r.model)).toEqual(['portrait', 'portrait']);
      expect(runs.map((r) => r.name).sort()).toEqual(['photo-301.png', 'photo-302.png']);
      expect(S.items.map((it) => it.modelUsed)).toEqual(['fast', 'portrait', 'portrait']);
      expect(S.model).toBe('fast');                             // the app's model is unchanged
      expect(D.querySelector('input[name=cutout-model][value=portrait]').checked).toBe(true);
    }, { timeout: 320000 });

    it('the selection goes to a workflow, and Add to a workflow… carries the settings they share', async () => {
      let got = null, step = null;
      W.SlopWorkflowEntry.open = (o) => { got = o; return Promise.resolve(null); };
      W.SlopFlowDoc.addToWorkflow = (op, o) => { step = o; };
      await BK.menu('Run a workflow…');
      await waitFor(() => got, { timeout: 30000 });
      expect(got.files.map((f) => f.name)).toEqual(['photo-301-cutout.png', 'photo-302-cutout.png']);
      expect(got.files.every((f) => f.type === 'image/png' && f.size > 1000)).toBe(true);
      CO.menus.act.workflow();
      await waitFor(() => step, { timeout: 3000 });
      expect([step.settings.model, step.settings.look.bg.mode, step.settings.look.crop.mode]).toEqual(['portrait', 'blur', 'subject']);
      // the shared Run a workflow… (Ctrl+K) asks the page for its files: the selection
      let offered = null;
      W.dispatchEvent(new W.CustomEvent('slop:convert-files', { detail: { provide: (x) => { offered = x; } } }));
      expect((await offered()).length).toBe(2);
      // the queue's right-click menu on a selected picture is the selection's menu
      expect(CO.ctxmenu.queueItems(S.items[1]).some((r) => r.label === 'Export 2 pictures (ZIP)')).toBe(true);
      expect(BK.menuLabels().filter((l) => /Open in|Remove 2 pictures|Clear brush edits/.test(l)).length).toBe(3);
    }, { timeout: 60000 });

    it('Ctrl+A selects all; saved work keeps every picture its own settings', async () => {
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
      expect(S.sel.size).toBe(3);
      const looks = BK.looks(), models = S.items.map((it) => it.model);
      await sleep(1500);                                        // the autosave waits 600 ms, then writes
      W = await BT.open({ model: 'fast', workers: 2 }); CO = W.CO; S = CO.state; D = W.document;
      await waitFor(() => S.items.length === 3 && S.items.every((it) => it.status === 'done'), { timeout: 60000 });
      expect(BK.looks()).toEqual(looks);
      expect(S.items.map((it) => it.model)).toEqual(models);
      await CO.viewState.clear();
    }, { timeout: 120000 });
  });
})();
