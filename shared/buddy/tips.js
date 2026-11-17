// Clippy mode: context tips per app (keyed by SlopHub app id), with 1-2 buttons that run an app
// command when the app registered one with SlopCmd, plus "Don't show tips again".
import { M, now, pick } from './state.js';
import { say } from './fx.js';
import { line, tr } from './lines.js';
import { CFG } from './config.js';
import { getPrefs, setPrefs } from './prefs.js';

// text: the tip's key (ui.buddy.tip.*, read when it shows). cmd: words to look up in the app's SlopCmd registry; the first match becomes a button.
export const TIPS = {
  photoslop: [
    { text: 'ui.buddy.tip.photo_filter', cmd: 'filter' },
    { text: 'ui.buddy.tip.guides', cmd: 'guides' },
    { text: 'ui.buddy.tip.photo_layer', cmd: 'new layer' },
  ],
  vector: [
    { text: 'ui.buddy.tip.vector_pen', cmd: 'pen' },
    { text: 'ui.buddy.tip.guides', cmd: 'guides' },
  ],
  pdf: [
    { text: 'ui.buddy.tip.pdf_redact', cmd: 'redact' },
    { text: 'ui.buddy.tip.pdf_merge', cmd: 'merge' },
  ],
  label: [
    { text: 'ui.buddy.tip.label_barcode', cmd: 'barcode' },
    { text: 'ui.buddy.tip.label_print', cmd: 'print' },
  ],
  cutout: [{ text: 'ui.buddy.tip.cutout', cmd: 'background' }],
  press: [{ text: 'ui.buddy.tip.press', cmd: 'headline' }],
  slopedit: [{ text: 'ui.buddy.tip.video', cmd: 'title' }],
  drive: [{ text: 'ui.buddy.tip.drive', cmd: 'folder' }],
  ai: [{ text: 'ui.buddy.tip.ai', cmd: null }],
  default: [{ text: 'ui.buddy.tip.palette', cmd: null }, { text: 'ui.buddy.tip.local' }],
};

let shownAt = 0, last = null, current = '';
export const tipsFor = (app = CFG.app) => TIPS[app] || TIPS.default;
export const enabled = () => CFG.tips && getPrefs().tips !== false;
/** The text of the last tip (context for the AI's comments). */
export const context = () => current;

/** Buttons for a tip: the app command it suggests (if the app has one), then the opt-out. */
export function actionsFor(tip) {
  const out = [];
  const C = window.SlopCmd;
  if (tip.cmd && C && C.search) {
    const hit = (C.search(tip.cmd) || [])[0];
    if (hit) out.push({ label: hit.title || tip.cmd, run: () => C.run(hit.id, { source: 'buddy' }) });
  }
  if (!out.length) out.push({ label: tr('ui.buddy.thanks'), run: null });
  out.push({ label: tr('ui.buddy.tips_off'), run: () => { setPrefs({ tips: false }); say(line('tipsoff'), 1600, { force: true }); } });
  return out;
}

/** Show a tip if tips are on and it's been a while. Returns true if one was shown. */
export function maybeTip(force = false) {
  if (!enabled() || !M.visible || M.mode !== 'perched' || M.chaos || M.raging) return false;
  const t = now();
  if (!force && t - shownAt < 60000) return false;
  const list = tipsFor().filter((x) => x !== last);
  const tip = pick(list.length ? list : tipsFor());
  shownAt = t;
  last = tip;
  current = tr(tip.text);
  M.squash = 0.4;
  say(current, 12000, { actions: actionsFor(tip) });
  return true;
}
