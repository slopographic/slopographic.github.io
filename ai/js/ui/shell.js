/* Slop AI — ui/shell: tabs, theme, the model chip and the More menu. */
'use strict';
(function (AI) {
  const E = AI.E;
  AI.TABS = [['chat', 'Chat', 'chat'], ['build', 'Build', 'build'], ['models', 'Models', 'models'], ['sys', 'Can my PC run it?', 'sys']];
  AI.THEMES = [['pro', 'Pro'], ['light', 'Light'], ['classic', 'Classic 98']].filter(([t]) => !window.SlopTheme || SlopTheme.has(t));   // the site's themes only
  /** The shown names (the English in TABS and THEMES is the fallback; the ids are API). */
  AI.tabLabel = (id) => AI.t('ai.tab.' + id);
  AI.themeLabel = (id) => AI.t('ai.theme.' + id);
  const rendered = new Set();

  /** Pure: the tab a task page's link asks for (?tab=sys), or null for a missing or unknown one. */
  AI.tabOf = function (search) {
    const t = new URLSearchParams(search || '').get('tab');
    return AI.TABS.some((x) => x[0] === t) ? t : null;
  };

  /** Shows a tab and remembers it, unless opts.save is false (a preset from the address is for this visit only). */
  AI.setTab = function (tab, opts = {}) {
    if (!AI.TABS.some((t) => t[0] === tab)) tab = 'chat';
    AI.tab = tab;
    if (opts.save !== false) { AI.prefs.tab = tab; AI.savePrefs(); }
    for (const b of AI.$('tabs').children) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    for (const v of document.querySelectorAll('.view')) v.classList.toggle('on', v.dataset.view === tab);
    const first = !rendered.has(tab); rendered.add(tab);
    AI.emit('tab', { tab, first });
  };

  AI.setTheme = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    AI.prefs.theme = t; AI.savePrefs();
    AI.emit('theme', t);
  };

  function renderChip() {
    const chip = AI.$('modelChip');
    chip.className = 'chip' + (E.ready() ? ' ready' : E.state === 'loading' ? ' loading' : '');
    chip.textContent = '';
    chip.append(AI.el('i', { class: 'dot' }));
    if (E.state === 'loading') {
      const m = E.modelFor(E.loadingId);
      chip.append(AI.el('span', null, AI.t('ai.chip.loading', { name: m ? m.name : AI.t('ai.chip.model'), pct: Math.round(E.progress * 100) })), AI.el('span', { class: 'bar' }, AI.el('i', { style: `width:${Math.round(E.progress * 100)}%` })));
    } else chip.append(AI.el('span', null, E.label() || AI.t(E.state === 'paused' ? 'ai.chip.paused' : 'ai.chip.none')));
    chip.title = E.state === 'loading' ? E.text : AI.t(E.ready() ? 'ai.chip.loaded_tip' : 'ai.chip.pick_tip');
  }

  /** Models already on this device (downloaded or loaded from a folder), for the switcher. */
  async function readyModels() {
    const out = [];
    for (const m of AI.allModels()) { const st = await E.status(m.id).catch(() => null); if (st && st.state === 'ready') out.push(m); }
    return out;
  }
  async function chipMenu() {
    const r = AI.$('modelChip').getBoundingClientRect(), items = [];
    if (E.state === 'loading') items.push({ label: AI.t('ai.chip.pause'), act: () => E.pause() }, { label: AI.t('ai.chip.cancel'), act: () => E.cancel() });
    if (E.state === 'paused' && E.loadingId) items.push({ label: AI.t('ai.chip.resume'), act: () => E.load(E.loadingId, { skipConsent: true }) }, { label: AI.t('ai.chip.cancel'), act: () => E.cancel() });
    const cur = E.model && E.engine && E.engine.loaded ? E.model.id : null;
    const others = (await readyModels()).filter((m) => m.id !== cur);
    if (others.length) items.push({ label: AI.t(cur ? 'ai.chip.switch' : 'ai.chip.load_downloaded'), sub: others.map((m) => ({ label: m.name, act: () => E.load(m.id, { skipConsent: true }) })) });
    if (E.engine && E.engine.loaded) items.push({ label: AI.t('ai.chip.unload'), act: () => E.unload() });
    items.push({ label: AI.t('ai.chip.choose'), act: () => AI.setTab('models') }, { label: AI.tabLabel('sys'), act: () => AI.setTab('sys') });
    window.SlopUI.menu(items, r.left, r.bottom + 4);
  }

  AI.moreMenu = function () {
    const r = AI.$('btnMore').getBoundingClientRect();
    window.SlopUI.menu([
      { label: AI.t('ai.more.search'), key: window.SlopCmd && SlopCmd.keyFor ? SlopCmd.keyFor('ai.palette') : 'Ctrl+K', act: () => AI.openPalette(), disabled: !window.SlopCmd },
      { label: AI.t('ai.more.shortcuts'), act: () => window.SlopCmd && SlopCmd.openKeymap ? SlopCmd.openKeymap() : AI.toast(AI.t('ai.more.no_shortcuts')), disabled: !window.SlopCmd },
      '-',
      { label: AI.t('ai.chat.new'), act: () => AI.newChat() },
      { label: AI.t('ai.more.import'), act: () => AI.importConv() },
      { label: AI.t('ai.more.open_drive'), act: () => AI.openChatFromDrive(), disabled: !window.SlopHub },
      { label: AI.t('ai.more.save_drive'), act: () => AI.saveChatToDrive(), disabled: !window.SlopHub || !(AI.chat && AI.chat.conv && AI.chat.conv.messages.length) },
      { label: AI.t('ai.more.export'), sub: AI.exportItems ? AI.exportItems() : [], disabled: !AI.conv },
      '-',
      { label: AI.t('ai.more.theme'), sub: AI.THEMES.map(([t]) => ({ label: AI.themeLabel(t), check: document.documentElement.getAttribute('data-theme') === t, act: () => AI.setTheme(t) })) },
      { label: AI.t(E.isFake() ? 'ai.more.real_engine' : 'ai.more.demo_engine'), act: () => AI.switchEngine(E.isFake() ? 'webllm' : 'fake') },
      { label: AI.t('ai.more.about'), act: () => AI.about() },
    ], r.right - 240, r.bottom + 4);
  };

  AI.switchEngine = async function (kind) {
    await E.unload();
    AI.prefs.engine = kind === 'fake' ? 'fake' : undefined; AI.savePrefs();
    const u = new URL(location.href); u.searchParams.delete('engine'); history.replaceState(null, '', u.pathname + u.search + u.hash);
    AI.toast(AI.t(kind === 'fake' ? 'ai.engine.demo_on' : 'ai.engine.real_on'));
    AI.emit('engine', E);
  };

  AI.about = () => window.SlopUI.alert(AI.t('ai.more.about'), AI.el('div', { class: 'about' },
    AI.el('p', null, AI.t('ai.about.engine')),
    AI.el('p', null, AI.t('ai.about.offline')),
    AI.el('p', { class: 'dim' }, AI.t('ai.about.licence'))));

  AI.initShell = function () {
    const tabs = AI.$('tabs');
    for (const [id, , icon] of AI.TABS) {
      const b = AI.el('button', { type: 'button', class: 'tab', role: 'tab', 'data-tab': id, id: 'tab-' + id, onclick: () => AI.setTab(id) }, AI.icon(icon), AI.el('span', { 'data-i18n': 'ai.tab.' + id }, AI.tabLabel(id)));
      tabs.append(b);
    }
    AI.$('btnCmd').append(AI.icon('cmd')); AI.$('btnMore').append(AI.icon('more'));
    AI.$('btnMore').onclick = AI.moreMenu;
    AI.$('btnCmd').onclick = () => AI.openPalette();
    AI.$('modelChip').onclick = chipMenu;
    AI.on('engine', renderChip);
    renderChip();
    AI.onLang(renderChip);   // the tabs follow through data-i18n; the views re-render from their own onLang
  };
  AI.openPalette = (q) => (window.SlopCmd && SlopCmd.open ? SlopCmd.open(q) : null);
})(window.AI);
