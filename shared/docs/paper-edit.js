// In-place editing on the paper view: a click (or Enter on the focused button) on a field turns it into an input; Enter,
// blur or a change commits it to the app (commit(field, index, text)); Escape puts the old text back; Ctrl+Enter ends a
// note. The app does the checking and the saving, through the same path as its form, so the rules are the form's rules.
// Classic script, after paper.js. Exposes window.SlopDocs.paperEdit.
(function (g) {
  'use strict';
  const NS = (g.SlopDocs = g.SlopDocs || {});
  const h = NS.paper.h;
  const SELECT = new Set(['customer']);
  const AREA = new Set(['notes']);
  const DATE = new Set(['date', 'dueDate', 'validUntil']);
  const MAX = { description: 300, notes: 5000, company: 200 };

  /** Replaces a button with an input for its field. o: { canEdit(), customers(), commit(field, index, text), refresh() }. */
  function open(btn, o) {
    const name = btn.dataset.edit;
    const index = btn.dataset.index === undefined ? null : Number(btn.dataset.index);
    const raw = btn.dataset.value ?? '';
    const label = btn.getAttribute('aria-label') || name;
    let input;
    if (SELECT.has(name)) {
      input = h('select', { 'aria-label': label },
        h('option', { value: '', text: g.SlopI18n ? g.SlopI18n.t('biz.pg.choose_customer') : '' }),
        ...o.customers().map((c) => h('option', { value: c.id, text: c.name, selected: c.id === raw })));
    } else if (AREA.has(name)) {
      input = h('textarea', { rows: 3, maxlength: MAX.notes, 'aria-label': label });
      input.value = raw;
    } else {
      input = h('input', { type: DATE.has(name) ? 'date' : 'text', 'aria-label': label, maxlength: MAX[name], inputmode: ['qty', 'unitPrice', 'taxRate', 'discount'].includes(name) ? 'decimal' : undefined });
      input.value = raw;
    }
    input.classList.add('pe-input');
    let done = false;
    /** save: commit the typed text; otherwise the field goes back to what it was. Once only. */
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) o.commit(name, index, input.value);
      else o.refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && (input.tagName !== 'TEXTAREA' || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
    });
    input.addEventListener('blur', () => finish(true));
    if (SELECT.has(name)) input.addEventListener('change', () => finish(true));
    btn.replaceWith(input);
    input.focus();
    if (input.select && input.tagName !== 'SELECT') input.select();
  }

  /** Makes the paper root respond to clicks on its editable fields. Attach once: the paper's content is rebuilt inside it. */
  function attach(root, o) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button.pe[data-edit]');
      if (!btn || !root.contains(btn) || !o.canEdit()) return;
      open(btn, o);
    });
  }

  NS.paperEdit = { attach, open };
})(typeof window !== 'undefined' ? window : globalThis);
