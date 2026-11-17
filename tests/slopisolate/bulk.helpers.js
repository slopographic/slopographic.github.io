/* SlopIsolate bulk editing test helpers (window.BK), on top of batch.helpers.js (BT): what a person does in the queue and
 * the settings panel (tick a checkbox, move a slider, pick a background, open the panel's menu), and the full-resolution
 * result of an image (a fresh worker job, freed after) to read its pixels. */
(function () {
  'use strict';
  const { waitFor, sleep } = SlopTest;
  const BK = window.BK = {};
  const D = () => BT.W().document;
  const S = () => BT.CO().state;

  BK.tile = (i) => D().querySelectorAll('#queue .q-item')[i];
  BK.tick = (i) => BK.tile(i).querySelector('.q-chk').click();
  /** A panel row by its label (the first row with that label in the section titled sec). */
  BK.sec = (sec) => [...D().querySelectorAll('#props .pp-sec')].find((x) => x.querySelector('.pp-h').textContent === sec);
  BK.row = (sec, label) => [...BK.sec(sec).querySelectorAll('.pp-row, .chk')].find((r) => r.querySelector('span').textContent.trim() === label);
  const fire = (el, type) => el.dispatchEvent(new (BT.W().Event)(type, { bubbles: true }));
  /** Drag a slider to v (input events, then change: one undo step). */
  BK.slide = (sec, label, v) => { const i = BK.row(sec, label).querySelector('input'); i.value = String(v); fire(i, 'input'); fire(i, 'change'); };
  BK.seg = (sec, label) => [...BK.sec(sec).querySelectorAll('.seg-b')].find((b) => b.textContent === label).click();
  BK.colour = (sec, label, v) => { const i = BK.row(sec, label).querySelector('input[type=color]'); i.value = v; fire(i, 'input'); fire(i, 'change'); };
  BK.check = (sec, label) => BK.row(sec, label).querySelector('input').click();
  /** Open the settings panel's menu and pick an item. */
  BK.menu = async function (label) {
    D().getElementById('btnPanelMenu').click();
    const row = await waitFor(() => [...D().querySelectorAll('.sui-menu .sui-row')].find((r) => r.textContent.trim().startsWith(label)), { timeout: 3000 });
    row.click();
    await sleep(50);
  };
  BK.menuLabels = function () {
    D().getElementById('btnPanelMenu').click();
    const out = [...D().querySelectorAll('.sui-menu .sui-row')].map((r) => r.textContent.trim());
    BT.W().SlopUI.closeMenu();
    return out;
  };

  /** The full-resolution picture of an image (background, shadow, crop, edges), as RGBA. */
  BK.picture = async function (it) {
    const P = BT.CO().process, act = await P.build(it);
    try {
      const c = BT.CO().compose.render(it, act);
      return { w: c.width, h: c.height, d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, mask: act.mask.slice() };
    } finally { if (act.bitmap && act.bitmap.close) act.bitmap.close(); BT.W().SlopCutout.release(act.jobId); }
  };
  BK.px = (p, x, y) => Array.from(p.d.slice((y * p.w + x) * 4, (y * p.w + x) * 4 + 4));
  /** Pixels with mask above 128. */
  BK.solid = (mask) => { let n = 0; for (let i = 0; i < mask.length; i++) if (mask[i] > 128) n++; return n; };
  /** Background pixels (mask 0) darker than the background colour: the drop shadow spilling out around the subject. */
  BK.shadowed = function (p, bg) {
    let n = 0;
    for (let i = 0; i < p.mask.length; i++) if (p.mask[i] === 0 && (p.d[i * 4] < bg[0] - 20 || p.d[i * 4 + 2] < bg[2] - 20)) n++;
    return n;
  };
  /** The tile picture of an image (render/thumbs.js), as RGBA of its top-left pixel. */
  BK.tileCorner = (it) => { const c = BT.CO().thumbs.of(it); return c ? Array.from(c.getContext('2d').getImageData(0, 0, 1, 1).data) : null; };
  /** Count the model runs from now on. */
  BK.spy = function () {
    const SC = BT.W().SlopCutout, runs = [], orig = SC.removeBackground;
    SC.removeBackground = function (file, opts) { runs.push({ name: file.name, model: opts && opts.model }); return orig.apply(this, arguments); };
    runs.stop = () => { SC.removeBackground = orig; };
    return runs;
  };
  BK.looks = () => S().items.map((it) => JSON.stringify([it.s, it.bg, it.shadow, it.crop]));
})();
