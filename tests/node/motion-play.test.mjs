// Node tests for shared/motion: transitions, the clock-driven player and preset data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './motion-env.mjs';

const M = await load();
const isRange = (e) => e.name === 'RangeError';
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ~ ${b}`);
const SIZE = { width: 1000, height: 500 };

test('every transition shows the outgoing slide fully at 0 and the incoming slide fully at 1', () => {
  for (const name of M.transitions.names()) {
    const at0 = M.transitions.transition(name, 0, SIZE);
    const at1 = M.transitions.transition(name, 1, SIZE);
    const o0 = at0.outgoing;
    assert.deepEqual([o0.translateX, o0.translateY, o0.scale, o0.rotate, o0.opacity, o0.clip], [0, 0, 1, 0, 1, 'none'], `${name} outgoing at 0`);
    const i1 = at1.incoming;
    assert.deepEqual([i1.translateX, i1.translateY, i1.scale, i1.rotate, i1.opacity, i1.clip], [0, 0, 1, 0, 1, 'none'], `${name} incoming at 1`);
    assert.equal(at1.outgoing.opacity, 0, `${name} outgoing is gone at 1`);
  }
});

test('incoming slides start hidden for fade, none and zoom', () => {
  for (const name of ['fade', 'none', 'zoom-in', 'zoom-out']) {
    assert.equal(M.transitions.transition(name, 0, SIZE).incoming.opacity, 0, name);
  }
});

test('push moves the slides by whole slide sizes in px', () => {
  const left = M.transitions.transition('push-left', 0, SIZE);
  assert.equal(left.incoming.translateX, 1000);
  assert.equal(M.transitions.transition('push-left', 1, SIZE).outgoing.translateX, -1000);
  assert.equal(M.transitions.transition('push-up', 0, SIZE).incoming.translateY, 500);
  assert.equal(M.transitions.transition('push-down', 1, SIZE).outgoing.translateY, 500);
  assert.equal(M.transitions.transition('push-right', 1, SIZE).outgoing.translateX, 1000);
});

test('wipe reveals the incoming slide with a clip inset that closes from the right', () => {
  assert.equal(M.transitions.transition('wipe', 0.5, SIZE).incoming.clip, 'inset(0% 50% 0% 0%)');
  assert.equal(M.transitions.transition('wipe', 0, SIZE).incoming.clip, 'inset(0% 100% 0% 0%)');
  assert.equal(M.transitions.transition('wipe', 1, SIZE).incoming.clip, 'none');
});

test('transition progress is clamped, names are validated and spec returns a copy', () => {
  assert.deepEqual(plain(M.transitions.transition('fade', -3, SIZE)), plain(M.transitions.transition('fade', 0, SIZE)));
  assert.deepEqual(plain(M.transitions.transition('fade', 7, SIZE)), plain(M.transitions.transition('fade', 1, SIZE)));
  assert.throws(() => M.transitions.transition('spiral', 0.5, SIZE), isRange);
  assert.throws(() => M.transitions.transition('fade', NaN, SIZE), isRange);
  assert.ok(M.transitions.names().includes('none'));
  const spec = M.transitions.spec('fade');
  spec.outgoing.tracks.opacity.length = 0;
  assert.equal(M.transitions.spec('fade').outgoing.tracks.opacity.length, 2);
});

test('transition specs are valid keyframe data', () => {
  for (const name of M.transitions.names()) {
    const spec = M.transitions.spec(name);
    for (const side of ['outgoing', 'incoming']) {
      for (const prop of Object.keys(spec[side].tracks)) {
        assert.equal(M.track.validateKeys(spec[side].tracks[prop], `${name}.${side}.${prop}`).length, 0, `${name} ${side} ${prop}`);
      }
    }
  }
});

/** Manual clock: advance(ms) runs the scheduled frame callbacks in 16 ms steps. */
function fakeClock() {
  let now = 0;
  let pending = null;
  return {
    now: () => now,
    schedule(cb) {
      pending = cb;
      return () => { if (pending === cb) pending = null; };
    },
    advance(ms) {
      let left = ms;
      while (left > 0 && pending) {
        const step = Math.min(16, left);
        now += step;
        left -= step;
        const cb = pending;
        pending = null;
        cb();
      }
      if (left > 0) now += left;
    },
    get scheduled() { return pending !== null; },
  };
}

test('player seeks and pauses; paused time does not move', () => {
  const clock = fakeClock();
  const frames = [];
  const p = M.playback.create({ duration: 1, clock, onFrame: (t, s) => frames.push([t, s.playing]) });
  p.play();
  clock.advance(500);
  near(p.time, 0.5);
  p.pause();
  const stopped = p.time;
  clock.advance(500);
  assert.equal(p.time, stopped, 'paused playhead stays put');
  assert.equal(clock.scheduled, false);
  p.seek(0.25);
  assert.equal(p.time, 0.25);
  assert.equal(frames.at(-1)[0], 0.25, 'seek emits a frame');
  assert.throws(() => p.seek(NaN), isRange);
});

test('speed scales playback time', () => {
  const clock = fakeClock();
  const p = M.playback.create({ duration: 10, speed: 2, clock });
  p.play();
  clock.advance(250);
  near(p.time, 0.5);
  p.setSpeed(0.5);
  clock.advance(1000);
  near(p.time, 1.0);
  p.destroy();
});

test('loop none stops at the end and play restarts from the beginning', () => {
  const clock = fakeClock();
  const p = M.playback.create({ duration: 1, clock });
  p.play();
  clock.advance(2000);
  assert.equal(p.time, 1);
  assert.equal(p.playing, false);
  assert.equal(p.ended, true);
  p.play();
  near(p.time, 0);
  clock.advance(100);
  assert.equal(p.ended, false);
});

test('loop wraps and pingpong reflects the playhead', () => {
  const clock = fakeClock();
  const looped = M.playback.create({ duration: 1, loop: 'loop', clock });
  looped.play();
  clock.advance(1500);
  near(looped.time, 0.5);
  assert.equal(looped.ended, false);
  looped.destroy();

  const ping = M.playback.create({ duration: 1, loop: 'pingpong', clock });
  ping.play();
  clock.advance(1500); // forward 1 s, back 0.5 s
  near(ping.time, 0.5);
  ping.destroy();
});

test('onFrame receives time and state, and bad options are refused', () => {
  const clock = fakeClock();
  let last = null;
  const p = M.playback.create({ duration: 2, clock, onFrame: (t, s) => { last = { t, s }; } });
  p.play();
  clock.advance(32);
  assert.equal(last.s.playing, true);
  assert.equal(last.s.duration, 2);
  assert.throws(() => M.playback.create({ duration: 1, loop: 'bounce', clock }), isRange);
  assert.throws(() => M.playback.create({ duration: 'x', clock }), isRange);
  p.destroy();
  assert.equal(clock.scheduled, false, 'destroy cancels the pending frame');
});

test('presets: list, get and data are valid', () => {
  const list = M.presets.list();
  // sorted by name: fade-in, pop, pulse, shake, slide-up, spin-in
  assert.deepEqual(plain(list.map((p) => p.label)), ['Fade in', 'Pop', 'Pulse', 'Shake', 'Slide up', 'Spin in']);
  for (const { name } of list) {
    const p = M.presets.get(name);
    assert.ok(p.duration > 0, `${name} has a duration`);
    for (const prop of Object.keys(p.tracks)) {
      assert.equal(M.track.validateKeys(p.tracks[prop], `${name}.${prop}`).length, 0, `${name}.${prop}`);
      assert.ok(p.tracks[prop].every((k) => k.t <= p.duration + 1e-9), `${name}.${prop} ends inside the duration`);
    }
  }
  assert.throws(() => M.presets.get('wobble'), isRange);
});

test('presets apply to any target at an offset and never mutate the timeline', () => {
  const base = M.timeline.create({ duration: 0.5 });
  const before = JSON.stringify(base);
  const tl = M.presets.apply(base, 'fade-in', 'card-1', { at: 1 });
  assert.equal(JSON.stringify(base), before);
  assert.equal(tl.duration, 1.4);
  const keys = plain(M.timeline.getKeys(tl, 'card-1', 'opacity'));
  assert.deepEqual(keys.map((k) => k.t), [1, 1.4]);
  assert.equal(M.timeline.sample(tl, 0.5)['card-1'].opacity, 0, 'before the first key the start value holds');
  near(plain(M.timeline.sample(tl, 1.2))['card-1'].opacity, 0.75, 1e-9); // halfway through easeOutQuad(0.5) = 0.75
});

test('apply scales translate amounts and time', () => {
  const tl = M.presets.apply(M.timeline.create(), 'slide-up', 'panel', { amount: 2, timeScale: 2 });
  assert.equal(M.timeline.getKeys(tl, 'panel', 'translateY')[0].value, 80);
  assert.equal(M.timeline.getKeys(tl, 'panel', 'translateY').at(-1).t, 1);
  assert.equal(tl.duration, 1);
  assert.throws(() => M.presets.apply(tl, 'pop', 'x', { timeScale: 0 }), isRange);
});

test('valueAt previews a preset without a timeline', () => {
  assert.equal(M.presets.valueAt('fade-in', 0).opacity, 0);
  assert.equal(M.presets.valueAt('fade-in', 0.4).opacity, 1);
  assert.equal(M.presets.valueAt('slide-up', 0.5, { amount: 3 }).translateY, 0);
  assert.equal(M.presets.valueAt('slide-up', 0, { amount: 3 }).translateY, 120);
});
