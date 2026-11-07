/* Slop Workflows: the tool's DOM, made for one instance (ids are "<ns>-<name>": wf-run for the first tool on a page,
 * wf2-run for the next). Three parts: the list (saved and templates; not in a compact tool, which has "Open ▾" instead),
 * the workflow (name, steps, + Add step) and the side (files, run, progress, results).
 *   markup(ns, { compact, landmark }) → { root, list, main, side, $ } ; $(name) is the element with id <ns>-<name> */
import { h } from '../../../convert/js/ui/dom.js';
import { TEMPLATES, tplKey } from '../core/templates.js';
import { tr, mark } from '../core/text.js';

// a button whose words are marked (data-i18n), so a language change on the page relabels it; attrs: { title: [key, en] }
const btn = (id, key, label, cls = '', more = {}, attrs = null) => {
  const a = {}, keys = {};
  for (const [name, [k, en]] of Object.entries(attrs || {})) { a[name] = tr(k, en); keys[name] = k; }
  return h('button', { type: 'button', class: `sui-btn ${cls}`.trim(), id, ...more, ...a, ...mark(key, attrs ? keys : null) }, tr(key, label));
};
// an element's words: its text and/or attributes, marked the same way
const w = (key, en) => ({ ...mark(key), text: tr(key, en) });
const at = (attrs) => {
  const a = {}, keys = {};
  for (const [name, [k, en]] of Object.entries(attrs)) { a[name] = tr(k, en); keys[name] = k; }
  return { ...a, ...mark(null, keys) };
};

export function markup(ns, { compact = false, landmark = false } = {}) {
  const id = (n) => `${ns}-${n}`;
  const list = compact ? null : h('aside', { class: 'wf-list', id: id('list'), ...at({ 'aria-label': ['workflows.tool.workflows', 'Workflows'] }) },
    h('div', { class: 'wf-list-top' }, btn(id('new'), 'workflows.tool.new', 'New workflow', 'sui-primary'),
      btn(id('import'), 'workflows.tool.import', 'Import…', '', {}, { title: ['workflows.tool.import_tip', 'Open a .slopflow file'] })),
    h('h2', { class: 'wf-lh', ...w('workflows.tool.saved', 'Saved') }), h('ul', { class: 'wf-ul', id: id('saved'), ...at({ 'aria-label': ['workflows.tool.saved_list', 'Saved workflows'] }) }),
    h('h2', { class: 'wf-lh', ...w('workflows.tool.templates', 'Templates') }), h('ul', { class: 'wf-ul', id: id('templates'), ...at({ 'aria-label': ['workflows.tool.templates', 'Templates'] }) }));
  const main = h(landmark ? 'main' : 'div', { class: 'wf-main', id: id('main'), ...(landmark ? {} : at({ 'aria-label': ['workflows.tool.workflow', 'Workflow'] })) },
    compact ? null : h('div', { class: 'wf-phonebar' }, btn(id('back'), 'workflows.tool.back', '‹ Workflows'), btn(id('phone-files'), null, tr('workflows.run.panel', 'Files and run'), 'sui-primary', { 'aria-haspopup': 'dialog' })),
    h('div', { class: 'wf-head' },
      h('label', { class: 'wf-sr', for: id('name'), ...w('workflows.tool.name', 'Workflow name') }),
      h('input', { class: 'sui-input wf-name', id: id('name'), autocomplete: 'off', spellcheck: 'false', maxlength: '120' }),
      h('span', { class: 'wf-count', id: id('count') }), h('span', { class: 'wf-state', id: id('state'), role: 'status' }),
      h('span', { class: 'wf-head-acts' },
        compact ? btn(id('open'), 'workflows.tool.open', 'Open', 'wf-open', { 'aria-haspopup': 'menu' }, { title: ['workflows.tool.open_tip', 'Templates and saved workflows'] }) : null,
        btn(id('undo'), 'workflows.tool.undo', 'Undo', '', { disabled: true }),
        btn(id('export'), 'workflows.tool.export', 'Export', '', {}, { title: ['workflows.tool.export_tip', 'Download as a .slopflow file'] }),
        btn(id('save'), 'workflows.tool.save', 'Save', '', {}, { title: ['workflows.tool.save_tip', 'Save in this browser'] }),
        btn(id('share'), 'workflows.tool.share', 'Share link', '', {}, { title: ['workflows.tool.share_tip', 'Copy a link with this workflow in it'] }))),
    h('section', { class: 'wf-empty', id: id('empty'), 'aria-labelledby': id('empty-h') },
      h('h2', { class: 'wf-h1', id: id('empty-h'), ...w('workflows.tool.empty_h', 'Chain apps into one workflow') }),
      h('p', { class: 'wf-lead', ...w('workflows.tool.empty_lead', 'Run a batch of files through several apps in one go: remove the background, put on your watermark, resize, convert, zip. Every step runs on this device; nothing is uploaded.') }),
      h('p', { class: 'wf-lead', ...w('workflows.tool.empty_start', 'Add a step below, or start from a template:') }),
      h('div', { class: 'wf-tpl-row' }, ...TEMPLATES.map((t) => btn('', tplKey(t, 'name'), t.name, '', { 'data-template': t.id, id: undefined })))),
    h('ol', { class: 'wf-steps', id: id('steps'), hidden: true, ...at({ 'aria-label': ['workflows.tool.steps', 'Steps'] }) }),
    h('div', { class: 'wf-add-row' }, btn(id('add'), 'workflows.tool.add_step', '+ Add step', 'wf-add', {}, { title: ['workflows.tool.add_step_tip', 'Add a step'] })));
  const side = h('aside', { class: 'wf-side', id: id('side'), ...at({ 'aria-label': ['workflows.run.panel', 'Files and run'] }) });
  const root = h('div', { class: 'wf-tool' + (compact ? ' wf-compact' : ''), 'data-wf-ns': ns }, list, main, side);
  return { root, list, main, side, $: (n) => root.querySelector('#' + id(n)) };
}
