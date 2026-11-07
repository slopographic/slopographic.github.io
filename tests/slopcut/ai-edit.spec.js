/* SlopCut's editing vocabulary as commands with arguments, run through SlopCmd.exec as the AI and macros run them:
   an edit list builds a 3-clip edit with a title and a transition, exported and decoded (length, a frame with the
   title's pixels, a sound track); reframe 16:9 → 9:16; captions at their times; the palette form; a recorded macro;
   a destructive command asks; Cancel stops an export; look_at_frame gives a picture.
   Covers: slopcut/js/ai/core.js, slopcut/js/ai/cmd-clips.js, slopcut/js/ai/cmd-text.js, slopcut/js/ai/cmd-project.js,
   slopcut/js/ai/cmd-export.js, slopcut/js/ai/build.js, slopcut/js/ai/host.js, shared/commands/argform.js, shared/video/edl.js,
   slopcut/js/core/edit.js (setSpeed keeps the linked sound the same new length) */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  let SE, win, C, can = true;
  const ok = async (id, args, ctx) => { const r = await C.exec(id, args, ctx); if (!r.ok) throw new Error(id + ': ' + r.error); return r.value; };

  describe('SlopCut AI commands', () => {
    it('boots with the commands in the palette, schemas and destructive flags', async () => {
      win = await ST.boot('app'); SE = ST.SE; C = win.SlopCmd;
      can = await ST.canEncode();
      const ids = ['cut.list', 'cut.addClip', 'cut.move', 'cut.trim', 'cut.split', 'cut.delete', 'cut.duplicate', 'cut.speed', 'cut.volume', 'cut.transition', 'cut.title', 'cut.captions',
        'cut.colour', 'cut.reframe', 'cut.pip', 'cut.music', 'cut.marker', 'cut.inOut', 'cut.export', 'cut.look', 'cut.build', 'cut.newProject', 'cut.import', 'cut.randomEdit'];
      for (const id of ids) { const c = C.list().find((x) => x.id === id); if (!c) throw new Error('missing ' + id); expect(c.hidden).toBe(false); expect(Array.isArray(c.args)).toBe(true); }
      expect(C.list().find((x) => x.id === 'cut.delete').destructive).toBe(true);
      expect(C.list().find((x) => x.id === 'cut.newProject').destructive).toBe(true);
      expect(C.list().find((x) => x.id === 'cut.look').sends).toBe(true);
      expect(C.search('edit list').some((x) => x.id === 'cut.build')).toBe(true);
    }, { timeout: 40000 });

    it('builds a 3-clip edit from an edit list (Drive sources, a title, a transition) and exports it', async () => {
      if (!can) return;
      await ST.reset();
      const id = await AIT.toDrive(win, await AIT.clip(SE, win, { frames: 30, name: 'dark' }));
      const edl = { width: 320, height: 180, fps: 10, clips: [{ source: id, in: 0, out: 1.5 }, { source: 'dark', in: 0.5, out: 2, transition: { type: 'cross', dur: 0.6 } }, { source: id, in: 1, out: 2.5 }],
        titles: [{ text: 'BIG TITLE', start: 0.5, dur: 1.5, style: 'Headline', size: 0.3, color: '#ffffff', animation: 'none', exit: 'none' }], markers: [{ t: 1, name: 'here' }] };
      const r = await ok('cut.build', { edit_list: JSON.stringify(edl) });
      expect(r.clips.length).toBe(3); expect(r.titles.length).toBe(1); expect(r.duration).toBeCloseTo(4.5, 0.11);
      const st = C.state();
      expect([st.sequence.width, st.sequence.height]).toEqual([320, 180]);
      const v1 = st.clips.filter((c) => c.track === 'V1');
      expect(v1.map((c) => c.start)).toEqual([0, 1.5, 3]);
      expect(v1[1].transition).toEqual({ type: 'cross', dur: 0.6 });
      expect(v1[2].in).toBe(1);
      expect(st.media.length).toBe(1, 'the same Drive file is imported once');
      expect(SE.history.undoStack[SE.history.undoStack.length - 1].label).toBe('Build from edit list');
      const out = await ok('cut.export', { format: 'mp4', quality: 'medium' });
      expect(out.saved).toBe('Slop Drive');
      const rec = await win.SlopHub.get(out.file);
      const d = await AIT.decode(rec.blob);
      expect([d.w, d.h]).toEqual([320, 180]);
      expect(Math.abs(d.dur - 4.5)).toBeLessThan(0.25);
      const withTitle = AIT.bright(await d.frame(1.0)), without = AIT.bright(await d.frame(3.6));
      if (!(withTitle > without + 150)) throw new Error(`title pixels: ${withTitle} at 1 s, ${without} at 3.6 s`);
      d.close();
      expect((await AIT.tracks(SE, rec.blob)).includes('audio')).toBe(true);
    }, { timeout: 120000 });

    it('reframes 16:9 to 9:16: the sequence and the export are 1080×1920 and the picture fills it', async () => {
      if (!can) return;
      const r = await ok('cut.reframe', { aspect: '9:16', focus_x: 0.5 });
      expect(r).toContain('1080×1920');
      expect([SE.doc.w, SE.doc.h]).toEqual([1080, 1920]);
      await ok('cut.inOut', { in: 0, out: 0.3 });
      const out = await ok('cut.export', { range: 'io', quality: 'low', audio: false });
      const d = await AIT.decode((await win.SlopHub.get(out.file)).blob);
      expect([d.w, d.h]).toEqual([1080, 1920]);
      const px = [...(await d.frame(0.1)).getContext('2d').getImageData(540, 60, 1, 1).data];
      if (!(px[2] > 50)) throw new Error('the top of the frame is black: not filled ' + px);
      d.close();
      SE.history.undo(); SE.history.undo();   // back to the landscape edit
      expect(SE.doc.w).toBe(320);
    }, { timeout: 90000 });

    it('adds captions from SRT text at their times (one title clip per cue, drawn only then)', async () => {
      await ST.reset();
      SE.change('m', (p) => { ST.matte(p, 0, 0, 3, '#203040'); });
      const r = await ok('cut.captions', { srt: AIT.SRT, size: 0.12, color: '#ffffff' });
      expect(r).toContain('Added 2 captions');
      const caps = SE.doc.clips.filter((c) => c.kind === 'title');
      expect(caps.map((c) => [c.start, c.dur])).toEqual([[0.5, 0.5], [2, 0.5]]);
      expect(caps[0].text.str).toBe('HELLO THERE');
      const at = async (t) => AIT.bright(await SE.preview.frameCanvas(t));
      const a = await at(0.7), b = await at(1.5), c = await at(2.2);
      if (!(a > 200 && c > 100 && b < 20)) throw new Error(`caption pixels at 0.7/1.5/2.2 s: ${a}/${b}/${c}`);
    }, { timeout: 30000 });

    it('edits clips: add, move, trim with ripple, split, duplicate, speed, volume, transform, colour, track', async () => {
      if (!can) return;
      await ST.reset();
      const file = await AIT.clip(SE, win, { frames: 30, name: 'ed' });
      const meta = (await SE.media.importFiles([file]))[0];
      await ok('cut.addClip', { media: meta.id, track: 'V1', start: 0, in: 0, out: 2 });
      await ok('cut.addClip', { media: 'ed', track: 'V1', out: 3 });
      let v = C.state().clips.filter((c) => c.track === 'V1');
      expect(v.map((c) => [c.start, c.end])).toEqual([[0, 2], [2, 5]]);
      await ok('cut.trim', { clip: v[0].id, end: 1.5, ripple: true });
      v = C.state().clips.filter((c) => c.track === 'V1');
      expect(v.map((c) => c.start)).toEqual([0, 1.5]);
      const split = await ok('cut.split', { time: 3, clip: v[1].id });
      expect(split).toContain('Split at 3 s');
      await ok('cut.move', { clip: v[0].id, start: 6, track: 'V2' });
      expect(C.state().clips.find((c) => c.id === v[0].id).track).toBe('V2');
      await ok('cut.speed', { clip: v[0].id, speed: 2 });
      expect(SE.model.clip(SE.doc, v[0].id).dur).toBeCloseTo(0.75, 0.01);
      const dup = await ok('cut.duplicate', { clip: v[0].id });
      expect(dup).toContain('6.75');
      await ok('cut.volume', { clip: v[0].id, volume: 0.5, fade_in: 0.2 });
      const audio = SE.model.linked(SE.doc, SE.model.clip(SE.doc, v[0].id)).find((c) => c.kind === 'audio');
      expect(audio.dur).toBeCloseTo(0.75, 0.01, 'the linked sound keeps the new length too (core/edit.js setSpeed)');
      expect(audio.vol).toBe(0.5); expect(audio.afIn).toBe(0.2);
      await ok('cut.pip', { clip: v[0].id, corner: 'tr', scale: 0.25 });
      expect(SE.model.clip(SE.doc, v[0].id).scale).toBe(0.25);
      await ok('cut.colour', { clips: v[0].id, look: 'B&W' });
      expect(SE.model.clip(SE.doc, v[0].id).sat).toBe(-100);
      await ok('cut.track', { track: 'A1', mute: true });
      expect(SE.model.audioTracks(SE.doc)[0].mute).toBe(true);
      const bad = await C.exec('cut.move', { clip: 'nope', start: 1 });
      expect(bad.ok).toBe(false); expect(bad.error).toContain('list_clips');
    }, { timeout: 60000 });

    it('runs from the palette with a form, and records into a macro', async () => {
      await ST.reset();
      win.SlopMacros.record();
      C.run('cut.marker', { source: 'palette' });
      const dlg = await waitFor(() => win.document.querySelector('.sui-form'));
      dlg.querySelector('input').value = '1.5';
      [...win.document.querySelectorAll('.sui-dlg button')].find((b) => b.textContent === 'Run').click();
      await waitFor(() => SE.doc.markers.length === 1);
      expect(SE.doc.markers[0].t).toBe(1.5);
      await ok('cut.marker', { time: 2.5, name: 'two' });
      const steps = win.SlopMacros.steps();
      expect(steps.map((s) => [s.cmd, s.args.time])).toEqual([['cut.marker', 1.5], ['cut.marker', 2.5]]);
      win.SlopMacros.cancel();
    }, { timeout: 20000 });

    it('asks before a destructive command (the AI kit\'s one confirm), and does nothing on No', async () => {
      await ST.reset();
      SE.change('m', (p) => { ST.matte(p, 0, 0, 2, '#ff0000'); ST.matte(p, 0, 2, 2, '#00ff00'); });
      await AIT.load(win, ['shared/ai/tools.js', 'shared/ai/cmdtools.js']);
      const K = win.SlopAIKit, tools = K.cmdTools.build(C, { label: 'SlopCut' });
      let asked = 0;
      const no = await K.tools.dispatch({ name: 'delete_clips', arguments: { clips: 'all' } }, tools, { confirm: async () => { asked++; return false; } });
      expect(no.ok).toBe(false); expect(asked).toBe(1); expect(SE.doc.clips.length).toBe(2);
      const yes = await K.tools.dispatch({ name: 'delete_clips', arguments: { clips: 'all' } }, tools, { confirm: async () => true });
      expect(yes.ok).toBe(true); expect(SE.doc.clips.length).toBe(0);
      const list = await K.tools.dispatch({ name: 'list_clips', arguments: {} }, tools, { confirm: async () => { throw new Error('asked for a read'); } });
      expect(list.ok).toBe(true);
    }, { timeout: 20000 });

    it('Cancel (the caller\'s AbortSignal) stops an export; look_at_frame returns a small JPEG', async () => {
      await ST.reset();
      SE.change('m', (p) => { ST.matte(p, 0, 0, 30, '#336699'); });
      const look = await ok('cut.look', { time: 1, max_size: 200 });
      expect(look.media[0].mime).toBe('image/jpeg'); expect(look.media[0].data.length).toBeGreaterThan(100);
      if (!can) return;
      const ac = new win.AbortController();
      const p = C.exec('cut.export', { width: 1280, height: 720, fps: 30, audio: false }, { signal: ac.signal });
      setTimeout(() => ac.abort(), 50);
      const r = await p;
      expect(r.ok).toBe(false); expect(r.error).toContain('cancelled');
      await waitFor(() => !win.document.querySelector('.prog-dlg'));
    }, { timeout: 60000 });
  });
})();
