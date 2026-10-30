/* Slop Workflows: the pipeline, one card per step (one set per tool instance). A card has the step's picture (SlopFlow: the kinds it
 * takes → the kinds it makes), its name and app, "Keep these files", Remove, its options inline (File convert's own option
 * fields, convert/js/ui/options.js, from the operation's option schema) and, when the step cannot take what the step
 * before makes, the reason (core/compat.js). Reorder: drag a card by its grip, or focus the grip and press Alt+Up /
 * Alt+Down (Up and Down alone on the grip work too). Every change is one Undo step (state.js edit).
 *   createSteps(ctx, listEl) → { render(), checks() }   checks(): the compat result for the files now in
 *   checksOf(ctx) the same, for a tool's other parts */
import { renderOptions, readOptions } from '../../../convert/js/ui/options.js';
import { check } from '../core/compat.js';
import { h } from '../../../convert/js/ui/dom.js';
import { tr, mark } from '../core/text.js';

const secretKeys = (op) => op.options.filter((o) => o.type === 'password').map((o) => o.key);
/** The compat check of a tool's steps against its files; a step's passwords (this visit only) count as its options. */
export const checksOf = ({ S, R }) => check(S.doc.steps.map((s) => (S.secrets[s.uid] ? { ...s, options: { ...s.options, ...S.secrets[s.uid] } } : s)), S.files.map((f) => f.kind), R);

export function createSteps(ctx, host) {
  const { S, R, on, edit, ns } = ctx;
  const cards = new Map();   // uid → the card's parts
  const openOpts = new Set();
  let dragFrom = -1;
  const checks = () => checksOf(ctx);

  function move(from, to) {
    if (to < 0 || to >= S.doc.steps.length || from === to) return;
    const name = (R.byId(S.doc.steps[from].id) || { label: tr('workflows.step.step', 'step') }).label;
    edit(tr('workflows.undo.move', 'Move {name}', { name }), (d) => { const [s] = d.steps.splice(from, 1); d.steps.splice(to, 0, s); });
  }
  function remove(i) {
    const name = (R.byId(S.doc.steps[i].id) || { label: tr('workflows.step.step', 'step') }).label;
    edit(tr('workflows.undo.remove', 'Remove {name}', { name }), (d) => { d.steps.splice(i, 1); });
  }

  /** The option values a card shows: the defaults, the step's own, and this visit's passwords. */
  const valuesOf = (op, s) => ({ ...R.defaultsOf(op), ...(s.options || {}), ...(S.secrets[s.uid] || {}) });

  function onOptions(uid, op, box) {
    const i = S.doc.steps.findIndex((s) => s.uid === uid);
    if (i < 0) return;
    const read = readOptions(box, op.options, `${ns}-${uid}-`), secret = secretKeys(op), keep = {}, pw = {};
    const defs = R.defaultsOf(op);
    for (const [k, v] of Object.entries(read)) {
      if (secret.includes(k)) { if (v) pw[k] = v; continue; }
      if (v !== undefined && v !== defs[k]) keep[k] = v;
    }
    S.secrets[uid] = pw;
    const card = cards.get(uid);
    if (card) card.optsKey = JSON.stringify(valuesOf(op, { ...S.doc.steps[i], options: keep }));
    edit(tr('workflows.undo.change', 'Change {name}', { name: op.label }), (d) => { d.steps[i].options = keep; });
    render();   // a password does not change the document, but it changes the step's check
  }

  function card(s, i, r) {
    const op = r.op, uid = s.uid;
    let c = cards.get(uid);
    if (!c) {
      const flow = globalThis.SlopFlow.create({ from: 'file', to: 'file', size: 'sm' });
      const grip = h('button', { type: 'button', class: 'wf-grip' }, '⋮⋮');
      const num = h('span', { class: 'wf-num', 'aria-hidden': 'true' });
      const title = h('h3', { class: 'wf-step-t' }), app = h('span', { class: 'wf-app' });
      const keep = h('input', { type: 'checkbox', class: 'wf-keep-box' });
      const x = h('button', { type: 'button', class: 'sui-btn wf-x' }, '×');
      const desc = h('p', { class: 'wf-desc' });
      const box = h('div', { class: 'wf-opt-grid' });
      const sum = h('summary', { class: 'wf-opt-sum' });
      const det = h('details', { class: 'wf-opts' }, sum, box);
      const problem = h('p', { class: 'wf-problem', role: 'alert' });
      const el = h('li', { class: 'wf-step', 'data-uid': uid },
        h('div', { class: 'wf-step-top' }, grip, num, flow.el, h('div', { class: 'wf-step-name' }, title, app),
          h('label', { class: 'wf-keep' }, keep, ' ', h('span', { ...mark('workflows.step.keep'), text: tr('workflows.step.keep', 'Keep these files') })), x),
        desc, det, problem);
      c = { el, flow, grip, num, title, app, keep, x, desc, box, det, sum, problem, optsKey: '' };
      cards.set(uid, c);
      grip.addEventListener('pointerdown', () => { el.draggable = true; });
      el.addEventListener('dragstart', (e) => { dragFrom = S.doc.steps.findIndex((t) => t.uid === uid); el.classList.add('wf-dragging'); try { e.dataTransfer.setData('text/plain', uid); e.dataTransfer.effectAllowed = 'move'; } catch (x2) { /* old browser */ } });
      el.addEventListener('dragend', () => { el.draggable = false; el.classList.remove('wf-dragging'); dragFrom = -1; });
      grip.addEventListener('keydown', (e) => {
        const at = S.doc.steps.findIndex((t) => t.uid === uid);
        const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (!d) return;
        e.preventDefault();
        move(at, at + d);
        const again = cards.get(uid);
        if (again) again.grip.focus();
      });
      keep.addEventListener('change', () => { const at = S.doc.steps.findIndex((t) => t.uid === uid); edit(keep.checked ? tr('workflows.undo.keep', 'Keep files') : tr('workflows.undo.no_keep', 'Do not keep files'), (d) => { if (keep.checked) d.steps[at].keep = true; else delete d.steps[at].keep; }); });
      x.addEventListener('click', () => remove(S.doc.steps.findIndex((t) => t.uid === uid)));
      det.addEventListener('toggle', () => { if (det.open) openOpts.add(uid); else openOpts.delete(uid); });
      box.addEventListener('change', () => onOptions(uid, R.byId(S.doc.steps.find((t) => t.uid === uid).id), box));
      if (op && op.options.length && (S.doc.steps.length <= 3 || openOpts.size === 0)) openOpts.add(uid);
    }
    const n = S.doc.steps.length, label = op ? op.label : s.id;
    c.num.textContent = String(i + 1);
    c.grip.title = tr('workflows.step.grip_tip', 'Drag to move, or Alt+↑ and Alt+↓');
    c.title.textContent = label;
    c.app.textContent = op ? R.appLabel(op.app) + (op.kind === 'macro' ? ' · ' + tr('workflows.step.macro', 'macro') : '') : tr('workflows.step.na', 'Not available');
    c.grip.setAttribute('aria-label', tr('workflows.step.grip', 'Move step {n}, {name} (Alt+Up or Alt+Down)', { n: String(i + 1), name: label }));
    c.x.setAttribute('aria-label', tr('workflows.step.remove', 'Remove step {n}, {name}', { n: String(i + 1), name: label }));
    c.x.title = tr('workflows.step.remove_tip', 'Remove this step');
    c.keep.checked = !!s.keep;
    c.keep.disabled = i === n - 1;
    c.keep.setAttribute('aria-label', tr('workflows.step.keep_label', 'Keep the files step {n} makes', { n: String(i + 1) }));
    c.el.setAttribute('aria-label', tr('workflows.step.label', 'Step {i} of {n}: {name}', { i: String(i + 1), n: String(n), name: label }));
    c.el.classList.toggle('wf-bad', !r.ok);
    c.flow.set({ from: r.in && r.in.length ? r.in.slice(0, 4) : op && !op.from.includes('*') ? op.from.slice(0, 4) : 'file', to: r.out && r.out.length ? r.out.slice(0, 4) : 'file',
      label: tr('workflows.step.flow', '{name}: {from} to {to}', { name: label, from: r.in ? r.in.join(', ').toUpperCase() : tr('workflows.step.any', 'any file'), to: r.out ? r.out.join(', ').toUpperCase() : tr('workflows.step.same', 'the same kind') }) });
    c.desc.textContent = op ? op.description || op.note || '' : tr('workflows.step.na_desc', 'This step is not available here. Remove it, or open the workflow where it was made.');
    c.desc.hidden = !c.desc.textContent;
    c.problem.textContent = r.message || '';
    c.problem.hidden = !r.message;
    if (op && op.options.length) {
      c.det.hidden = false;
      c.det.open = openOpts.has(s.uid);
      const vals = valuesOf(op, s), key = JSON.stringify(vals);
      if (key !== c.optsKey) { renderOptions(c.box, op.options, vals, `${ns}-${s.uid}-`); c.optsKey = key; }
      const defs = R.defaultsOf(op), changed = Object.keys(s.options || {}).filter((k) => s.options[k] !== defs[k]).length;
      c.sum.textContent = changed ? tr('workflows.step.options_n', 'Options · {n} changed', { n: changed }) : tr('workflows.step.options', 'Options');
    } else { c.det.hidden = true; c.sum.textContent = tr('workflows.step.options', 'Options'); }
    return c.el;
  }

  function render() {
    const res = checks();
    const keepUids = new Set(S.doc.steps.map((s) => s.uid));
    for (const uid of [...cards.keys()]) if (!keepUids.has(uid)) { cards.get(uid).el.remove(); cards.delete(uid); }
    const els = S.doc.steps.map((s, i) => card(s, i, res[i]));
    els.forEach((el, i) => { if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null); });
    host.hidden = !els.length;
    return res;
  }

  /** The step cards follow a run: the picture of a step marches while it works and ticks (or turns red) when done. */
  function onUnit(u) {
    const s = S.doc.steps[u.step - 1], c = s && cards.get(s.uid);
    if (!c) return;
    if (u.state === 'run') { c.flow.state('run'); if (u.fraction != null) c.flow.progress(u.fraction); }
    else if (u.state === 'error') { c.flow.state('error'); c.el.dataset.err = '1'; }
    else if (u.state === 'done' && c.el.dataset.err !== '1') c.flow.state('done');
  }

  host.addEventListener('dragover', (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    const over = e.target.closest && e.target.closest('.wf-step');
    for (const c of cards.values()) c.el.classList.toggle('wf-drop', c.el === over);
  });
  host.addEventListener('drop', (e) => { // intake-ok: a step card moved in the list, not a file
    if (dragFrom < 0) return;
    e.preventDefault();
    const over = e.target.closest && e.target.closest('.wf-step');
    for (const c of cards.values()) c.el.classList.remove('wf-drop');
    const to = over ? S.doc.steps.findIndex((t) => t.uid === over.dataset.uid) : S.doc.steps.length - 1;
    move(dragFrom, to);
  });
  on('doc', render);
  on('files', render);
  on('unit', onUnit);
  on('run-start', () => { for (const c of cards.values()) { c.flow.state('idle'); c.el.dataset.err = ''; } });
  return { render, checks };
}
