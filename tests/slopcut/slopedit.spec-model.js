/* SlopCut tests: the timeline model (split, trim, ripple, move/overwrite, snapping, links, undo). */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const clipsOn = (p, i) => ST.M.clipsOn(p, ST.M.videoTracks(p)[i].id).map((c) => [+c.start.toFixed(3), +c.dur.toFixed(3), +c.in.toFixed(3)]);
  /** Project with a 10 s "video" media item (no blob needed for model tests). */
  function withMedia() {
    const p = ST.project();
    p.media.push({ id: 'mv', name: 'v.mp4', kind: 'video', dur: 10, w: 160, h: 90, hasAudio: true });
    p.media.push({ id: 'ma', name: 'a.wav', kind: 'audio', dur: 6, hasAudio: true });
    return p;
  }

  describe('boot', () => {
    it('loads the app with panels, timeline and commands', async () => {
      await ST.boot('app');
      expect(ST.win.document.title).toContain('SlopCut');
      expect(ST.SE.doc.tracks.length).toBe(4);
      expect(ST.win.document.querySelectorAll('.menu-b').length).toBe(7);
      expect(ST.SE.cmd.list.length).toBeGreaterThan(60);
      expect(ST.SE.cmd.get('edit.split').keys).toEqual(['S']);
      expect(ST.SE.cmd.get('tr.cross').title).toBe('Add transition: Cross dissolve');
    }, { timeout: 40000 });
  });

  describe('timeline model', () => {
    it('adds a video with a linked audio clip', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      const ids = ST.E.addMedia(p, p.media[0], V[0].id, 2);
      expect(ids.length).toBe(2);
      const [v, a] = ids.map((id) => ST.M.clip(p, id));
      expect(v.link).toBe(a.link);
      expect(ST.M.track(p, a.track).kind).toBe('audio');
      expect([v.start, v.dur, a.start, a.dur]).toEqual([2, 10, 2, 10]);
    });
    it('splits at a time, keeping source continuity and links', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      ST.E.addMedia(p, p.media[0], V[0].id, 0);
      const out = ST.E.split(p, 4);
      expect(out.length).toBe(2);
      expect(clipsOn(p, 0)).toEqual([[0, 4, 0], [4, 6, 4]]);
      const rights = out.map((id) => ST.M.clip(p, id));
      expect(rights[0].link).toBe(rights[1].link);
      expect(rights[0].link === p.clips[0].link).toBe(false);
      expect(ST.E.split(p, 0).length).toBe(0); // nothing at an edge
    });
    it('splits respect speed when computing the source in-point', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      const [id] = ST.E.addMedia(p, p.media[0], V[0].id, 0);
      ST.E.setSpeed(p, id, 2);
      expect(+ST.M.clip(p, id).dur.toFixed(3)).toBe(5);
      ST.E.split(p, 1, [id]);
      const r = ST.M.clipsOn(p, V[0].id)[1];
      expect([r.start, +r.in.toFixed(3), +r.dur.toFixed(3)]).toEqual([1, 2, 4]);
    });
    it('trims within the media and stops at neighbours', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      const [a] = ST.E.addMedia(p, p.media[0], V[0].id, 0);
      ST.E.split(p, 5);
      const b = ST.M.clipsOn(p, V[0].id)[1].id;
      expect(ST.E.trim(p, a, 'out', 8)).toBe(5); // blocked by the next clip
      expect(ST.E.trim(p, a, 'out', 3)).toBe(3);
      expect(clipsOn(p, 0)).toEqual([[0, 3, 0], [5, 5, 5]]);
      expect(ST.E.trim(p, b, 'in', 1)).toBe(3); // stops at the previous clip's end
      expect(clipsOn(p, 0)).toEqual([[0, 3, 0], [3, 7, 3]]);
      expect(ST.E.trim(p, b, 'out', 50)).toBe(10); // no media past 10 s
    });
    it('ripple trim and ripple delete shift later clips on every track', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      ST.E.addMedia(p, p.media[0], V[0].id, 0);
      ST.E.split(p, 4);
      const first = ST.M.clipsOn(p, V[0].id)[0].id;
      ST.E.trim(p, first, 'out', 2, { ripple: true });
      expect(clipsOn(p, 0)).toEqual([[0, 2, 0], [2, 6, 4]]);
      const audio = ST.M.clipsOn(p, ST.M.audioTracks(p)[0].id).map((c) => [c.start, c.dur]);
      expect(audio).toEqual([[0, 2], [2, 6]]);
      ST.E.remove(p, [first], { ripple: true });
      expect(clipsOn(p, 0)).toEqual([[0, 6, 4]]);
      expect(p.clips.length).toBe(2);
    });
    it('ripple trim of the in point keeps the clip start and pulls the rest left', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      ST.E.addMedia(p, p.media[0], V[0].id, 0);
      ST.E.split(p, 5);
      const second = ST.M.clipsOn(p, V[0].id)[1].id;
      ST.E.addGenerated(p, 'color', V[1].id, 10, 1);
      ST.E.trim(p, second, 'in', 6, { ripple: true });
      expect(clipsOn(p, 0)).toEqual([[0, 5, 0], [5, 4, 6]]);
      expect(clipsOn(p, 1)).toEqual([[9, 1, 0]]);
    });
    it('moves with overwrite and across tracks', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      const m1 = ST.E.addGenerated(p, 'color', V[0].id, 0, 4);
      ST.E.addGenerated(p, 'color', V[0].id, 6, 4);
      ST.E.move(p, [m1], 4); // lands on 4..8, cuts the second matte to 8..10
      expect(clipsOn(p, 0)).toEqual([[4, 4, 0], [8, 2, 2]]);
      ST.E.move(p, [m1], -10, 1); // clamped to 0, moved up to V2
      expect(clipsOn(p, 1)).toEqual([[0, 4, 0]]);
      p.tracks.find((t) => t.id === V[1].id).lock = true;
      expect(ST.E.move(p, [m1], 1)).toBe(false);
    });
    it('overwrite in the middle of a clip splits it', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      ST.E.addGenerated(p, 'color', V[0].id, 0, 10);
      ST.E.addGenerated(p, 'title', V[0].id, 3, 2);
      expect(ST.M.clipsOn(p, V[0].id).map((c) => [c.kind, c.start, c.dur])).toEqual([['color', 0, 3], ['title', 3, 2], ['color', 5, 5]]);
    });
    it('snaps to edit points, markers and the playhead', () => {
      const p = withMedia(), V = ST.M.videoTracks(p);
      ST.E.addGenerated(p, 'color', V[0].id, 2, 3);
      p.markers.push({ id: 'k', t: 7.5, name: 'm' });
      expect(ST.E.snap(p, 4.97, 0.1).t).toBe(5);
      expect(ST.E.snap(p, 7.45, 0.1).hit).toBe('marker');
      expect(ST.E.snap(p, 6.02, 0.1, null, [6]).hit).toBe('playhead');
      expect(ST.E.snap(p, 6.5, 0.1).hit).toBe(null);
    });
    it('evaluates volume keyframes, fades and transitions windows', () => {
      const c = ST.M.newClip({ kind: 'audio', dur: 10, vol: 1, keys: [{ t: 2, v: 1 }, { t: 4, v: 0 }], afIn: 1 });
      expect(ST.M.gainAt(c, 0.5)).toBeCloseTo(0.5);
      expect(ST.M.gainAt(c, 3)).toBeCloseTo(0.5);
      expect(ST.M.gainAt(c, 8)).toBeCloseTo(0);
      const p = ST.project(), V = ST.M.videoTracks(p);
      ST.matte(p, 0, 0, 4, '#ff0000'); const b = ST.matte(p, 0, 4, 4, '#0000ff');
      ST.E.setTransition(p, b, 'cross', 2);
      const w = ST.SE.compositor.trWindow(p, ST.M.clip(p, b));
      expect([w.a, w.b]).toEqual([3, 5]);
      ST.E.setTransition(p, b, 'cross', 99);
      expect(ST.M.clip(p, b).trIn.dur).toBe(4);
    });
    it('undo and redo restore the timeline but keep the bin', async () => {
      await ST.reset();
      const SE = ST.SE, V = ST.M.videoTracks(SE.doc);
      SE.change('Add', (p) => ST.E.addGenerated(p, 'color', V[0].id, 0, 5));
      SE.change('Split', (p) => ST.E.split(p, 2));
      expect(SE.doc.clips.length).toBe(2);
      SE.doc.media.push({ id: 'keep', name: 'k.png', kind: 'image' });
      expect(SE.history.undo()).toBe(true);
      expect(SE.doc.clips.length).toBe(1);
      expect(SE.doc.media.some((m) => m.id === 'keep')).toBe(true);
      SE.history.redo();
      expect(SE.doc.clips.length).toBe(2);
      SE.change('Nudge', (p) => ST.E.move(p, [p.clips[0].id], 0.1), { key: 'n' });
      SE.change('Nudge', (p) => ST.E.move(p, [p.clips[0].id], 0.1), { key: 'n' });
      SE.history.undo();
      expect(SE.doc.clips.length).toBe(2);
      expect(Math.min(...SE.doc.clips.map((c) => c.start))).toBe(0);
      SE.doc.media = SE.doc.media.filter((m) => m.id !== 'keep');
    });
    it('parses and formats timecode', () => {
      const U = ST.SE.util;
      expect(U.timecode(61.5, 30)).toBe('00:01:01:15');
      expect(U.parseTime('00:01:01:15', 30)).toBeCloseTo(61.5);
      expect(U.parseTime('1:05', 30)).toBe(65);
      expect(U.parseTime('2.5', 30)).toBe(2.5);
    });
  });
})();
