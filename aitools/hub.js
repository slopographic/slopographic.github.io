/* Slop AI Tools hub: lists the five tools with their status (ready, needs download, not supported on this device)
 * and the model index with licence, size, source and status. Nothing is downloaded here: "Get more" opens the
 * licence dialog (get-more.js) and only its Download button fetches. Classic script, page: aitools/index.html.
 * ?tool=<id> (from a task page) goes straight to that tool's page. */
(function () {
  'use strict';
  const doc = document, R = window.SlopAIModels, M = window.SlopAIManager, S = window.SlopAISupport;
  const $ = (id) => doc.getElementById(id);
  /** The text of an aitools.* key (aitools/i18n), or the English given: other apps' pages may not load these tables. */
  const tr = (k, en, v) => { const I = window.SlopI18n; return I && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  const LABEL = () => ({ ready: tr('aitools.hub.ready', 'Ready'), 'needs-download': tr('aitools.hub.needs_download', 'Needs download'), unsupported: tr('aitools.hub.unsupported', 'Not supported on this device') });
  /** A tool's name or blurb in the current language (model-registry.js keeps the English). */
  const toolText = (t, f) => tr('aitools.tool.' + t.id + '_' + f, t[f]);

  /** Creates an element; children are nodes or text (never HTML). */
  function el(tag, attrs, ...kids) {
    const n = doc.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'on') for (const ev in attrs.on) n.addEventListener(ev, attrs.on[ev]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }
  /** Pure: the page of the tool a task page's link names (?tool=portrait gives 'portrait/'), or null for an unknown one. */
  function toolPage(search) {
    const id = new URLSearchParams(search || '').get('tool'), t = R.TOOLS.find((x) => x.id === id);
    return t ? t.page : null;
  }
  const go = toolPage(location.search);
  if (go) { location.replace(go); return; }   // straight to the tool; the hub is not drawn
  const pill = (state) => el('span', { class: 'ai-pill ai-' + state }, LABEL()[state]);

  /** Status of one tool: { state, reason, missing } from the device check and its models. */
  async function toolState(tool) {
    const sup = S.check(tool.id);
    if (!sup.ok) return { state: 'unsupported', reason: sup.reason };
    const missing = [];
    for (const id of tool.models) if ((await M.status(id)) === 'needs-download') missing.push(R.byId(id));
    return missing.length ? { state: 'needs-download', missing } : { state: 'ready' };
  }

  async function renderTools() {
    const box = $('toolList');
    box.replaceChildren();
    for (const t of R.TOOLS) {
      const st = await toolState(t);
      const extra = st.state === 'unsupported' ? el('p', { class: 'ai-meta' }, st.reason)
        : st.state === 'needs-download' ? el('p', { class: 'ai-meta' }, tr('aitools.hub.needs', 'Needs {models}. Downloads start only when you press Get more.', { models: st.missing.map((m) => m.name).join(', ') }))
        : null;
      const open = st.state === 'unsupported' ? null : el('a', { class: 'ai-btn ai-pri', href: t.page }, st.state === 'ready' ? tr('aitools.hub.open', 'Open') : tr('aitools.hub.open_get', 'Open and get the model'));
      box.append(el('article', { class: 'ai-card' },
        el('div', { class: 'ai-row' }, el('h3', null, toolText(t, 'name')), pill(st.state)),
        el('p', null, toolText(t, 'blurb')), extra, open));
    }
  }

  async function renderModels() {
    const box = $('modelList');
    box.replaceChildren();
    const rows = await M.list();
    for (const { model: m, status, installedAt } of rows) {
      const remote = R.remoteFiles(m);
      const action = status === 'bundled' ? el('span', { class: 'ai-meta' }, tr('aitools.hub.ships', 'Ships with the site'))
        : status === 'installed' || status === 'update' ? el('span', null, el('span', { class: 'ai-meta' }, tr('aitools.hub.installed', 'Installed {date}. ', { date: installedAt.slice(0, 10) })), el('button', { type: 'button', on: { click: () => removeModel(m) } }, tr('aitools.hub.remove', 'Remove')))
        : el('button', { type: 'button', class: 'ai-pri', on: { click: () => window.SlopAIGetMore.open(m.id, { onInstalled: refresh }) } }, tr('aitools.hub.get_more_dots', 'Get more…'));
      box.append(el('div', { class: 'ai-model' },
        el('div', null, el('strong', null, m.name), el('div', { class: 'ai-meta' }, R.LICENCES[m.licence] + ' (' + m.licence + ') · ' + (remote.length ? R.formatSize(R.downloadBytes(m)) : tr('aitools.hub.bundled', 'bundled'))),
          el('div', { class: 'ai-meta' }, tr('aitools.hub.from', 'From {source} · used by {tools}', { source: m.source.replace(/^https:\/\//, ''), tools: R.TOOLS.filter((t) => t.models.includes(m.id)).map((t) => toolText(t, 'name')).join(', ') }))),
        el('div', { class: 'ai-act' }, pill(status === 'needs-download' ? 'needs-download' : 'ready'), action)));
    }
    const sup = $('storeNote');
    sup.textContent = (await M.available()) ? tr('aitools.hub.stored', 'Models are stored on this device in IndexedDB. Clear site data to remove them all.') : tr('aitools.hub.no_storage', 'Storage is unavailable here, so downloaded models cannot be kept.');
  }

  async function removeModel(m) {
    if (!window.confirm(tr('aitools.hub.remove_q', 'Remove {name} from this device? You can download it again later.', { name: m.name }))) return;
    try { await M.remove(m.id); } catch (e) { $('status').textContent = tr('aitools.hub.remove_failed', 'Could not remove {name}: {error}', { name: m.name, error: e.message }); return; }
    refresh();
  }

  async function refresh() { await renderTools(); await renderModels(); }

  /** The assistant: SlopCmd's commands with arguments (ai-commands.js, jobs by ai-jobs.js) load when first asked, with what
   *  they use that the hub does not load itself: Slop Drive, shared/commands/sources.js, the tools' common.js and transcript.js. */
  function assistant() {
    const C = window.SlopCmd;
    if (!C || !C.provide) return;
    C.init({ app: 'aitools' });
    const base = new URL('./', doc.currentScript ? doc.currentScript.src : location.href).href;
    const one = (src) => new Promise((res, rej) => doc.head.append(Object.assign(doc.createElement('script'),
      { src: new URL(src, base).href, async: false, onload: res, onerror: () => rej(new Error('Could not load ' + src)) })));
    const steps = [['SLOP_APPS', '../shared/apps.js'], ['SlopHub', '../shared/hub.js'], ['SlopCmdSources', '../shared/commands/sources.js'],
      ['SlopAITools', 'common.js'], ['SlopTranscript', 'transcript.js'], ['SlopAIJobs', 'ai-jobs.js'], [null, 'ai-commands.js']];
    C.provide({ prepare: () => steps.reduce((p, [g, src]) => p.then(() => (g && window[g] ? null : one(src))), Promise.resolve()) });
  }

  assistant();
  refresh();
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => refresh());   // the lists again, in the new language
  window.SlopAIHub = { refresh, toolState, toolPage };
})();
