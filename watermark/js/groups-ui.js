/* Slop Watermark: the groups list. One row per shape group: the first file's thumbnail, the count and size range,
 * and the group's own setting (off until the person turns it on): position, size (a scale of the shared size) and opacity. Rows are reused between renders, so a slider keeps
 * its focus while it is dragged. Classic script. Exposes window.WMGroupsUI.render(). */
(function () {
  'use strict';
  const $ = window.WMUtil.$;
  const el = (tag, attrs, ...kids) => window.SlopUI.el(tag, attrs, ...kids);
  const G = window.WMGroups;
  const POS = window.SlopWatermarkSpec.POSITION_LABELS;
  /** A word that follows a language change by itself (marked: shared/i18n apply()). */
  const word = (tag, key, attrs) => el(tag, Object.assign({ 'data-i18n': key }, attrs || {}), window.WMUtil.t(key));

  function makeRow(kind) {
    return el('li', { class: 'wm-group', 'data-kind': kind },
      el('img', { class: 'wm-thumb', alt: '', loading: 'lazy', decoding: 'async' }),
      el('div', { class: 'wm-meta' },
        el('strong', { class: 'wm-gname' }),
        el('label', { class: 'wm-check' }, el('input', { type: 'checkbox', 'data-f': 'on' }), word('span', 'watermark.group.own')),
        el('div', { class: 'wm-gset' },
          el('label', { class: 'wm-field' }, word('span', 'watermark.group.position'),
            el('select', { class: 'sui-input', 'data-f': 'position' }, ...Object.keys(POS).map((p) => word('option', 'watermark.pos.' + p, { value: p })))),
          el('label', { class: 'wm-field' }, word('span', 'watermark.group.size'),
            el('span', { class: 'wm-range' }, el('input', { type: 'range', min: G.SCALE.min * 100, max: G.SCALE.max * 100, step: G.SCALE.step * 100, 'data-f': 'scale' }), el('output', { 'data-f': 'scale-out' }))),
          el('label', { class: 'wm-field' }, word('span', 'watermark.group.opacity'),
            el('span', { class: 'wm-range' }, el('input', { type: 'range', min: 0, max: 100, step: 1, 'data-f': 'opacity' }), el('output', { 'data-f': 'opacity-out' }))))));
  }

  /** Sets a control's value only when it differs, so the browser keeps the slider where the person has it. */
  function put(input, value) { if (input.value !== String(value)) input.value = value; }

  /** Brings one row in line with its group and the setup. */
  function update(li, g) {
    const ov = window.WMSettings.group(g.kind), on = ov.on === true;
    const img = li.querySelector('img');
    if (img.dataset.src !== g.first.url) { img.dataset.src = g.first.url; img.src = g.first.url; }
    li.querySelector('.wm-gname').textContent = g.text;
    li.querySelector('[data-f="on"]').checked = on;
    const sel = li.querySelector('[data-f="position"]'); put(sel, ov.position); sel.disabled = !on;
    const range = li.querySelector('[data-f="scale"]');
    put(range, Math.round(ov.scale * 100)); range.disabled = !on;
    li.querySelector('[data-f="scale-out"]').textContent = Math.round(ov.scale * 100) + '%';
    const op = li.querySelector('[data-f="opacity"]'); put(op, Math.round(ov.opacity * 100)); op.disabled = !on;
    li.querySelector('[data-f="opacity-out"]').textContent = Math.round(ov.opacity * 100) + '%';
    li.querySelector('.wm-gset').classList.toggle('is-off', !on);
  }

  /** Rebuilds the list from the pictures: one row per group that has pictures, in KINDS order. */
  function render() {
    const groups = G.summarise(window.WMItems.all()), list = $('wm-group-list');
    $('wm-groups').hidden = !groups.length;
    const rows = new Map([...list.children].map((li) => [li.dataset.kind, li]));
    for (const g of groups) {
      let li = rows.get(g.kind);
      if (!li) { li = makeRow(g.kind); }
      rows.delete(g.kind);
      list.appendChild(li);
      update(li, g);
    }
    for (const li of rows.values()) li.remove();
  }

  /** A change on a group's controls is that group's override. The page's own change handler then redraws. */
  function onChange(e) {
    const li = e.target.closest('.wm-group'), f = e.target.dataset.f;
    if (!li || !f) return;
    const S = window.WMSettings, kind = li.dataset.kind;
    if (f === 'on') S.setGroup(kind, e.target.checked ? Object.assign(G.overrideFrom(S.spec()), { on: true }) : { on: false });
    else if (f === 'position') S.setGroup(kind, { position: e.target.value });
    else if (f === 'scale') S.setGroup(kind, { scale: +e.target.value / 100 });
    else if (f === 'opacity') S.setGroup(kind, { opacity: +e.target.value / 100 });
  }

  $('wm-group-list').addEventListener('change', onChange);
  $('wm-group-list').addEventListener('input', onChange);
  window.WMGroupsUI = { render };
})();
