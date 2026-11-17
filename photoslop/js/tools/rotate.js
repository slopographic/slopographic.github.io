/* PhotoSlop: the Rotate View tool (R), as in Photoshop CC. A drag turns the view about the viewport centre, following
 * the pointer's angle round that centre; Shift snaps the angle to 15° steps; a compass (its red needle the document's
 * up) shows while dragging; Esc and Reset View in the options bar return to 0°. Holding R springs to the tool and
 * letting go returns to the tool before it, once the tool was used or R was held for a moment; a quick tap keeps it.
 * One finger turns the view with the tool active; a second finger takes over for the usual pinch (view.js), and the
 * angle goes back to where that drag began. View only, like view-rot.js: the document and its history never see it.
 * Loaded after view-rot.js (V.rot, rotNorm, setRotation) and tools/fill.js (the Hand tool it sits beside). */
'use strict';

const ROT_SNAP = 15, ROT_SPRING_MS = 400;
/** The pointer's angle (degrees) round the viewport centre, or null too near the centre to tell. */
function rotPointerAngle(e) {
  const r = V.el.getBoundingClientRect(), x = e.clientX - r.left - V.W / 2, y = e.clientY - r.top - V.H / 2;
  return Math.hypot(x, y) < 3 ? null : (Math.atan2(y, x) * 180) / Math.PI;
}
/** Sets the view angle with a tenth of a degree (a drag is smooth; setRotation, the slider, keeps whole degrees). */
function setViewAngle(deg) {
  V.rot = Math.round(rotNorm(deg) * 10) / 10 || 0;
  emit('zoom'); dirty();
}
/** The angle a drag asks for: its start plus how far the pointer has turned; Shift snaps it to 15° steps. */
const rotDragAngle = (start, turned, snap) => (snap ? Math.round((start + turned) / ROT_SNAP) * ROT_SNAP : start + turned);

defTool({ id: 'rotate', nk: 'rotate', key: 'R', icon: ICON('M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5M12 8.5 14 12l-2 3.5L10 12z'),
  down(p, e) {
    const a = rotPointerAngle(e);
    this.s = { start: V.rot, last: a, turned: 0 };
    ROT_SPRING.used = true;
    V.el.classList.add('rotating'); dirty();
  },
  move(p, e) {
    const s = this.s; if (!s) return;
    const a = rotPointerAngle(e); if (a == null) return;
    if (s.last == null) { s.last = a; return; }
    s.turned += rotNorm(a - s.last); s.last = a;   // unwrapped, so a drag can go round more than once
    setViewAngle(rotDragAngle(s.start, s.turned, e.shiftKey));
  },
  up() { this.s = null; V.el.classList.remove('rotating'); dirty(); rotSpringBack(); },
  cancel() {   // a second finger (a pinch) or a lost pointer: the angle goes back to where the drag began
    const s = this.s; this.s = null; V.el.classList.remove('rotating');
    if (s) setViewAngle(s.start);
  },
  onKey(e) {
    if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (this.s) this.cancel();
    setRotation(0); return true;
  },
  overlay(g) { if (this.s) drawRotCompass(g); },
});

/** The compass at the viewport centre. The overlay context is already turned with the view, so "up" here is the
 *  document's up: the red needle points there; the angle reads upright on the screen. */
function drawRotCompass(g) {
  const cxp = V.W / 2, cyp = V.H / 2, R = Math.max(28, Math.min(70, Math.min(V.W, V.H) * 0.12));
  g.save();
  g.translate(cxp, cyp);
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
  const w = R * 0.18;
  g.beginPath(); g.moveTo(-w, 0); g.lineTo(0, -R * 0.9); g.lineTo(w, 0); g.closePath(); g.fillStyle = '#e8322b'; g.fill();
  g.beginPath(); g.moveTo(-w, 0); g.lineTo(0, R * 0.9); g.lineTo(w, 0); g.closePath(); g.fillStyle = '#f2f2f2'; g.fill();
  g.rotate((-V.rot * Math.PI) / 180);
  g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 3;
  g.fillText(Math.round(V.rot) + '°', 0, R + 6);
  g.restore();
}

/** The options bar: the angle field and Reset View (chrome.js buildOptions, case 'rotate'). */
function rotateOptions(add) {
  const label = tr('photoslop.tool.rotate_angle');
  const num = h('input', { type: 'number', min: -180, max: 180, step: 1, value: Math.round(V.rot), class: 'opt-num rot-angle', 'aria-label': label });
  num.addEventListener('change', () => setRotation(+num.value || 0));
  const reset = h('button', { class: 'btn rot-reset', type: 'button', onclick: () => setRotation(0) }, tr('photoslop.view.reset'));
  add(h('label', { class: 'opt' }, h('span', null, label), num, h('span', { class: 'opt-u' }, '°')), reset, h('span', { class: 'opt-hint' }, tr('photoslop.tool.rotate_hint')));
}
// One listener for every build of the bar: the field follows the angle unless it is being typed in.
listeners.add((w) => {
  if (w !== 'zoom') return;
  const n = document.querySelector('#options .rot-angle');
  if (n && document.activeElement !== n) n.value = Math.round(V.rot);
});

/* Spring-loaded R: the key's own command (or the legacy handler) selects the tool; this only remembers the tool before
 * it and goes back on the release. Rebinding R elsewhere leaves this idle, since it acts only when R left the tool on. */
const ROT_SPRING = { prev: null, t0: 0, used: false, down: false };
function rotSpringBack() {
  const S = ROT_SPRING;
  if (S.down || !S.prev || TOOL.rotate.s) return;   // R still held, nothing to go back to, or the drag is still on
  const prev = S.prev; S.prev = null;
  if (UI.tool === 'rotate' && TOOL[prev]) selectTool(prev);
}
function rotKeyIsOurs(e) {
  if (e.code !== 'KeyR' || e.ctrlKey || e.metaKey || e.altKey) return false;   // i18n-ignore: key names
  return !((window.SlopUI && SlopUI.openDialogs) || isTyping(e.target) || inMenu(e) || (window.SlopCmd && SlopCmd.isOpen));
}
window.addEventListener('keydown', (e) => {
  if (e.repeat || !rotKeyIsOurs(e)) return;
  Object.assign(ROT_SPRING, { prev: UI.tool === 'rotate' ? null : UI.tool, t0: performance.now(), used: false, down: true });
}, true);
window.addEventListener('keyup', (e) => {
  const S = ROT_SPRING;
  if (e.code !== 'KeyR' || !S.down) return;   // i18n-ignore: key names
  S.down = false;
  if (!S.used && performance.now() - S.t0 < ROT_SPRING_MS) { S.prev = null; return; }   // a tap: the tool stays
  rotSpringBack();   // after a drag still in progress, its up() does this
}, true);
window.addEventListener('blur', () => { ROT_SPRING.down = false; ROT_SPRING.prev = null; });
