// Sample mascot overlay for the made-up "Acme Tools" profile (brand/profiles/sample.json): a flat robot head that plays
// the slot's moments with the Web Animations API, so the slot can be tested without WebGL. Sample art for tests, MIT like
// the rest of this repository. The overlay contract: shared/mascot/slot.js; the optional look() and react() hooks:
// shared/mascot/ui.js; travel: shared/mascot/roam.js. Tests: tests/buddy/slot.test.html, tests/buddy/roam.test.html.
import { svg, name } from './icon.js';

export { name };
/** Each animation: keyframes on the head (or a function of the side, -1 left or 1 right), its length (ms), its face. */
const ANIMS = {
  hello: { frames: [{ transform: 'scale(0)' }, { transform: 'scale(1.1)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(8deg)' }, { transform: 'none' }], ms: 1600 },
  working: { frames: [{ transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }], ms: 240 },
  celebrate: { frames: [{ transform: 'none' }, { transform: 'translateY(-24px) rotate(180deg)' }, { transform: 'rotate(360deg)' }], ms: 1200 },
  oops: { frames: [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], ms: 600 },
  sleep: { frames: [{ transform: 'translateY(4px) rotate(6deg)' }, { transform: 'translateY(6px) rotate(6deg)' }], ms: 2400, face: 'asleep' },
  wake: { frames: [{ transform: 'translateY(6px)' }, { transform: 'translateY(-14px)' }, { transform: 'none' }], ms: 900 },
  point: { frames: (s) => [{ transform: 'none' }, { transform: `translateX(${s * 10}px) rotate(${s * -12}deg)` }, { transform: 'none' }], ms: 1800 },
};
export const animations = Object.keys(ANIMS);

export function create(el, { reduce } = {}) {
  const head = document.createElement('div');
  head.innerHTML = svg(80, false);
  Object.assign(head.firstElementChild.style, { width: '72%', height: 'auto' });   // fills a stage of any size (mascot.size)
  Object.assign(head.style, { display: 'grid', placeItems: 'end center', height: '100%', paddingBottom: '8px', boxSizing: 'border-box' });
  el.append(head);
  let run = null;
  return {
    play(anim, { loop = false, side = 0 } = {}) {
      const a = ANIMS[anim];
      if (!a) return Promise.resolve();
      if (run) run.cancel();
      head.dataset.anim = anim;
      head.style.opacity = a.face === 'asleep' ? '.7' : '1';
      if (reduce || typeof head.animate !== 'function') return Promise.resolve();
      run = head.animate(typeof a.frames === 'function' ? a.frames(side || 1) : a.frames, { duration: a.ms, iterations: loop ? Infinity : 1, direction: loop ? 'alternate' : 'normal', easing: 'ease-in-out' });
      return run.finished.then(() => {}, () => {});
    },
    /** The eyes follow the pointer: here the whole flat head leans a little that way. */
    look(dx, dy) { head.dataset.look = `${dx},${dy}`; head.style.translate = `${dx * 3}px ${dy * 3}px`; },
    /** hover: a lighter face; poke: a quick squash; drag: a tilt the way it moves; drop: a small bounce; travel (a
     * roaming slot): the head turns the way it goes while it travels. */
    react(kind, d = {}) {
      if (kind === 'travel') { head.dataset.travel = d.on ? String(d.dx || 0) : ''; head.style.scale = d.on && d.dx ? `${d.dx < 0 ? -1 : 1} 1` : ''; return; }
      head.dataset.react = kind === 'hover' ? (d.on ? 'hover' : '') : kind;
      if (kind === 'hover') { head.style.filter = d.on ? 'brightness(1.08)' : ''; return; }
      if (kind === 'drag') { head.style.rotate = `${Math.max(-12, Math.min(12, (d.dx || 0) * 2))}deg`; return; }
      head.style.rotate = '';
      if (reduce || typeof head.animate !== 'function') return;
      if (kind === 'poke') head.animate([{ scale: '1' }, { scale: '1.08 .92' }, { scale: '1' }], { duration: 260, composite: 'add' });
      if (kind === 'drop') head.animate([{ translate: '0 0' }, { translate: '0 -8px' }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });
    },
    dispose() { if (run) run.cancel(); head.remove(); },
  };
}
