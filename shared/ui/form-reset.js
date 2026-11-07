// Reset for forms. snapshot(form) remembers every field's value now; reset(form) puts those values back.
// When the form has edits, reset asks first with SlopUI.confirm. Works on any container: a <form>, a
// SlopUI dialog body, or a plain div. Snapshots live in a WeakMap, so nothing is added to the DOM.
// Exposes window.SlopFormReset: snapshot, reset, isDirty, dialogButton.
(function (g) {
  'use strict';
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const store = new WeakMap();
  const skip = (el) => el.disabled || ['button', 'submit', 'reset', 'file', 'hidden', 'image'].includes(el.type);
  const fields = (root) => [...root.querySelectorAll('input, select, textarea')].filter((el) => !skip(el));
  // Segmented controls: a group of buttons where one is pressed (aria-pressed), as in SlopLabel's seg rows.
  const toggles = (root) => [...root.querySelectorAll('[role="group"] > button[aria-pressed]')];
  const isCheck = (el) => el.type === 'checkbox' || el.type === 'radio';
  const valueOf = (el) => (isCheck(el) ? el.checked : el.value);
  const pressed = (b) => b.getAttribute('aria-pressed') === 'true';
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

  /** Remembers the current values of the fields in `root`. Call it once the form is built. */
  function snapshot(root) {
    const snap = { fields: new Map(fields(root).map((el) => [el, valueOf(el)])), toggles: new Map(toggles(root).map((b) => [b, pressed(b)])) };
    store.set(root, snap);
    return snap;
  }
  /** True when a field or a segmented control differs from the snapshot. */
  function isDirty(root) {
    const s = store.get(root);
    if (!s) return false;
    for (const [el, v] of s.fields) if (el.isConnected && valueOf(el) !== v) return true;
    for (const [b, p] of s.toggles) if (b.isConnected && pressed(b) !== p) return true;
    return false;
  }
  /**
   * Restores the snapshot. With edits, asks first (SlopUI.confirm). Restored fields fire input and change
   * events, so the form's own handlers run again. Resolves true when the values were restored.
   */
  async function reset(root, { confirm = true } = {}) {
    const s = store.get(root);
    if (!s) return false;
    if (confirm && isDirty(root)) {
      const ask = g.SlopUI ? g.SlopUI.confirm(tr('ui.dlg.reset_form', 'Reset this form?'), tr('ui.dlg.reset_form_body', 'Your edits will be lost. The values from when the form opened come back.'), tr('ui.reset', 'Reset'), { danger: true })
        : Promise.resolve(g.confirm(tr('ui.dlg.reset_form_plain', 'Reset this form? Your edits will be lost.')));
      if (!(await ask)) return false;
    }
    for (const [el, v] of s.fields) {
      if (!el.isConnected || valueOf(el) === v) continue;
      if (isCheck(el)) el.checked = v; else el.value = v;
      fire(el, 'input'); fire(el, 'change');
    }
    for (const [b, p] of s.toggles) if (b.isConnected && pressed(b) !== p) b.click();
    return true;
  }
  /** A SlopUI dialog button that resets the form in `root` and keeps the dialog open. */
  function dialogButton(root, label = tr('ui.reset', 'Reset')) {
    return { label, act: () => reset(root).then(() => false) };
  }

  g.SlopFormReset = { snapshot, reset, isDirty, dialogButton };
})(typeof window !== 'undefined' ? window : globalThis);
