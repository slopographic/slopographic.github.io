/* Slop AI — ui/models: the model picker. Catalog cards with size, GPU memory, licence, strengths, a recommended
 * badge from the system check, download with progress / pause / cancel, delete, disk usage and the default model. */
'use strict';
(function (AI) {
  const K = AI.K, E = AI.E, el = AI.el;
  const statuses = new Map();
  let lastKey = '';

  const all = () => [...K.catalog.list, ...K.models.locals().map((r) => K.catalog.custom(r.model_id, { name: r.model_id.slice(6) }))];
  AI.allModels = all;

  async function refreshStatus() {
    await Promise.all(all().map(async (m) => { statuses.set(m.id, await E.status(m.id).catch(() => ({ state: 'none', bytes: 0 }))); }));
  }

  function actions(m, st) {
    const loaded = E.model && E.model.id === m.id && E.engine && E.engine.loaded;
    const loading = E.state === 'loading' && E.loadingId === m.id, paused = E.state === 'paused' && E.loadingId === m.id;
    const v = AI.sys ? K.sysinfo.verdict(AI.sys, m) : null;
    const b = [];
    if (loading) b.push(el('button', { type: 'button', class: 'btn sm', 'data-act': 'pause', onclick: () => E.pause() }, AI.icon('pause'), AI.t('ai.models.pause')), el('button', { type: 'button', class: 'btn sm', 'data-act': 'cancel', onclick: () => E.cancel() }, AI.icon('x'), AI.t('menu.cancel')));
    else if (loaded) b.push(el('button', { type: 'button', class: 'btn sm primary', onclick: () => AI.setTab('chat') }, AI.icon('chat'), AI.tabLabel('chat')), el('button', { type: 'button', class: 'btn sm', onclick: () => E.unload() }, AI.t('ai.models.unload')));
    else {
      const label = loadLabel(m, st, paused);
      b.push(el('button', { type: 'button', class: 'btn sm' + (v && v.level === 'no' ? '' : ' primary'), 'data-act': 'load', onclick: () => load(m, paused) }, AI.icon(st.state === 'ready' ? 'play' : 'download'), label));
      if (paused) b.push(el('button', { type: 'button', class: 'btn sm', 'data-act': 'cancel', onclick: () => E.cancel() }, AI.icon('x'), AI.t('menu.cancel')));
    }
    const isDef = AI.prefs.defaultModel === m.id;
    b.push(el('button', { type: 'button', class: 'btn sm', 'data-act': 'default', 'aria-pressed': String(isDef), title: AI.t('ai.models.default_tip'), onclick: () => setDefault(m) }, AI.icon('star'), AI.t(isDef ? 'ai.models.default' : 'ai.models.set_default')));
    if (st.state !== 'none' && !loading) b.push(el('button', { type: 'button', class: 'btn sm danger', 'data-act': 'delete', onclick: () => del(m) }, AI.icon('trash'), AI.t('ui.delete')));
    return el('div', { class: 'm-acts' }, b);
  }

  /** Resume, Load, Resume download or Download: what the card's main button does now. */
  function loadLabel(m, st, paused) {
    return AI.t(paused ? 'ai.models.resume' : st.state === 'ready' || m.custom ? 'ai.models.load' : st.state === 'partial' ? 'ai.chip.resume' : 'ui.download');
  }
  async function load(m, resume) {
    const v = AI.sys ? K.sysinfo.verdict(AI.sys, m) : null;
    if (v && v.level === 'no' && !E.isFake() && !(await window.SlopUI.confirm(AI.t('ai.models.may_fail'), AI.t('ai.models.may_fail_body', { reason: v.reason }), AI.t('ai.models.try_anyway')))) return;
    // The first model download of a visit asks the browser to keep this site's data (SlopQuota.askIfBig, once per visit).
    if (!E.isFake() && !m.custom && (statuses.get(m.id) || {}).state !== 'ready') window.SlopQuota.askIfBig((m.sizeMB || 0) * 1048576);
    const ok = await E.load(m.id, { skipConsent: !!resume });
    if (ok) { AI.toast(AI.t('ai.models.ready', { name: m.name })); if (AI.prefs.defaultModel == null) setDefault(m, true); }
  }
  function setDefault(m, quiet) {
    AI.prefs.defaultModel = AI.prefs.defaultModel === m.id && !quiet ? null : m.id; AI.savePrefs();
    if (!quiet) AI.toast(AI.prefs.defaultModel ? AI.t('ai.models.default_on', { name: m.name }) : AI.t('ai.models.default_off'));
    render();
  }
  async function del(m) {
    const st = statuses.get(m.id) || {};
    if (!(await window.SlopUI.confirm(AI.t('ai.models.delete_q', { name: m.name }), st.bytes ? AI.t('ai.models.delete_body', { size: AI.fmtBytes(st.bytes) }) : AI.t('ai.models.delete_body_files'), AI.t('ui.delete'), { danger: true }))) return;
    await E.remove(m.id);
    if (AI.prefs.defaultModel === m.id) { AI.prefs.defaultModel = null; AI.savePrefs(); }
    await refreshStatus(); render();
  }

  function card(m, rec, recCode) {
    const st = statuses.get(m.id) || { state: 'none', bytes: 0 };
    const v = AI.sys ? K.sysinfo.verdict(AI.sys, m) : null;
    const loading = E.loadingId === m.id && (E.state === 'loading' || E.state === 'paused');
    const loaded = E.model && E.model.id === m.id && E.engine && E.engine.loaded;
    const failed = E.state === 'error' && E.loadingId === m.id;
    const size = AI.fmtBytes(st.bytes);
    const stateText = failed ? AI.t('ai.models.failed', { why: E.error }) : loaded ? AI.t('ai.models.loaded') : st.state === 'ready' ? AI.t('ai.models.downloaded_size', { size }) : st.state === 'partial' ? AI.t('ai.models.partial_size', { size }) : AI.t(m.custom ? 'ai.models.from_folder' : 'ai.models.not_downloaded');
    return el('article', { class: 'mcard' + (loaded ? ' loaded' : '') + (AI.focusModel === m.id ? ' focus' : ''), 'data-id': m.id },
      el('div', { class: 'm-head' }, el('div', null, el('h3', null, m.name), el('div', { class: 'faint' }, [m.maker, m.params ? AI.t('ai.models.params', { n: String(m.params) }) : ''].filter(Boolean).join(' · '))),
        el('div', { class: 'm-badges' }, m.id === rec ? el('span', { class: 'badge rec' }, AI.t('ai.models.recommended')) : null, m.id === recCode ? el('span', { class: 'badge rec' }, AI.t('ai.models.best_code')) : null,
          AI.prefs.defaultModel === m.id ? el('span', { class: 'badge' }, '★ ' + AI.t('ai.models.default')) : null, v ? el('span', { class: 'badge ' + v.level, title: v.reason || '' }, AI.verdictText(v)) : null)),
      el('p', { class: 'm-blurb' }, m.blurb),
      el('div', { class: 'm-tags' }, m.strengths.map((s) => el('span', { class: 'tag', 'data-tag': s }, AI.t('ai.models.tag_' + s.replace(/-/g, '_'))))),
      el('dl', { class: 'm-facts' },
        el('dt', null, AI.t('ai.models.size')), el('dd', null, m.sizeMB ? '~' + AI.fmtMB(m.sizeMB) : '—'),
        el('dt', null, AI.t('ai.models.gpu_mem')), el('dd', null, m.vramMB ? AI.fmtMB(v && v.vram || m.vramMB) : '—'),
        el('dt', null, AI.t('ai.models.context')), el('dd', null, AI.t('ai.models.ctx_k', { n: String(Math.round(m.ctx / 1024)) })),
        el('dt', null, AI.t('ai.models.licence')), el('dd', null, m.license.url ? el('a', { href: m.license.url, target: '_blank', rel: 'noopener' }, m.license.name) : m.license.name)),
      el('div', { class: 'm-state' + (loading ? ' on' : '') + (failed ? ' bad' : '') }, el('span', { class: 'm-st' }, loading ? (E.state === 'paused' ? AI.t('ai.models.paused_at', { pct: Math.round(E.progress * 100) }) : E.text) : stateText),
        loading ? el('div', { class: 'pbar' }, el('i', { style: `width:${Math.round(E.progress * 100)}%` })) : null),
      el('div', { class: 'faint mono m-id' }, m.loadId || (AI.sys ? K.catalog.idFor(m, AI.sys) : m.id)),
      actions(m, st));
  }

  async function usage() {
    let total = 0; for (const s of statuses.values()) total += s.bytes || 0;
    const est = await window.SlopQuota.estimate();
    const box = AI.$('mUsage');
    if (box) box.textContent = est.quota ? AI.t('ai.models.usage_free', { size: AI.fmtBytes(total), free: AI.fmtBytes(est.quota - (est.usage || 0)) }) : AI.t('ai.models.usage', { size: AI.fmtBytes(total) });
    paintStorage(est);
  }
  /** Storage: each downloaded model with its size and a Delete button (the same cache the engine uses), and a plain
   * warning when this site is nearly out of space, saying what to free. */
  const LOW_BYTES = 256 * 1048576;
  function paintStorage(est) {
    const body = AI.$('mStorageBody'); if (!body) return;
    const rows = all().map((m) => ({ m, st: statuses.get(m.id) || { state: 'none', bytes: 0 } })).filter((r) => r.st.state !== 'none');
    const total = rows.reduce((n, r) => n + (r.st.bytes || 0), 0);
    const free = est && est.quota ? est.quota - (est.usage || 0) : null;
    body.replaceChildren(
      free != null && free < LOW_BYTES ? el('p', { class: 'msg err', id: 'mFull', role: 'alert' }, AI.t('ai.models.full', { left: AI.fmtBytes(Math.max(0, free)) })) : null,
      el('p', { class: 'faint' }, rows.length ? AI.t('ai.models.stored', { size: AI.fmtBytes(total) }) : AI.t('ai.models.none_stored')),
      rows.length ? el('table', { class: 'mtable' }, el('tbody', null, rows.map(({ m, st }) => el('tr', { 'data-id': m.id },
        el('th', { scope: 'row' }, m.name), el('td', null, AI.t(st.state === 'partial' ? 'ai.models.partial' : 'ai.models.downloaded')), el('td', { class: 'num' }, AI.fmtBytes(st.bytes)),
        el('td', null, el('button', { type: 'button', class: 'btn sm danger', 'data-act': 'delete-storage', onclick: () => del(m) }, AI.icon('trash'), AI.t('ui.delete'))))))) : null);
  }

  async function importDisk() {
    let files = null;
    if (window.showDirectoryPicker) {
      try {
        const dir = await window.showDirectoryPicker({ id: 'slop-ai-model', mode: 'read' }); files = [];
        const walk = async (d, pre) => { for await (const [name, h] of d.entries()) { if (h.kind === 'file') files.push({ path: pre + name, file: await h.getFile() }); else await walk(h, pre + name + '/'); } };
        await walk(dir, dir.name + '/');
      } catch (e) { if (e.name === 'AbortError') return; files = null; }
    }
    if (!files) {
      files = await AI.intake.pickModelFolder(); // the intake's folder picker (part 'ai.model', ui/intake.js)
      if (!files.length) return;
    }
    try { AI.toast(AI.t('ai.models.importing'), 6000); const id = await K.models.importFolder(files); await refreshStatus(); render(); AI.toast(AI.t('ai.models.imported', { name: id.slice(6) })); await E.load(id, { skipConsent: true }); }
    catch (e) { window.SlopUI.alert(AI.t('ai.models.folder_failed'), e.message); }
  }

  async function render() {
    const v = AI.$('view-models'); if (!v || AI.tab !== 'models') return;
    lastKey = E.state + E.loadingId + (E.model && E.model.id);
    const rec = AI.recommended('chat'), recCode = AI.recommended('code');
    v.textContent = '';
    v.append(el('div', { class: 'page-in' },
      el('div', { class: 'page-head' }, el('div', null, el('h1', null, AI.tabLabel('models')), el('p', { class: 'lead' }, AI.t(E.isFake() ? 'ai.models.lead_demo' : 'ai.models.lead')),
        el('p', { class: 'faint', id: 'mUsage' }, '…')),
      el('div', { class: 'head-acts' }, el('button', { type: 'button', class: 'btn', id: 'btnDisk', onclick: importDisk, disabled: E.isFake() }, AI.icon('folder'), AI.t('ai.models.from_disk')),
        !AI.sys ? el('button', { type: 'button', class: 'btn', onclick: () => AI.setTab('sys') }, AI.t('ai.models.check_pc')) : null)),
      el('div', { class: 'mgrid' }, all().map((m) => card(m, rec, recCode))),
      el('section', { class: 'mstore', id: 'mStorage', 'aria-labelledby': 'mStorageH' }, el('h2', { id: 'mStorageH' }, AI.t('ai.models.storage')), el('div', { id: 'mStorageBody' }, '…'))));
    const f = v.querySelector('.mcard.focus'); if (f) { f.scrollIntoView({ block: 'center' }); AI.focusModel = null; }
    usage();
  }
  /** Progress ticks patch the bar and text in place; state changes re-render. */
  function onEngine() {
    if (AI.tab !== 'models') return;
    const key = E.state + E.loadingId + (E.model && E.model.id);
    if (key === lastKey && E.state === 'loading') {
      const c = AI.$('view-models').querySelector(`.mcard[data-id="${CSS.escape(E.loadingId)}"]`);
      if (c) { const i = c.querySelector('.pbar i'); if (i) i.style.width = Math.round(E.progress * 100) + '%'; const t = c.querySelector('.m-st'); if (t) t.textContent = E.text; }
      return;
    }
    refreshStatus().then(render);
  }
  AI.renderModels = () => refreshStatus().then(render);
  AI.modelStatus = (id) => statuses.get(id);
  AI.importModelFolder = importDisk;
  AI.on('engine', onEngine);
  AI.on('sys', () => { if (AI.tab === 'models') render(); });
  AI.on('tab', ({ tab }) => { if (tab === 'models') AI.renderModels(); });
  AI.onLang(() => { if (AI.tab === 'models') render(); });
  /** Menu rows for a model card (the right-click menu): the same actions as its buttons. */
  AI.modelItems = function (id) {
    const m = all().find((x) => x.id === id);
    if (!m) return null;
    const st = statuses.get(m.id) || {};
    const loaded = E.model && E.model.id === m.id && E.engine && E.engine.loaded;
    const loading = E.state === 'loading' && E.loadingId === m.id, paused = E.state === 'paused' && E.loadingId === m.id;
    const out = [];
    if (loading) out.push({ label: AI.t('ai.models.pause'), act: () => E.pause() }, { label: AI.t('menu.cancel'), act: () => E.cancel() });
    else if (loaded) out.push({ label: AI.t('ai.models.chat_with'), act: () => AI.setTab('chat') }, { label: AI.t('ai.models.unload'), act: () => E.unload() });
    else {
      out.push({ label: loadLabel(m, st, paused), act: () => load(m, paused) });
      if (paused) out.push({ label: AI.t('menu.cancel'), act: () => E.cancel() });
    }
    const isDef = AI.prefs.defaultModel === m.id;
    out.push('-', { label: AI.t(isDef ? 'ai.models.clear_default' : 'ai.models.set_as_default'), act: () => setDefault(m) });
    if (st.state !== 'none' && !loading) out.push({ label: AI.t('ai.chat.delete_dots'), act: () => del(m) });
    return out;
  };
})(window.AI);
