// Keyboard-wedge scanning: a USB or Bluetooth scanner types the code into the focused field very fast and then
// presses Enter. Any browser can read that, so this is the always-on mode and needs no camera.
// attachWedge(input, onScan) calls onScan(text, { source }) once per Enter. source is 'scanner' for a fast burst
// (median gap under FAST_GAP_MS between keys, at least MIN_KEYS keys) and 'keyboard' for typed text.
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});
  const FAST_GAP_MS = 60;
  const MIN_KEYS = 3;

  const median = (xs) => {
    if (!xs.length) return Infinity;
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /** Listens on one input. Returns a function that removes the listener. Key repeats and IME input are ignored. */
  function attachWedge(input, onScan) {
    let gaps = [], keys = 0, last = 0;
    const onKey = (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        const text = input.value.trim();
        const fast = keys >= MIN_KEYS && median(gaps) < FAST_GAP_MS;
        input.value = '';
        const burstGaps = gaps.length;
        gaps = []; keys = 0; last = 0;
        if (!text) return;
        onScan(text, { source: fast && burstGaps ? 'scanner' : 'keyboard' });
        return;
      }
      if (e.key && e.key.length === 1) {
        const now = performance.now();
        if (last) gaps.push(now - last);
        last = now;
        keys++;
      }
    };
    input.addEventListener('keydown', onKey);
    return () => input.removeEventListener('keydown', onKey);
  }

  NS.wedge = { attachWedge, FAST_GAP_MS, MIN_KEYS, median };
})(typeof window !== 'undefined' ? window : globalThis);
