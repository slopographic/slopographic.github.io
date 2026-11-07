/* Slop Music: the play order. Pure functions, no DOM, no audio. Exposes window.SlopMusic.queue.
 * A queue is { ids: [list order], order: [play order], index: position in order or -1,
 *   shuffle: bool, repeat: 'off' | 'all' | 'one' }. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  /** The play order of ids. Shuffle keeps `first` at the front and shuffles the rest. */
  function makeOrder(ids, { shuffle = false, first = null, rnd = Math.random } = {}) {
    if (!shuffle) return ids.slice();
    const rest = ids.filter((id) => id !== first);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return first !== null && ids.includes(first) ? [first, ...rest] : rest;
  }
  /** A new queue that starts on startId (or at the top when startId is not in ids). */
  function create(ids, startId, { shuffle = false, repeat = 'off', rnd } = {}) {
    const start = ids.includes(startId) ? startId : (ids[0] ?? null);
    const order = makeOrder(ids, { shuffle, first: start, rnd });
    return { ids: ids.slice(), order, index: start === null ? -1 : order.indexOf(start), shuffle, repeat };
  }
  /** Changes shuffle, keeping the current track playing. */
  function setShuffle(q, on, rnd) {
    const cur = q.order[q.index] ?? null;
    const order = makeOrder(q.ids, { shuffle: on, first: cur, rnd });
    return Object.assign({}, q, { shuffle: on, order, index: cur === null ? -1 : order.indexOf(cur) });
  }
  /** The index to play after a step: dir +1 next, -1 previous. auto = the track ended on its own.
   * Returns -1 when the queue has nowhere to go (repeat off at either end). */
  function step(q, dir, auto = false) {
    const n = q.order.length;
    if (!n) return -1;
    if (auto && q.repeat === 'one' && q.index >= 0) return q.index;
    const i = q.index + dir;
    if (i >= n) return q.repeat === 'all' ? 0 : -1;
    if (i < 0) return q.repeat === 'all' ? n - 1 : 0;
    return i;
  }
  M.queue = { makeOrder, create, setShuffle, step };
})();
