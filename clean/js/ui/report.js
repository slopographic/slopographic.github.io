/* SlopClean: the picture list. One card per picture: a preview, what it holds (grouped by category, each line marked
 * Removed or Kept against the current choices), and its own actions. Classic script; sets window.CL.report. */
(function () {
  'use strict';
  const CL = (window.CL = window.CL || {});
  const el = (...a) => window.SlopUI.el(...a);
  const C = () => window.SlopClean;
  const I = () => window.SlopI18n;
  const t = (k, v) => (I() ? I().t(k, v) : k);
  /** A key built from parts (the core's English names are its ids), or the English when the tables lack it. */
  const tr = (key, en, v) => (I() && I().has(key) ? I().t(key, v) : en);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  /** Names with a variable part, as the core writes them: the key and the part. */
  const PATTERNS = [[/^Text: (.*)$/, 'text_kw', 'kw'], [/^GPS tag (.*)$/, 'gps_tag', 'id'], [/^Photo tag (.*)$/, 'photo_tag', 'id'],
    [/^Interoperability tag (.*)$/, 'interop_tag', 'id'], [/^Tag (0x.*)$/, 'tag', 'id'], [/^Unknown chunk (.*)$/, 'unknown_chunk', 'id'],
    [/^Application data \(APP(\d+)\)$/, 'app_data', 'n']];
  /** The core's English words in the person's language (clean/i18n/<code>/fields.js); unknown ones stay as they are. */
  const W = (CL.words = {
    cat: (c) => tr(['clean', 'cat', c.id].join('.'), c.label),
    field(label) {
      for (const [re, id, name] of PATTERNS) { const m = re.exec(label); if (m) return tr(['clean', 'field', id].join('.'), label, { [name]: m[1] }); }
      return tr(['clean', 'field', slug(label)].join('.'), label);
    },
    where: (w) => (w ? tr(['clean', 'where', slug(w)].join('.'), w) : ''),
    value(v) {
      if (v === 'present') return t('clean.val.present');
      if (v === 'Removed to be safe') return t('clean.val.removed_safe');
      const m = /^(\d+) bytes$/.exec(v || '');
      return m ? t('clean.val.bytes', { n: m[1] }) : v || '';
    },
  });

  /** True when a finding is (or will be) removed: from the real result when there is one, else from the choices. */
  function gone(item, f, remove) {
    if (item.out) return !item.out.after.some((a) => a.cat === f.cat && a.label === f.label && a.value === f.value);
    return !!remove[f.cat];
  }
  const fmtSize = (n) => window.SlopHub.fmtSize(n);   // SlopHub.fmtSize (shared/hub.js)

  /** The "What it holds" list for one item, grouped by category in the order of CATS. */
  function holdings(item, remove) {
    const wrap = el('div', { class: 'cl-holds' });
    if (!item.findings.length) { wrap.append(el('p', { class: 'cl-none' }, t('clean.card.none'))); return wrap; }
    for (const c of C().CATS) {
      const rows = item.findings.filter((f) => f.cat === c.id);
      if (!rows.length) continue;
      wrap.append(el('h4', { class: 'cl-cat' }, W.cat(c), el('span', { class: 'cl-count' }, String(rows.length))));
      for (const f of rows) {
        const removed = gone(item, f, remove);
        wrap.append(el('div', { class: 'cl-row' + (removed ? ' is-gone' : ' is-kept') },
          el('span', { class: 'cl-k' }, W.field(f.label)), el('span', { class: 'cl-v' }, W.value(f.value)),
          el('span', { class: 'cl-pill' }, removed ? t('clean.card.removed') : t('clean.card.kept'))));
      }
    }
    return wrap;
  }

  function summaryLine(item, remove) {
    if (item.error) return item.errorMsg ? t(item.errorMsg.k, item.errorMsg.v) : item.error;
    if (!item.findings.length) return `${item.label} · ${fmtSize(item.size)} · ${t('clean.card.no_meta')}`;
    const cats = [...new Set(item.findings.filter((f) => gone(item, f, remove)).map((f) => f.cat))];
    const names = cats.map((id) => W.cat(C().CATS.find((c) => c.id === id) || { id, label: id }).toLowerCase());
    const head = `${item.label} · ${fmtSize(item.size)}`;
    if (item.out) return `${head} · ${t('clean.card.cleaned_to', { size: fmtSize(item.out.bytes.length) })}${names.length ? ' · ' + t('clean.card.removed_list', { list: names.join(', ') }) : ''}`;
    return `${head} · ${t('clean.card.will_remove', { list: names.length ? names.join(', ') : t('clean.card.nothing') })}`;
  }

  /** One card. h: { view, download, save, replace, close } handlers, each called with the item. */
  function card(item, remove, h) {
    const thumb = item.thumb ? el('img', { src: item.thumb, alt: '' }) : el('span', { class: 'cl-nothumb' }, item.format === 'tiff' ? 'TIFF' : '?');
    const btn = (label, fn, cls = '') => el('button', { type: 'button', class: 'sui-btn ' + cls, onclick: () => fn(item) }, label);
    const actions = [
      item.error ? null : btn(t('clean.card.view'), h.view),
      item.out ? btn(t('ui.download'), h.download, 'sui-primary') : null,
      item.out ? btn(t('clean.card.save'), h.save) : null,
      item.out && item.driveId ? btn(t('clean.card.replace'), h.replace, 'cl-danger') : null,
      btn(t('clean.card.forget'), h.close),
    ].filter(Boolean);
    return el('article', { class: 'cl-card' + (item.error ? ' is-error' : ''), 'data-id': item.id },
      el('div', { class: 'cl-thumb' }, thumb),
      el('div', { class: 'cl-main' },
        el('h3', { class: 'cl-name', title: item.name }, item.name),
        el('p', { class: 'cl-sum' }, summaryLine(item, remove)),
        item.error ? null : holdings(item, remove),
        el('div', { class: 'cl-acts' }, actions)));
  }

  CL.report = {
    render(state, handlers) {
      const list = document.getElementById('cl-list');
      list.replaceChildren(...state.items.map((it) => card(it, state.remove, handlers)));
      document.body.classList.toggle('has-items', state.items.length > 0);
    },
    /** The view dialog: the picture and every field it holds. */
    view(item) {
      const img = item.thumb ? el('img', { class: 'cl-view-img', src: item.thumb, alt: item.name }) : el('p', { class: 'cl-none' }, t('clean.view.no_preview'));
      const rows = item.findings.length
        ? item.findings.map((f) => el('tr', null, el('td', null, W.where(f.where)), el('th', null, W.field(f.label)), el('td', null, W.value(f.value))))
        : [el('tr', null, el('td', { colspan: '3' }, t('clean.view.no_fields')))];
      window.SlopUI.dialog({
        title: item.name, cls: 'cl-view', buttons: [{ label: t('menu.close'), primary: true }],
        body: el('div', { class: 'cl-view-body' }, img,
          el('table', { class: 'cl-table' }, el('thead', null, el('tr', null, el('th', null, t('clean.view.where')), el('th', null, t('clean.view.field')), el('th', null, t('clean.view.value')))), el('tbody', null, rows))),
      });
    },
  };
})();
