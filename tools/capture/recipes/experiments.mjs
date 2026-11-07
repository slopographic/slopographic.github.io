// Recipes for the experiments (and Paint Classic).
import { wait, until, run, drag, curve, hide, strokeFrames, wave } from './util.mjs';

const rest = (page, s, t) => wait(page, Math.max(0, s * 1000 - (Date.now() - t)));

export default {
  authenticator: {
    mode: 'video', len: 5, url: 'index.html#detector',
    async setup(page) { await wait(page, 1500); },
    async play(page, s) {
      const t = Date.now();
      await page.click('#sample-slop');
      await wait(page, 1800);
      await page.locator('#result').scrollIntoViewIfNeeded().catch(() => {});
      await rest(page, s, t);
    },
    async beforeShot(page) {
      await page.click('#sample-slop').catch(() => {});
      await wait(page, 2500);
      await page.locator('#result').scrollIntoViewIfNeeded().catch(() => {});
      await wait(page, 600);
    },
  },
  'paint-classic': {
    len: 5, shotAfter: true,
    async setup(page) {
      await wait(page, 1500);
      const c = await page.locator('canvas').first().boundingBox();
      const P = (fx, fy) => [c.x + c.width * fx, c.y + c.height * fy];
      this.P = P;
      await page.click('[data-tool="ellipse"]').catch(() => {});
      await page.locator('#palette > *').nth(11).click().catch(() => {});
      await drag(page, [P(0.08, 0.12), P(0.42, 0.82)], { steps: 4 });
      await page.click('[data-tool="fill"]').catch(() => {});
      await page.locator('#palette > *').nth(4).click().catch(() => {});
      await page.mouse.click(...P(0.25, 0.47));
      await page.click('[data-tool="rect"]').catch(() => {});
      await page.locator('#palette > *').nth(5).click().catch(() => {});
      await drag(page, [P(0.55, 0.15), P(0.9, 0.45)], { steps: 4 });
      await page.mouse.move(1270, 790);
    },
    get frame() {
      const P = (fx, fy) => (this.P ? this.P(fx, fy) : [fx * 800 + 90, fy * 500 + 64]);
      const self = this;
      return async (page, i) => strokeFrames([
        { at: 4, pts: curve(0.72, 0.68, 0.12, 0.16, 1.3, 50, 0, 0.5).map(([x, y]) => P(x, y)), before: (p) => p.click('[data-tool="brush"]').then(() => p.locator('#palette > *').nth(9).click()).catch(() => {}) },
        { at: 70, pts: wave(0.06, 0.94, 0.92, 0.03, 70, 3).map(([x, y]) => P(x, y)), before: (p) => p.click('[data-tool="slop"]').catch(() => {}) },
      ])(page, i, self);
    },
  },
};
