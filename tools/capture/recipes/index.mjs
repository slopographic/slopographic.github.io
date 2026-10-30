// Recipes: how to drive each app into a good-looking state for its screenshot and clip.
// A recipe is { url?, mode: 'frames'|'video', len?, clip?, setup(page), warm(page), beforeShot(page),
// frame(page, i, t) (frames mode, before each captured frame), play(page, seconds) (video mode) }.
//   frames: the virtual clock (clock.js) is frozen after setup and stepped 1/30 s per captured frame.
//   video:  Playwright records the page in real time while play() interacts with it.
import apps from './apps.mjs';
import experiments from './experiments.mjs';

const ALL = { ...apps, ...experiments };


/** Generic fallback for apps without a recipe yet (new apps): let it load, then film it. */
const generic = {
  mode: 'video',
  async setup(page) { await page.waitForTimeout(2500); },
  async play(page, s) {
    await page.mouse.move(640, 400);
    await page.mouse.move(820, 300, { steps: 40 });
    await page.waitForTimeout(s * 1000);
  },
};
export function recipeFor(app) { return ALL[app.id] || generic; }
