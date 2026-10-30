/* PhotoSlop ↔ SlopIsolate: Layer ▸ Isolate Subject sends a layer, one Remove stroke is painted in SlopIsolate,
 * "Send back to PhotoSlop" returns the mask, and PhotoSlop makes it the layer's mask (one undo step, no new layer).
 * Both apps run in frames of this page: window.open is redirected into the SlopIsolate frame. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const ps = document.getElementById('ps'), iso = document.getElementById('iso');
  const P = () => ps.contentWindow, I = () => iso.contentWindow;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let layerId = 0;
  const sent = [];

  /** Alpha of the layer mask at a document point, or -1 when the layer has no mask. */
  const maskAt = (x, y) => P().eval(`(function () {
    const L = D.layers.find(function (l) { return l.id === ${layerId}; }), m = L && L.mask; if (!m) return -1;
    return m.canvas.getContext('2d', { willReadFrequently: true }).getImageData(${x} - m.x, ${y} - m.y, 1, 1).data[3]; })()`);
  /** A 400×300 blue field with a red disc at (200, 150), r = 70: the disc is the subject. */
  function subjectCanvas() {
    const c = P().document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d');
    g.fillStyle = '#2a4fb5'; g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#e8413c'; g.beginPath(); g.arc(200, 150, 70, 0, Math.PI * 2); g.fill();
    return c;
  }

  describe('PhotoSlop and SlopIsolate round trip', () => {
    it('sets up PhotoSlop with a raster layer', async () => {
      await waitFor(() => { try { return P().document.body.classList.contains('ready'); } catch (e) { return false; } }, { timeout: 60000 });
      // The "Send to" tab opens in the SlopIsolate frame, so one test page drives both apps.
      P().open = (url) => { sent.push(url); iso.src = url; return iso.contentWindow; };
      P().eval(`newDocTab(400, 300, '#ffffff', 'Round trip')`);
      P().__subject = subjectCanvas();
      layerId = P().eval(`addLayer({ name: 'Subject', canvas: window.__subject }, 'Add Subject').id`);
      expect(P().eval(`D.layers.find(function (l) { return l.id === ${layerId}; }).canvas.width`)).toBe(400);
    });

    it('Layer ▸ Isolate Subject opens the layer in SlopIsolate and the cut-out is ready', async () => {
      P().eval(`isolateSubject(${layerId})`);
      await waitFor(() => sent.length === 1 && I().CO && I().CO.state && I().CO.state.items.length === 1, { timeout: 20000 });
      await waitFor(() => { const C = I().CO; return C.state.items[0].status === 'done' && !!C.process.active; }, { timeout: 150000 });
      expect(typeof I().CO.state.items[0].request.requestId).toBe('string');
    }, { timeout: 180000 });

    it('one Remove stroke, then Send back to PhotoSlop makes the mask of that layer (one undo step)', async () => {
      const C = I().CO, it = C.state.items[0], before = P().eval('Hist.idx'), layers = P().eval('D.layers.length');
      expect(maskAt(200, 150)).toBe(-1);
      // The Remove brush, with the same calls a pointer stroke makes: live preview, then the stroke's undo entry.
      const st = C.brush.begin(it, 'remove');
      C.process.live(it, C.brush.line(st, 170, 150, 230, 150, 12, 1));
      C.history.push(it, C.brush.end(st));
      await waitFor(() => C.process.active && C.process.active.mask[150 * 400 + 200] < 32, { timeout: 90000 });
      await sleep(200);
      await C.send.mask(it);
      await waitFor(() => maskAt(200, 150) >= 0, { timeout: 20000 });
      expect(maskAt(200, 150) < 32).toBe(true);  // the stroke removed the centre of the disc
      expect(maskAt(150, 150) > 200).toBe(true); // the rest of the disc stays
      expect(maskAt(20, 20) < 32).toBe(true);    // the blue field is out
      expect(P().eval('D.layers.length')).toBe(layers);
      expect(P().eval('Hist.states[Hist.idx].label')).toBe('Isolate Subject');
      expect(P().eval('Hist.idx') - before).toBe(1);
      P().eval('undo()');
      expect(maskAt(200, 150)).toBe(-1);
      P().eval('redo()');
      expect(maskAt(200, 150) < 32).toBe(true);
    }, { timeout: 150000 });

    it('Send to PhotoSlop as a new layer adds the cut-out itself, with alpha', async () => {
      const C = I().CO, it = C.state.items[0], n = P().eval('D.layers.length');
      await C.send.layer(it);
      await waitFor(() => P().eval('D.layers.length') === n + 1, { timeout: 20000 });
      const alphaAt = (x, y) => P().eval(`(function () { const L = D.layers[D.layers.length - 1];
        return L.canvas.getContext('2d', { willReadFrequently: true }).getImageData(${x} - L.x, ${y} - L.y, 1, 1).data[3]; })()`);
      expect(P().eval('D.layers[D.layers.length - 1].name')).toMatch(/^Cut-out/);
      expect(alphaAt(20, 20) < 32).toBe(true);
      expect(alphaAt(150, 150) > 200).toBe(true);
    }, { timeout: 30000 });

    it('a layer that already has a mask asks before it is replaced', async () => {
      let asked = 0;
      P().SlopUI.confirm = () => { asked++; return Promise.resolve(false); };
      const n = sent.length;
      await P().eval(`isolateSubject(${layerId})`);
      expect(asked).toBe(1);
      expect(sent.length).toBe(n);
    });

    it('the Isolate Subject entry is in the Layer menu', () => {
      const names = P().eval(`MENUS.find(function (m) { return m[0] === 'Layer'; })[1].map(function (x) { return x && x.label; })`);
      expect(names).toContain('Isolate Subject…');
    });
  });
})();
