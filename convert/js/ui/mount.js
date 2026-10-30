/* Entry point, loaded by the hub and by every converter page. Mounts the tool (mount-tool.js) in each [data-convert-root]:
 *   data-preset="to-jpg" data-from="png"    a single converter, limited to those input kinds
 *   data-defaults='{"format":"jpg"}'         default option values for that converter
 *   (no attributes)                          the full hub */
import { mountTool } from './mount-tool.js';
import { mountCards } from './cards.js';

for (const root of document.querySelectorAll('[data-convert-root]')) {
  const preset = root.dataset.preset ? {
    conv: root.dataset.preset,
    from: root.dataset.from ? root.dataset.from.split(',') : null,
    defaults: root.dataset.defaults ? JSON.parse(root.dataset.defaults) : {},
    note: root.dataset.note || '',
    accept: root.dataset.accept || '',   // the file picker's list, when the page's kinds are not image/* (camera RAW)
  } : null;
  mountTool(root, { preset });
}
// The files the page was opened with (?drive=<id> from Send to…, or a PWA launch) come in through the intake, like a drop.
if (window.SlopIntake && window.SlopIntake.launch && document.querySelector('[data-convert-root]')) window.SlopIntake.launch({ to: 'convert' });

// The hub's conversion cards and their search box (absent on the converter pages).
const cardRoot = document.querySelector('[data-convert-cards]');
if (cardRoot) mountCards(cardRoot, { search: document.getElementById('cv-search'), empty: document.getElementById('cv-cards-empty') });

// The assistant (the hub page loads shared/commands/commands.js): its commands with arguments (ai-commands.js) load when
// first asked, with Slop Drive (shared/hub.js) and shared/commands/sources.js, which find the files add_files takes.
if (window.SlopCmd && window.SlopCmd.provide && document.querySelector('[data-convert-root]')) {
  const one = (rel) => new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
    { src: new URL(rel, import.meta.url).href, async: false, onload: res, onerror: () => rej(new Error('Could not load ' + rel)) })));
  window.SlopCmd.init({ app: 'convert' });
  window.SlopCmd.provide({ prepare: async () => {
    if (!window.SLOP_APPS) await one('../../../shared/apps.js');
    if (!window.SlopHub) await one('../../../shared/hub.js');
    await window.SlopCmd.sources();   // shared/commands/sources.js
    await import('./ai-commands.js');
  } });
}
