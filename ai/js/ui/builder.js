/* Slop AI — ui/builder: "Build a mini-app". The model writes one HTML file; it runs in a sandboxed iframe
 * (sandbox="allow-scripts", no same-origin, plus a CSP that blocks all network), you iterate by chatting, then save
 * it to Slop Drive or download it. */
'use strict';
(function (AI) {
  const K = AI.K, el = AI.el;
  let panel = null, frame = null, codeBox = null, mode = 'preview';
  const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

  /** The document the preview runs: the app's HTML with a CSP meta first, so it cannot load or send anything. */
  AI.sandboxDoc = function (html) {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
    const s = String(html || '');
    if (/<head[^>]*>/i.test(s)) return s.replace(/<head[^>]*>/i, (m) => m + meta);
    if (/<html[^>]*>/i.test(s)) return s.replace(/<html[^>]*>/i, (m) => m + '<head>' + meta + '</head>');
    return meta + s;
  };
  AI.SANDBOX = 'allow-scripts';
  /** The last complete HTML file in a reply (```html fences, or an unlabelled block that looks like HTML). */
  AI.extractHtml = function (text) {
    const blocks = K.md.codeBlocks(String(text || '')).filter((b) => b.closed && (b.lang === 'html' || b.lang === 'htm' || /^\s*<(!doctype|html|body|div|canvas|style|script)/i.test(b.code)));
    return blocks.length ? blocks[blocks.length - 1].code : null;
  };

  function show() {
    const c = panel && panel.conv, html = c && c.html;
    AI.$('buildEmpty').hidden = !!html;
    frame.hidden = !html || mode !== 'preview'; codeBox.hidden = !html || mode !== 'code';
    if (html && mode === 'preview') frame.srcdoc = AI.sandboxDoc(html);
    if (html && mode === 'code') codeBox.textContent = html;
    for (const b of document.querySelectorAll('#buildModes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    for (const id of ['btnBuildSave', 'btnBuildDl', 'btnBuildReload']) AI.$(id).disabled = !html;
    AI.$('buildTitle').textContent = c ? c.title : AI.t('ai.build.new');
  }
  const fileName = () => AI.slug(panel.conv && panel.conv.title || 'mini-app') + '.html';
  const blob = () => new Blob([panel.conv.html], { type: 'text/html' });

  function onDone(c, msg) {
    const html = msg && AI.extractHtml(msg.content);
    if (html) { c.html = html; show(); } else if (msg && !msg.error) AI.toast(AI.t('ai.build.no_html'));
  }

  async function startFrom(tpl) {
    const c = AI.db.blank('build', { title: AI.tplName(tpl) });
    c.messages.push({ role: 'user', content: tpl.prompt, display: tpl.prompt, time: Date.now() },
      { role: 'assistant', content: '```html\n' + tpl.html + '\n```\n\n' + AI.t('ai.build.starter_reply'), time: Date.now(), template: tpl.id });
    c.html = tpl.html;
    await AI.db.put(c);
    panel.setConv(c); show();
  }
  AI.openBuild = async function (id) { const c = await AI.db.get(id); if (c) { panel.setConv(c); show(); } };
  AI.newBuild = function () { panel.setConv(null); show(); panel.input.focus(); };
  AI.openInBuilder = async function (html) {
    const c = AI.db.blank('build', { title: AI.t('ai.build.from_chat') });
    c.messages.push({ role: 'assistant', content: '```html\n' + html + '\n```', time: Date.now() });
    c.html = html;
    await AI.db.put(c);
    AI.setTab('build'); panel.setConv(c); mode = 'preview'; show();
  };

  async function buildsMenu(e) {
    const r = e.currentTarget.getBoundingClientRect(), list = await AI.db.list('build');
    window.SlopUI.menu([{ label: AI.t('ai.build.new'), act: AI.newBuild }, '-',
      ...(list.length ? list.slice(0, 20).map((c) => ({ label: c.title + ' · ' + AI.fmtTime(c.updated), check: panel.conv && panel.conv.id === c.id, act: () => AI.openBuild(c.id) })) : [{ label: AI.t('ai.build.none_yet'), disabled: true }]),
      ...(panel.conv && panel.conv.messages.length ? ['-', { label: AI.t('ui.rename_dots'), act: async () => { const t = await window.SlopUI.prompt(AI.t('ui.rename'), AI.t('ai.chat.title_label'), panel.conv.title); if (t) { panel.conv.title = t; await AI.db.put(panel.conv); show(); } } },
        { label: AI.t('ai.chat.delete_dots'), act: async () => { if (await window.SlopUI.confirm(AI.t('ai.build.delete_q'), AI.t('ai.build.delete_body'), AI.t('ui.delete'), { danger: true })) { await AI.db.remove(panel.conv.id); AI.newBuild(); } } }] : []),
    ], r.left, r.bottom + 4);
  }

  function empty() {
    return el('div', { class: 'empty build-hello' }, el('b', null, AI.t('ai.build.hello')),
      el('p', null, AI.t('ai.build.hello_lead')),
      el('div', { class: 'starters' }, AI.TEMPLATES.map((t) => el('button', { type: 'button', class: 'btn', 'data-tpl': t.id, onclick: () => startFrom(t) }, el('b', null, AI.tplName(t)), el('small', { class: 'faint' }, AI.t('ai.tpl.' + t.id + '_blurb'))))));
  }

  AI.initBuilder = function () {
    const v = AI.$('view-build');
    const left = el('div', { class: 'build-chat' }, el('div', { class: 'chat-bar' },
      el('button', { type: 'button', class: 'btn sm', id: 'btnBuilds', onclick: buildsMenu }, AI.icon('build'), el('span', { id: 'buildTitle' }, AI.t('ai.build.new')), '▾'),
      el('div', { class: 'tpl-row' }, AI.TEMPLATES.map((t) => el('button', { type: 'button', class: 'btn sm', title: AI.t('ai.build.tpl_tip', { name: AI.tplName(t) }), 'data-i18n': 'ai.tpl.' + t.id, onclick: () => startFrom(t) }, AI.tplName(t)))),
      el('button', { type: 'button', class: 'btn sm only-mobile', id: 'btnShowPreview', 'data-i18n': 'ai.build.preview', onclick: () => document.body.classList.toggle('show-preview') }, AI.t('ai.build.preview'))));
    frame = el('iframe', { class: 'preview', id: 'preview', title: AI.t('ai.build.preview_title'), 'data-i18n-attr': 'title:ai.build.preview_title', sandbox: AI.SANDBOX, referrerpolicy: 'no-referrer', allow: '' });
    codeBox = el('pre', { class: 'code-view', id: 'codeView' });
    const right = el('div', { class: 'build-preview' },
      el('div', { class: 'chat-bar' },
        el('button', { type: 'button', class: 'btn sm only-mobile', 'data-i18n': 'ai.build.back_chat', onclick: () => document.body.classList.remove('show-preview') }, AI.t('ai.build.back_chat')),
        el('div', { class: 'seg', id: 'buildModes', role: 'group', 'aria-label': AI.t('ai.build.modes'), 'data-i18n-attr': 'aria-label:ai.build.modes' }, ['preview', 'code'].map((m) => el('button', { type: 'button', 'data-mode': m, 'data-i18n': 'ai.build.' + m, onclick: () => { mode = m; show(); } }, AI.t('ai.build.' + m)))),
        el('span', { class: 'faint sandbox-note', title: AI.t('ai.build.sandbox_tip'), 'data-i18n': 'ai.build.sandboxed', 'data-i18n-attr': 'title:ai.build.sandbox_tip' }, AI.t('ai.build.sandboxed')),
        el('div', { class: 'grow' }),
        el('button', { type: 'button', class: 'tb', id: 'btnBuildReload', title: AI.t('ai.build.restart'), 'aria-label': AI.t('ai.build.restart'), 'data-i18n-attr': 'title:ai.build.restart;aria-label:ai.build.restart', onclick: show }, AI.icon('redo')),
        el('button', { type: 'button', class: 'tb', id: 'btnBuildSave', title: AI.t('ai.spec.save_drive'), 'aria-label': AI.t('ai.spec.save_drive'), 'data-i18n-attr': 'title:ai.spec.save_drive;aria-label:ai.spec.save_drive', onclick: () => window.SlopHub.saveToDrive(blob(), fileName(), { from: 'ai' }) }, AI.icon('drive')),
        el('button', { type: 'button', class: 'tb', id: 'btnBuildDl', title: AI.t('ai.build.download_tip'), 'aria-label': AI.t('ui.download'), 'data-i18n-attr': 'title:ai.build.download_tip;aria-label:ui.download', onclick: () => window.SlopUI.download(blob(), fileName()) }, AI.icon('download'))),
      el('div', { class: 'stage' }, el('div', { class: 'empty', id: 'buildEmpty' }, el('b', { 'data-i18n': 'ai.build.nothing' }, AI.t('ai.build.nothing')), el('p', { 'data-i18n': 'ai.build.nothing_lead' }, AI.t('ai.build.nothing_lead'))), frame, codeBox));
    v.append(left, right);
    panel = AI.builder = new AI.ChatPanel(left, { kind: 'build', placeholder: () => AI.t('ai.build.placeholder'), empty, onDone, onCreate: show });
    panel.setConv(null); show();
    AI.onLang(() => { show(); for (const b of left.querySelectorAll('.tpl-row button')) b.title = AI.t('ai.build.tpl_tip', { name: b.textContent }); });
  };
})(window.AI);
