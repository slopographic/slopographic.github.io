/* SlopIsolate — panel kit: form controls for the settings panel. Every control is a row or a widget
 * with `.input` (the form control) and `.sync(v)` (set the shown value without firing events).
 * sync(v, mixed): mixed = the selected pictures differ here; the control then shows no value (an empty slider thumb,
 * "Mixed"), and touching it sets the value on all of them.
 * CO.kit.look() turns a slider drag into one undo step: the look is snapshotted on the first move. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, h = U.h, t = U.t;
  const K = CO.kit = {};

  const ctl = (el, input, sync) => Object.assign(el, { input, sync });

  /** A titled block of rows (class pp-sec, heading pp-h). */
  K.section = (title, ...kids) => h('section', { class: 'pp-sec' }, h('h3', { class: 'pp-h' }, title), ...kids);
  /** Small grey explanation under a section. */
  K.note = (text) => h('p', { class: 'pp-note' }, text);

  /** Range slider row. onInput runs live while dragging; onCommit runs when the drag ends (change). */
  K.slider = function ({ label, min, max, step, value, fmt = (v) => String(v), onInput, onCommit }) {
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
    const out = h('span', { class: 'pp-val' });
    const row = h('div', { class: 'pp-row' }, h('span', null, label), input, out);
    const sync = (v, mixed) => {
      row.classList.toggle('mixed', !!mixed);
      input.value = String(mixed ? (+min + +max) / 2 : v);
      out.textContent = mixed ? t('cutout.panel.mixed') : fmt(+input.value);
      input.setAttribute('aria-valuetext', out.textContent);
    };
    sync(value == null ? min : value);
    input.addEventListener('input', () => { row.classList.remove('mixed'); out.textContent = fmt(+input.value); input.removeAttribute('aria-valuetext'); if (onInput) onInput(+input.value); });
    input.addEventListener('change', () => { if (onCommit) onCommit(+input.value); });
    return ctl(row, input, sync);
  };

  /** Drop-down row. options: [[value, text], …]. */
  K.select = function ({ label, options, value, onChange }) {
    const sel = h('select', { class: 'inp', 'aria-label': label }, ...options.map(([v, label]) => h('option', { value: v }, label)));
    const sync = (v) => { sel.value = String(v); };
    sync(value);
    sel.addEventListener('change', () => { if (onChange) onChange(sel.value); });
    return ctl(h('div', { class: 'pp-row wide' }, h('span', null, label), sel), sel, sync);
  };

  /** Segmented buttons. options: [[value, text, iconName?], …]. */
  K.seg = function ({ options, value, onChange }) {
    let cur = value;
    const btns = options.map(([v, label, icon], i) => {
      const b = h('button', { type: 'button', class: 'seg-b', 'data-i': i });
      if (icon) b.innerHTML = U.icon(icon);
      b.append(label);
      return b;
    });
    const sync = (v, mixed) => {
      cur = mixed ? null : v;
      wrap.classList.toggle('mixed', !!mixed);
      wrap.title = mixed ? t('cutout.panel.mixed_tip') : '';
      btns.forEach((b, i) => { const on = options[i][0] === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    };
    const wrap = h('div', { class: 'seg', role: 'group' }, ...btns);
    btns.forEach((b, i) => b.addEventListener('click', () => {
      const v = options[i][0];
      if (v === cur) return;
      sync(v);
      if (onChange) onChange(v);
    }));
    sync(value);
    return ctl(wrap, null, sync);
  };

  /** Colour row. onInput runs while the picker moves; onCommit when it closes. */
  K.color = function ({ label, value, onInput, onCommit }) {
    const input = h('input', { type: 'color', 'aria-label': label }), note = h('span', { class: 'pp-mixed' }, t('cutout.panel.mixed'));
    const row = h('div', { class: 'pp-row wide' }, h('span', null, label), h('span', { class: 'color' }, input, note));
    const sync = (v, mixed) => { input.value = v; row.classList.toggle('mixed', !!mixed); };
    sync(value);
    input.addEventListener('input', () => { row.classList.remove('mixed'); if (onInput) onInput(input.value); });
    input.addEventListener('change', () => { if (onCommit) onCommit(input.value); });
    return ctl(row, input, sync);
  };

  /** Checkbox row. */
  K.check = function ({ label, checked, onChange }) {
    const input = h('input', { type: 'checkbox' });
    const sync = (v, mixed) => { input.checked = !!v && !mixed; input.indeterminate = !!mixed; };
    sync(checked);
    input.addEventListener('change', () => { input.indeterminate = false; if (onChange) onChange(input.checked); });
    return ctl(h('label', { class: 'chk' }, input, h('span', null, label)), input, sync);
  };

  /** Colour swatches. 'transparent' is drawn as a chequer. */
  K.swatches = function ({ colors, value, onChange }) {
    const btns = colors.map((c) => h('button', { type: 'button', class: 'sw' + (c === 'transparent' ? ' transparent' : ''), 'data-c': c, 'aria-label': c }));
    btns.forEach((b, i) => { if (colors[i] !== 'transparent') b.style.background = colors[i]; });
    const sync = (v) => btns.forEach((b, i) => { const on = colors[i] === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    btns.forEach((b, i) => b.addEventListener('click', () => { sync(colors[i]); if (onChange) onChange(colors[i]); }));
    sync(value);
    return ctl(h('div', { class: 'swatches', role: 'group' }, ...btns), null, sync);
  };

  /**
   * Look edits for what the panel edits (S.targets(): the image on screen, or every selected picture), through the one
   * code path of ui/edit.js. `path` is the field ('s.threshold', 'bg.color', …: core/settings.js). `label` names the undo
   * step: a key of the app's tables (H.label reads it in the chosen language).
   *  input(v): live change (snapshot on the first move).
   *  commit(): the drag ended, push one undo step for the whole drag (one for all the pictures).
   *  once(v):  a discrete change (check, seg), one undo step.
   */
  K.look = function (label, path) {
    let ses = null;
    return {
      input(v) {
        const items = S.targets();
        if (!items.length) return;
        if (!ses || ses.items.length !== items.length || ses.items.some((it, i) => it !== items[i])) {
          if (ses) ses.commit(label);
          ses = CO.edit.begin(items);
        }
        ses.change({ [path]: v });
      },
      commit() {
        if (ses) ses.commit(label);
        ses = null;
      },
      once(v) {
        const items = S.targets();
        if (items.length) CO.edit.apply(items, { [path]: v }, label);
      },
    };
  };
})();
