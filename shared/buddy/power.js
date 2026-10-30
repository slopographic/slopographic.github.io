// AI power-up: if window.SlopAI (shared/ai/slopai.js) exists and is ready — or becomes ready —
// Sloppo powers up (aura, sparkles, a brain hat, a power-up line). While powered he answers
// "Ask Sloppo" by streaming SlopAI.ask, and now and then comments on the current app. Without the
// AI he searches the app's commands (SlopCmd) or falls back to canned lines. Never loads a model.
import { M, now, changed } from './state.js';
import { say, stream, sparkle } from './fx.js';
import { line, tr } from './lines.js';
import { CFG } from './config.js';
import { context } from './tips.js';

let powered = false, lastComment = now(), off = null, timer = 0;
export const isPowered = () => powered;
const ai = () => (window.SlopAI && typeof window.SlopAI.ask === 'function' ? window.SlopAI : null);
const appName = () => { const a = (window.SLOP_APPS || []).find((x) => x.id === CFG.app); return a ? a.name : CFG.app === 'home' ? 'the Slopographic homepage' : CFG.app; };

function update() {
  const A = ai(), r = !!(A && A.ready);
  if (r === powered) return;
  powered = r;
  M.powered = r;
  if (M.el) M.el.classList.toggle('is-powered', r);
  if (r) { sparkle(); M.squash = 0.8; say(line('power'), 2400, { force: true }); }
  changed();
}
/** Feature-detect SlopAI now and as it appears (it may load after the buddy). */
export function watch() {
  const hook = () => {
    const A = ai();
    if (!A) return false;
    if (!off && A.on) off = A.on('change', update);
    update();
    return true;
  };
  if (!hook()) timer = setInterval(() => { if (hook()) clearInterval(timer); }, 1500);
  else timer = setInterval(update, 3000);
}

/** "Ask Sloppo": an input in his speech bubble. */
export function ask() {
  const form = document.createElement('form');
  form.className = 'say-ask';
  form.innerHTML = '<input type="text" maxlength="200"><button type="submit"></button>';
  const input = form.querySelector('input');
  input.setAttribute('aria-label', tr('ui.buddy.ask_sloppo'));
  input.placeholder = tr('ui.buddy.ask_ph');
  form.querySelector('button').textContent = tr('ui.buddy.ask');
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (q) answer(q); });
  form.addEventListener('keydown', (e) => e.stopPropagation());
  say(tr(powered ? 'ui.buddy.ask_powered' : 'ui.buddy.ask_plain'), 30000, { force: true, node: form });
  setTimeout(() => input.focus(), 30);
}

/** Answer a question: stream from the AI, else search the app's commands, else a canned line. */
export async function answer(q) {
  const A = ai();
  if (powered && A) {
    return stream(A.ask(q, { persona: 'sloppo', system: undefined, history: [{ role: 'user', content: `(I am using ${appName()}.)` }, { role: 'assistant', content: 'SLURP. I am the slop.' }] }), 9000);
  }
  const C = window.SlopCmd;
  const hits = C && C.search ? (C.search(q) || []).slice(0, 3) : [];
  if (hits.length) { say(tr('ui.buddy.try_these'), 12000, { force: true, actions: hits.map((c) => ({ label: c.title || c.id, run: () => C.run(c.id, { source: 'buddy' }) })) }); return 'commands'; }
  say(tr('ui.buddy.no_brain', { line: line('idle') }), 3500, { force: true });
  return 'canned';
}

/** Now and then, a powered Sloppo comments on what you're doing. */
export function maybeComment(force = false) {
  const A = ai();
  if (!powered || !A || (!force && now() - lastComment < 90000)) return false;
  lastComment = now();
  const what = `The user is in ${appName()}.${context() ? ' Sloppo just suggested: ' + context() : ''}`;
  stream(A.comment ? A.comment(what) : A.ask(what, { persona: 'sloppo' }), 6000);
  return true;
}
