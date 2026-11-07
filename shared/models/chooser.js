/* Slopographic on-device models: the "Language and model" chooser, one dialog for every model family (speech today: Slop
 * Transcribe, AI Tools' Speech page, later File convert's text and subtitles; OCR next). Built on SlopUI.dialog
 * (shared/slopui.js); styles in chooser.css. See shared/models/HANDOFF.md for how a family plugs in.
 *   Step 1: the language (search, the family's automatic choice first, "Always use ..." to keep it).
 *   Step 2: the family's models that suit it, best first (catalog.rank(), shared/models/catalog.js), each with who made it,
 *   its download size, speed and accuracy, badges ("Recommended for Swedish") and its state: Download, Downloading n%
 *   (Cancel), Installed (Use, Remove). The storage the family's models take, with a link to Settings › Storage.
 * openModelChooser({ family, language, model, pinned, installer, ui, storageHref, onChoose }) -> { box, close, refresh }
 *   family: { id, title, languageStep, modelStep, usageWords, catalog, languages: { filter(query), name(code) } }
 *     (speech: shared/speech/family.js speechFamily())
 *   installer: { status(id), install(id, onProgress, { signal }), remove(id), usage(ids) } (aitools/models.js SlopAIManager)
 *   ui: SlopUI (defaults to the page's)
 *   onChoose({ language, model, pin }) when the person presses Use (the model must be installed). */

/** The words (shared/i18n/ui/<code>/models.js), read when drawn. */
const T = (k, v) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(k, v) : k);
const one = (x) => (globalThis.SlopI18n ? globalThis.SlopI18n.num(x, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : x.toFixed(1));
const fmt = (n) => (n >= 1e9 ? T('ui.models.size_gb', { n: one(n / 1e9) }) : n >= 1e6 ? T('ui.models.size_mb', { n: Math.round(n / 1e6) }) : T('ui.models.size_kb', { n: Math.max(1, Math.round(n / 1e3)) }));
const LICENCE = { MIT: 'MIT', 'Apache-2.0': 'Apache 2.0' };

/** Pure: the words for a badge. name: the language's name, or '' when it is not known. only: the model's languages' names. */
export function badgeText(badge, name, only) {
  if (badge === 'recommended') return name ? T('ui.models.badge_rec_for', { lang: name }) : T('ui.models.badge_rec');
  if (badge === 'made-for') return name ? T('ui.models.badge_made_for', { lang: name }) : T('ui.models.badge_made');
  if (badge === 'only') return T('ui.models.badge_only', { lang: only || name });
  if (badge === 'fastest') return T('ui.models.badge_fastest');
  return badge;
}
/** Pure: five dots, n of them filled, as text for screen readers and a bar for the eye. */
export const meter = (n) => ({ label: T('ui.models.of_5', { n }), dots: '●'.repeat(n) + '○'.repeat(5 - n) });

export function openModelChooser(o = {}) {
  const F = o.family, UI = o.ui || globalThis.SlopUI, C = F.catalog, I = o.installer || globalThis.SlopAIManager;
  const el = UI.el, filterLanguages = F.languages.filter, languageName = F.languages.name;
  let language = o.language || 'auto', model = o.model || C.QUICK, pin = !!o.pinned && language !== 'auto';
  const busy = new Map();   // model id -> { ctrl, pct }
  const states = new Map();

  // step 1: the language
  const search = el('input', { type: 'search', class: 'spm-search', placeholder: T('ui.models.search'), 'aria-label': T('ui.models.search'), autocomplete: 'off', 'aria-controls': 'spmLangs' });
  const list = el('ul', { class: 'spm-langs', id: 'spmLangs', role: 'listbox', 'aria-label': T('ui.models.language'), tabindex: '-1' });
  const pinBox = el('input', { type: 'checkbox', class: 'spm-pin-box' });
  const pinText = el('span');
  const pinRow = el('label', { class: 'spm-pin' }, pinBox, pinText);
  const models = el('ol', { class: 'spm-models', 'aria-label': T('ui.models.models') });
  const usage = el('p', { class: 'spm-usage' });
  const body = el('div', { class: 'spm' },
    el('h3', { class: 'spm-step' }, F.languageStep || T('ui.models.step_language')), search, list, pinRow,
    el('h3', { class: 'spm-step' }, F.modelStep || T('ui.models.step_model')), models, usage);

  function drawLanguages() {
    const opts = filterLanguages(search.value);
    list.replaceChildren(...opts.map((l) => {
      const li = el('li', { role: 'option', 'data-code': l.code, 'aria-selected': String(l.code === language), class: 'spm-lang' + (l.code === language ? ' is-on' : '') }, l.name);
      li.addEventListener('click', () => chooseLanguage(l.code));
      return li;
    }));
    if (!opts.length) list.append(el('li', { class: 'spm-none' }, T('ui.models.no_language')));
    const on = list.querySelector('.is-on');
    if (on) list.scrollTop += on.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2;   // in view
    pinRow.hidden = language === 'auto';
    pinBox.checked = pin;
    pinText.textContent = ' ' + T('ui.models.pin', { lang: languageName(language) });
  }
  function chooseLanguage(code) {
    language = code;
    if (code === 'auto') pin = false;
    const fitsNow = C.rank(language).some((r) => r.model.id === model);
    if (!fitsNow) model = C.QUICK;
    drawLanguages(); drawModels();
  }
  search.addEventListener('input', drawLanguages);
  search.addEventListener('keydown', (e) => {
    const opts = [...list.querySelectorAll('[role=option]')], i = opts.findIndex((x) => x.dataset.code === language);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) { chooseLanguage(n.dataset.code); const again = list.querySelector('.is-on'); if (again && again.scrollIntoView) again.scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter' && opts.length && i < 0) { e.preventDefault(); e.stopPropagation(); chooseLanguage(opts[0].dataset.code); }
  });
  pinBox.addEventListener('change', () => { pin = pinBox.checked; });

  // step 2: the models for that language
  async function drawModels() {
    const ranked = C.rank(language);
    for (const r of ranked) if (!busy.has(r.model.id)) states.set(r.model.id, await I.status(r.model.id));
    models.replaceChildren(...ranked.map(row));
    try { usage.replaceChildren(T('ui.models.usage', { what: F.usageWords || T('ui.models.these'), size: fmt(await I.usage(C.MODELS.map((m) => m.id))) }) + ' ', el('a', { href: o.storageHref || '../settings/#storage', target: '_blank', rel: 'noopener' }, T('ui.models.storage'))); }
    catch (e) { usage.textContent = ''; }
    useBtn().disabled = !installed(model);
    useBtn().textContent = installed(model) ? T('ui.models.use_name', { name: C.byId(model).name }) : T('ui.models.use');
  }
  const installed = (id) => { const s = states.get(id); return s === 'installed' || s === 'update' || s === 'bundled'; };
  function row({ model: m, badges }) {
    const st = busy.has(m.id) ? 'downloading' : installed(m.id) ? 'installed' : 'download';
    const on = m.id === model;
    const sp = meter(m.speed), ac = meter(m.accuracy);
    const li = el('li', { class: 'spm-model' + (on ? ' is-on' : ''), 'data-id': m.id, 'data-state': st },
      el('div', { class: 'spm-name' }, el('strong', null, m.name), ...badges.map((b) => el('span', { class: 'spm-badge is-' + b }, badgeText(b, language === 'auto' ? '' : languageName(language), m.languages === '*' ? '' : m.languages.map(languageName).join(', '))))),
      el('div', { class: 'spm-by' }, T('ui.models.by', { maker: m.maker, size: fmt(C.bytesOf(m)), licence: LICENCE[m.licence] || m.licence })),
      el('p', { class: 'spm-note' }, m.note),
      el('div', { class: 'spm-meters' },
        el('span', { title: T('ui.models.speed_of', { value: sp.label }) }, T('ui.models.speed') + ' ', el('span', { class: 'spm-dots', 'aria-label': sp.label }, sp.dots)),
        el('span', { title: T('ui.models.accuracy_of', { value: ac.label }) }, T('ui.models.accuracy') + ' ', el('span', { class: 'spm-dots', 'aria-label': ac.label }, ac.dots))),
      actions(m, st, on));
    return li;
  }
  function actions(m, st, on) {
    const box = el('div', { class: 'spm-act' });
    if (st === 'downloading') {
      const b = busy.get(m.id);
      const bar = el('progress', { class: 'spm-prog', max: '100', value: String(b.pct), 'aria-label': T('ui.models.downloading_name', { name: m.name }) });
      const cancel = el('button', { type: 'button', class: 'sui-btn' }, T('menu.cancel'));
      cancel.addEventListener('click', () => b.ctrl.abort());
      box.append(el('span', { class: 'spm-pct' }, T('ui.models.downloading_pct', { pct: b.pct })), bar, cancel);
    } else if (st === 'installed') {
      const use = el('button', { type: 'button', class: 'sui-btn' + (on ? ' sui-primary' : ''), 'aria-pressed': String(on) }, T(on ? 'ui.models.selected' : 'ui.models.use'));
      use.addEventListener('click', () => { model = m.id; drawModels(); });
      box.append(use);
      if (m.id !== C.QUICK) {
        const rm = el('button', { type: 'button', class: 'sui-btn spm-remove' }, T('ui.remove'));
        rm.addEventListener('click', () => remove(m));
        box.append(rm);
      }
    } else {
      const dl = el('button', { type: 'button', class: 'sui-btn sui-primary' }, T('ui.models.download_size', { size: fmt(C.bytesOf(m)) }));
      dl.addEventListener('click', () => download(m));
      box.append(dl);
    }
    return box;
  }
  async function download(m) {
    const ctrl = new AbortController(), b = { ctrl, pct: 0 };
    busy.set(m.id, b); drawModels();
    let last = -1;
    try {
      await I.install(m.id, (p) => {
        b.pct = p.total ? Math.floor((p.loaded / p.total) * 100) : 0;
        if (b.pct === last) return;
        last = b.pct;
        const li = models.querySelector(`[data-id="${m.id}"]`);
        if (li) { const bar = li.querySelector('progress'), t = li.querySelector('.spm-pct'); if (bar) bar.value = b.pct; if (t) t.textContent = T('ui.models.downloading_pct', { pct: b.pct }); }
      }, { signal: ctrl.signal });
      busy.delete(m.id);
      model = m.id;
      say(T('ui.models.installed', { name: m.name }));
    } catch (e) {
      busy.delete(m.id);
      say(e && e.name === 'AbortError' ? T('ui.models.cancelled', { name: m.name }) : T('ui.models.not_installed', { name: m.name, error: String((e && e.message) || e) }));
    }
    drawModels();
  }
  async function remove(m) {
    try { await I.remove(m.id); } catch (e) { say(T('ui.models.remove_failed', { name: m.name, error: e.message })); return; }
    if (model === m.id) model = C.QUICK;
    say(T('ui.models.removed', { name: m.name }));
    drawModels();
  }
  const status = el('p', { class: 'spm-status', role: 'status', 'aria-live': 'polite' });
  body.append(status);
  const say = (t) => { status.textContent = t; };

  const dlg = UI.dialog({
    title: F.title || T('ui.models.title'), body, cls: 'spm-dlg', dismissable: true,
    buttons: [{ label: T('menu.cancel') }, { label: T('ui.models.use'), primary: true, act: () => {
      if (!installed(model)) { say(T('ui.models.first')); return false; }
      if (o.onChoose) o.onChoose({ language, model, pin: pin && language !== 'auto' });
      return true;
    } }],
    onClose: () => { for (const b of busy.values()) b.ctrl.abort(); },
  });
  const useBtn = () => dlg.box.querySelector('.sui-foot .sui-primary');
  drawLanguages();
  drawModels();
  return { box: dlg.box, close: dlg.close, refresh: drawModels, get language() { return language; }, get model() { return model; } };
}

if (typeof window !== 'undefined') window.SlopModelChooser = { open: openModelChooser, badgeText, meter };
