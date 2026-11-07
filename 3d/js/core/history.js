/* Slop 3D undo history (pure). It stores whole scene snapshots (JSON copies), so undo and redo restore
 * exact states. record(snapshot, key) ignores a snapshot equal to the current one, and merges consecutive
 * records with the same key (typing in a field, nudging with arrows) into one step.
 * Sets window.Slop3D.history. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const copy = (v) => JSON.parse(JSON.stringify(v));

  function createHistory({ limit = 200 } = {}) {
    let states = [], index = -1, lastKey = null;
    return {
      /** Starts over from snapshot (no undo beyond it). */
      reset(snapshot) { states = [copy(snapshot)]; index = 0; lastKey = null; },
      /** Records a new state. Returns true when the history changed. */
      record(snapshot, key = null) {
        if (index < 0) { this.reset(snapshot); return true; }
        if (JSON.stringify(states[index]) === JSON.stringify(snapshot)) return false;
        if (key && key === lastKey) { states[index] = copy(snapshot); return true; }
        states = states.slice(0, index + 1);
        states.push(copy(snapshot));
        if (states.length > limit) states.shift();
        index = states.length - 1;
        lastKey = key || null;
        return true;
      },
      /** The snapshot to restore for one step back, or null. */
      undo() { if (index <= 0) return null; index--; lastKey = null; return copy(states[index]); },
      /** The snapshot to restore for one step forward, or null. */
      redo() { if (index >= states.length - 1) return null; index++; lastKey = null; return copy(states[index]); },
      canUndo() { return index > 0; },
      canRedo() { return index >= 0 && index < states.length - 1; },
      current() { return index < 0 ? null : copy(states[index]); },
      get length() { return states.length; },
      get position() { return index; },
    };
  }

  S.history = { createHistory };
})();
