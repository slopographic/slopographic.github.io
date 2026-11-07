/* The block menu for Slop Notes: Heading, Table, Video link, Image, Code block, Checklist, Quote, Divider, Callout and Link.
 * Each block is plain Markdown written at the caret of the source (insertAtCaret in editor.js), so it survives export and
 * reopening. The dialogs are SlopUI dialogs. A block whose value is missing or wrong is not inserted; the dialog says why. */
import { insertAtCaret } from './editor.js';
import { blankTable } from './table.js';
import { videoCard } from './video.js';
import { t } from './dom.js';

const el = (tag, attrs, ...kids) => SlopUI.el(tag, attrs, ...kids);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const whole = (s, lo, hi) => { const n = Number(s); return Number.isInteger(n) && n >= lo && n <= hi ? n : 0; };
const MAX_IMAGE = 2 * 1024 * 1024;

/** A dialog with named fields: spec maps a name to { label, type: 'text' | 'number', value, min, max, placeholder }.
 * read(values) returns the result, or false to keep the dialog open (after a toast). Resolves with the result, or null. */
function form(title, ok, spec, read) {
  const inputs = {};
  const rows = Object.entries(spec).map(([k, o]) => {
    inputs[k] = o.type === 'number'
      ? SlopUI.number(o.value, o.min, o.max)
      : el('input', { class: 'sui-input', type: 'text', value: o.value || '', placeholder: o.placeholder || '' });
    return SlopUI.field(o.label, inputs[k]);
  });
  return new Promise((res) => {
    let out = null;
    SlopUI.dialog({
      title, body: el('div', { class: 'nt-form' }, ...rows),
      buttons: [{ label: t('menu.cancel') }, { label: ok, primary: true, act: () => {
        const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, String(i.value).trim()]));
        const r = read(values);
        if (r === false) return false;
        out = r;
      } }],
      onClose: (done) => res(done ? out : null),
    });
  });
}

const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

export async function addHeading(level) {
  const txt = await SlopUI.prompt(t('notes.block.heading_n', { n: String(level) }), t('notes.block.heading_text'), '', { ok: t('notes.block.insert') });
  if (txt == null || !clean(txt)) return;
  insertAtCaret('#'.repeat(level) + ' ' + clean(txt));
}

export async function addTable() {
  const v = await form(t('notes.block.table_title'), t('notes.block.insert'), {
    rows: { label: t('notes.block.rows'), type: 'number', value: 2, min: 1, max: 50 },
    cols: { label: t('notes.block.cols'), type: 'number', value: 3, min: 1, max: 10 },
  }, (x) => {
    const rows = whole(x.rows, 1, 50), cols = whole(x.cols, 1, 10);
    if (!rows || !cols) { SlopUI.toast(t('notes.block.table_range')); return false; }
    return { rows, cols };
  });
  if (v) insertAtCaret(blankTable(v.rows, v.cols));
}

export async function addVideo() {
  const v = await form(t('notes.block.video_title'), t('notes.block.insert'), {
    url: { label: t('notes.block.video_url'), type: 'text', placeholder: 'https://' },
    title: { label: t('notes.block.video_name'), type: 'text' },
  }, (x) => {
    const card = videoCard(x.url, x.title);
    if (!card) { SlopUI.toast(t('notes.block.video_bad')); return false; }
    return card;
  });
  if (v) insertAtCaret(v);
}

/** A picture from the computer, kept in the note as a data URL (PNG, JPEG, GIF or WebP, up to 2 MB): the page's one way
 *  in for files (shared/intake, spec 'notes'), from Insert ▸ Image… or a pasted picture outside the text. */
function registerIntake() {
  if (window.SlopIntake.spec('notes')) return;
  window.SlopIntake.register({
    id: 'notes', limit: 1, accept: { types: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'], noun: 'notes.block.picture_noun', maxBytes: MAX_IMAGE },
    process: async (file) => {
      const url = await readAsDataURL(file);
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]()<>"\n]/g, ' ').trim() || 'Image';
      if (insertAtCaret('![' + alt + '](' + url + ')') === false) throw new Error(t('notes.block.no_note', { name: file.name }));   // shown to the person (the intake's row)
      return file.name;
    },
  });
}
if (globalThis.SlopIntake) registerIntake();
export function addImage() { return window.SlopIntake.pick({ to: 'notes', multiple: false, accept: 'image/png,image/jpeg,image/gif,image/webp' }); }

export async function addCode() {
  const v = await form(t('notes.block.code_title'), t('notes.block.insert'), {
    lang: { label: t('notes.block.code_lang'), type: 'text', placeholder: 'js, python, css…' },
  }, (x) => ({ lang: x.lang.replace(/[^\w+#.-]/g, '').slice(0, 20) }));
  if (!v) return;
  const head = '```' + v.lang + '\n';
  insertAtCaret(head + '\n```', [head.length, head.length]);
}

export async function addChecklist() {
  const txt = await SlopUI.prompt(t('notes.block.checklist'), t('notes.block.one_per_line'), '', { ok: t('notes.block.insert'), multiline: true });
  if (txt == null) return;
  const items = String(txt).split('\n').map(clean).filter(Boolean);
  if (items.length) insertAtCaret(items.map((s) => '- [ ] ' + s).join('\n'));
}

export async function addQuote() {
  const txt = await SlopUI.prompt(t('notes.block.quote'), t('notes.block.quoted'), '', { ok: t('notes.block.insert'), multiline: true });
  if (txt == null) return;
  const lines = String(txt).split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length) insertAtCaret(lines.map((s) => '> ' + s).join('\n'));
}

/** The callout kinds: the dialog title's key and the menu item's key. */
const CALLOUT = { NOTE: ['notes.block.callout_note', 'notes.block.m_note'], TIP: ['notes.block.callout_tip', 'notes.block.m_tip'], WARNING: ['notes.block.callout_warning', 'notes.block.m_warning'] };

/** A callout: a quote that starts with its [!KIND] marker (NOTE, TIP or WARNING). */
export async function addCallout(kind) {
  const txt = await SlopUI.prompt(t(CALLOUT[kind][0]), t('notes.block.text'), '', { ok: t('notes.block.insert'), multiline: true });
  if (txt == null) return;
  const lines = String(txt).split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length) insertAtCaret(['> [!' + kind + ']', ...lines.map((s) => '> ' + s)].join('\n'));
}

export async function addLink() {
  const v = await form(t('notes.block.link'), t('notes.block.insert'), {
    text: { label: t('notes.block.text'), type: 'text' },
    url: { label: t('notes.block.web_address'), type: 'text', placeholder: 'https://' },
  }, (x) => {
    const url = x.url;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) { SlopUI.toast(t('notes.block.link_bad')); return false; }
    const safe = url.replace(/[()\s]/g, (c) => ({ '(': '%28', ')': '%29', ' ': '%20' })[c]);
    return { text: clean(x.text).replace(/[[\]]/g, '') || url, url: safe };
  });
  if (v) insertAtCaret('[' + v.text + '](' + v.url + ')');
}

/** The items of the block menu (the Insert block button and the right-click menu of the source). */
export function blockItems() {
  return [
    { label: t('notes.block.heading'), sub: [1, 2, 3].map((n) => ({ label: t('notes.block.heading_n', { n: String(n) }), act: () => addHeading(n) })) },
    { label: t('notes.block.m_table'), act: addTable },
    { label: t('notes.block.m_video'), act: addVideo },
    { label: t('notes.block.m_image'), act: addImage },
    { label: t('notes.block.m_code'), act: addCode },
    { label: t('notes.block.m_checklist'), act: addChecklist },
    { label: t('notes.block.m_quote'), act: addQuote },
    { label: t('notes.block.divider'), act: () => insertAtCaret('---') },
    { label: t('notes.block.callout'), sub: ['NOTE', 'TIP', 'WARNING'].map((k) => ({ label: t(CALLOUT[k][1]), act: () => addCallout(k) })) },
    { label: t('notes.block.m_link'), act: addLink },
  ];
}
