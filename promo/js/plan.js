// The edit: turns window.SLOP_APPS into a list of timed segments on a 120 BPM grid.
// Every cut lands on a beat; the soundtrack (audio/score.js) reads the same plan.
import { BEAT } from './ease.js';

const KIND_TITLE = { app: 'Apps', game: 'Games', experiment: 'Experiments' };
const KIND_LINE = { app: 'Pro tools. Zero installs.', game: 'Starring Sloppo.', experiment: 'Weird little web toys.' };

export function makePlan(apps) {
  const segs = [];
  let beat = 0;
  const add = (type, beats, data = {}) => { segs.push({ type, start: beat * BEAT, dur: beats * BEAT, beats, startBeat: beat, ...data }); beat += beats; };
  add('intro', 16);
  for (const kind of ['app', 'game', 'experiment']) {
    const list = apps.filter((a) => a.kind === kind);
    if (!list.length) continue;
    add('chapter', 4, { title: KIND_TITLE[kind], line: KIND_LINE[kind], count: list.length, kind });
    // Shipping apps get a bar and a half; apps still in development flash by; games and experiments get a bar.
    list.forEach((a, i) => add('app', kind !== 'app' ? 4 : a.status === 'building' ? 3 : 6, { app: a, index: i, of: list.length }));
  }
  add('montage', 10, { games: apps.filter((a) => a.kind === 'game') });
  add('pillars', 24);
  add('outro', 14);
  const total = beat * BEAT;
  return { segs, total, beats: beat };
}

/** Where the media for an app lives. A missing clip falls back to the shot, then to a generated tile. */
export function mediaOf(app, root = '../') {
  const shot = app.shot ? root + app.shot : null;
  return { shot, clip: shot ? shot.replace('/shots/', '/clips/').replace(/\.jpe?g$/, '') : null };
}
