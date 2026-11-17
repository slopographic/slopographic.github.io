/* PhotoSlop masks tests: the helpers the two masks pages share (masks.test.html and masks-2.test.html). Classic script.
 * The page declares SlopTest's names and calls bootApp() in its first test: the app is in the iframe with id "app". */
  let W, win;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (type, x, y) => new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y });
  /** A drag with the active tool from document point a to b (on the viewport). */
  function drag(a, b) {
    const el = W.eval('V.el'), at = (p) => W.eval(`toScreen(${p.x}, ${p.y})`), r = el.getBoundingClientRect();
    const s = at(a), e = at(b);
    el.dispatchEvent(ev('pointerdown', r.left + s.x, r.top + s.y));
    el.dispatchEvent(ev('pointermove', r.left + (s.x + e.x) / 2, r.top + (s.y + e.y) / 2));
    el.dispatchEvent(ev('pointermove', r.left + e.x, r.top + e.y));
    el.dispatchEvent(ev('pointerup', r.left + e.x, r.top + e.y));
  }
  /** A menu item by its path, e.g. menuItem('Layer', 'Mask', 'Invert'). */
  const menuItem = (...path) => W.eval(`(function () { let items = MENUS.find(function (m) { return m[0] === ${JSON.stringify(path[0])}; })[1], it = null;
    for (const l of ${JSON.stringify(path.slice(1))}) { it = items.find(function (x) { return x && x.label === l; }); if (!it) throw new Error('no menu item ' + l); items = it.sub; }
    return it; })()`);
  const run = (...path) => menuItem(...path).act();
  /** The mask's alpha at a document point; outside its canvas the mask's default applies. */
  const maskAt = (L, x, y) => { const m = L.mask, px = x - m.x, py = y - m.y; if (px < 0 || py < 0 || px >= m.canvas.width || py >= m.canvas.height) return m.def ? 0 : 255; return pixel(m.canvas, px, py)[3]; };
  /** The flattened page (white behind everything) at a document point. */
  const colorAt = (x, y) => pixel(W.flattenCanvas('#ffffff'), x, y);
  /** A 300×200 document with one layer named 'Ink' of the given fill, covering all of it. */
  async function makeDoc(fill = '#000') {
    W.newDocTab(300, 200, '#ffffff', 'Masks'); W.selectTool('move'); W.setColor('fg', '#000000');
    const c = W.mkCanvas(300, 200), g = W.cx(c); g.fillStyle = fill; g.fillRect(0, 0, 300, 200);
    W.addLayer({ name: 'Ink', canvas: c }, 'Add Ink');
    return W.activeLayer();
  }
  /** Replaces the active layer's mask canvas with one drawn by paint(g). */
  function setMaskCanvas(paint, def, label = 'Paint Mask') {
    const L = W.activeLayer(), c = W.mkCanvas(300, 200), g = W.cx(c); paint(g);
    W.setLayerProps(L.id, { mask: Object.assign({}, L.mask || { x: 0, y: 0, enabled: true }, { canvas: c, def: def }) }, label);
  }
  /** [r,g,b,a] of a canvas at (x, y). */
  const pixel = (c, x, y) => [...c.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data];
  const layerNamed = (n) => W.D.layers.find((l) => l.name === n);

  /** Opens the PhotoSlop frame and waits until it is ready; sets W (the app's functions) and win. */
  async function bootApp() {
    win = document.getElementById('app').contentWindow;
    await SlopTest.waitFor(() => win.document && win.document.body && win.document.body.classList.contains('ready'), { timeout: 30000 });
    W = new Proxy({}, { get: (_, k) => win.eval(String(k)) });
  }
