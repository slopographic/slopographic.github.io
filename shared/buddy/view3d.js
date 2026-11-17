// The optional 3D Sloppo: three.js is only loaded (dynamic import) when the HUD's "3D" toggle is on.
import { M, changed } from './state.js';
import { CW, CH, BASE } from './look.js';
import { say } from './fx.js';
import { tr } from './lines.js';

let r3d = null, loading = false;
export const renderer3d = () => r3d;

export async function set3d(on) {
  if (loading) return false;
  if (!on) {
    if (r3d) { r3d.dispose(); r3d = null; }
    M.is3d = false;
    M.el.classList.remove('is-3d');
    changed();
    return true;
  }
  loading = true;
  try {
    const mod = await import('./three3d.js');
    r3d = mod.create(M.el, CW, CH, BASE);
    M.is3d = true;
    M.el.classList.add('is-3d');
    M.el.insertBefore(r3d.canvas, M.stars);
  } catch (e) {
    r3d = null;                       // no WebGL: stay 2D, quietly
    M.is3d = false;
    say(tr('ui.buddy.best_side'), 1500);
  }
  loading = false;
  changed();
  return M.is3d;
}
