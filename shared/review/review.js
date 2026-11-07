/* SlopReview: a window that lists exactly what a clean-up will change, one checkbox per item, and waits for the person.
 *   SlopReview.open({ title, intro, items: [{ id, label, detail?, size?, group?, checked }], confirmLabel, danger?, columns? })
 * Resolves with the ids left checked (in list order), or null when cancelled (Cancel, Escape, the × button).
 *   confirmLabel: a string (used as it is), or a function (count) => string, e.g. n => `Trash ${n} files`.
 *                 The confirm button is disabled while nothing is checked.
 *   danger:       true for a permanent change (red confirm button).
 *   columns:      1 (default) or 2 list columns on a wide window.
 * Keys: Space toggles the focused row, arrows and Home/End move between rows, Enter never confirms from the list.
 * Long lists are drawn 200 rows at a time, more as the list is scrolled or the arrows go past the last row drawn.
 * Classic script. Needs shared/slopui.js (the dialog) and review.css; the model is in model.js. */
(function (g) {
  'use strict';
  const R = (g.SlopReview = g.SlopReview || {});
  const M = R.model;
  const CHUNK = 200;
  const NEAR_END = 240; // px from the bottom of the list at which the next part is drawn

  const el = (tag, attrs, ...kids) => g.SlopUI.el(tag, attrs, ...kids);
  /** Words: ours are keys (ui.review.*, ui.*, menu.*); an app's title, intro and confirm label may be keys too (SlopI18n.label). */
  const tr = (k, v) => { const I = g.SlopI18n; return I ? I.t(k, v) : k; };
  const lab = (v, vars) => { const I = g.SlopI18n; return I && I.label ? I.label(v, vars) : typeof v === 'function' ? v(vars) : v; };

  /** Builds the list pieces and the dialog. Returns the promise. */
  function open(o) {
    const items = M.normalise(o.items);
    const title = lab(o.title || 'ui.review.title');
    if (!items.length) {
      return new Promise((resolve) => g.SlopUI.dialog({ title, cls: 'sr-dlg', body: el('div', { class: 'sr-body' }, o.intro ? el('p', { class: 'sui-p' }, lab(o.intro)) : null, el('p', { class: 'sui-p' }, tr('ui.review.nothing'))),
        buttons: [{ label: tr('menu.close'), primary: true }], onClose: () => resolve(null) }));
    }
    return new Promise((resolve) => {
      let checked = M.initial(items);
      let result = null;
      const sumEl = el('span', { class: 'sr-sum', role: 'status', 'aria-live': 'polite' });
      const list = el('div', { class: 'sr-list' + (o.columns === 2 ? ' sr-cols-2' : ''), role: 'group', 'aria-label': title });
      const drawn = []; // { cb, id } for each item row drawn so far, in order
      const pending = M.rows(items);
      let at = 0; // next index into pending
      let confirmBtn = null;

      /** Draws the next part of the rows. Returns true when more rows are left. */
      function drawMore(n = CHUNK) {
        const frag = document.createDocumentFragment();
        for (let k = 0; k < n && at < pending.length; k++, at++) {
          const r = pending[at];
          if (r.type === 'group') { frag.append(el('div', { class: 'sr-group', role: 'presentation' }, tr('ui.review.group', { name: r.name, n: r.count }))); continue; }
          const cb = el('input', { type: 'checkbox', 'aria-label': r.item.label });
          cb.checked = checked.has(r.item.id);
          cb.addEventListener('change', () => { checked = M.toggle(checked, r.item.id); refresh(); });
          const text = el('span', { class: 'sr-text' }, el('b', null, r.item.label), r.item.detail ? el('small', null, r.item.detail) : null);
          frag.append(el('label', { class: 'sr-row' }, cb, text, el('span', { class: 'sr-size' }, r.item.size !== undefined ? M.bytes(r.item.size) : '')));
          drawn.push({ cb, id: r.item.id });
        }
        list.append(frag);
        return at < pending.length;
      }
      /** Keeps drawing while the list is short of its scroll range, so a long list always has rows to scroll to. */
      function fill() {
        if (!list.isConnected || !list.clientHeight) return; // closed, or not laid out yet: nothing to fill
        while (at < pending.length && list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_END) drawMore();
      }
      function drawAll() { while (drawMore(CHUNK)); }
      const rowInputs = () => drawn.map((d) => d.cb);

      /** Sets the checked state of every item and redraws the boxes and the footer. */
      function setChecked(next) { checked = next; for (const d of drawn) d.cb.checked = checked.has(d.id); refresh(); }
      function refresh() {
        const s = M.summary(items, checked);
        const of = tr('ui.review.checked', { n: s.count, total: items.length });
        sumEl.textContent = s.hasSizes ? tr('ui.review.checked_size', { checked: of, size: M.bytes(s.total) }) : of;
        if (confirmBtn) {
          confirmBtn.disabled = s.count === 0;
          confirmBtn.textContent = typeof o.confirmLabel === 'function' ? o.confirmLabel(s.count) : lab(o.confirmLabel || 'menu.ok');
        }
      }

      list.addEventListener('scroll', () => { if (at < pending.length && list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_END) drawMore(); });
      list.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.stopPropagation(); return; } // Enter must not confirm while the list has focus
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        const rows = rowInputs(), cur = rows.indexOf(document.activeElement);
        if (cur < 0) return;
        e.preventDefault(); e.stopPropagation();
        let next = cur;
        if (e.key === 'Home') next = 0;
        else if (e.key === 'End') { drawAll(); next = rowInputs().length - 1; }
        else if (e.key === 'ArrowDown') { if (cur + 1 >= rows.length) drawMore(); next = Math.min(cur + 1, rowInputs().length - 1); }
        else next = Math.max(cur - 1, 0);
        const target = rowInputs()[next];
        target.focus({ preventScroll: true });
        target.closest('.sr-row').scrollIntoView({ block: 'nearest' });
      });

      const tool = (label, run) => el('button', { type: 'button', class: 'sui-btn', onclick: () => setChecked(run()) }, label);
      const body = el('div', { class: 'sr-body' },
        o.intro ? el('p', { class: 'sui-p' }, lab(o.intro)) : null,
        el('div', { class: 'sr-tools' },
          tool(tr('ui.select_all'), () => M.selectAll(items)),
          tool(tr('ui.select_none'), () => M.selectNone()),
          tool(tr('ui.review.invert'), () => M.invert(items, checked))),
        list);

      const dlg = g.SlopUI.dialog({ title, cls: 'sr-dlg', body, buttons: [
        { label: tr('menu.cancel') },
        { label: tr('menu.ok'), primary: true, danger: !!o.danger, act: () => { result = M.ids(items, checked); } },
      ], onClose: (ok) => resolve(ok ? result : null) });
      confirmBtn = dlg.box.querySelector('.sui-foot .sui-primary');
      dlg.box.querySelector('.sui-foot').prepend(sumEl);
      drawMore();
      if (drawn[0]) drawn[0].cb.setAttribute('autofocus', '');
      refresh();
      requestAnimationFrame(fill);
    });
  }

  R.open = open;
})(window);
