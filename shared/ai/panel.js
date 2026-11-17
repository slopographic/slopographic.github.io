/* Slop AI side panel: an AI chat any Slopographic page can embed with ONE tag:
 *     <script src="(../)shared/ai/panel.js" defer></script>
 * The shell's header AI button (shell/header.js) loads it on the first click, so no page carries it at first paint.
 * Optional attributes on the tag: data-button="false" (no floating button; open it yourself), data-app="<app id>".
 * Wide screens: the panel sits beside the app (the page narrows by its width above 900 px). Phones (≤ 640 px): a
 * bottom sheet (shared/ui/sheet.js, SlopSheet). It reuses a model already loaded in another tab (Slop AI) over the
 * bridge, or one downloaded before ("Use"); with none, it shows the model choice (picker.js, shared with Slop AI).
 * With "Control <app>" on, the model runs the app's SlopCmd commands with their arguments (cmdtools.js); each one is a
 * step in the chat ("Gaussian blur, radius 8 ✓"), Stop ends the run between steps, destructive ones ask first, and
 * "Undo all AI changes" rolls the app back to before the last request (SlopCmd.checkpoint). The run is panel-run.js.
 * Own AI account (shared/ai/cloud/): a provider connected with the person's own key is just another engine; the
 * header names it ("Claude · Claude Opus 5.5"), the foot says where requests go, and the provider chosen last comes
 * back on the next page when its key is still in this browser. It is never shared with other tabs over the bridge.
 * Back from "Sign in with OpenRouter" (cloud/signin.js), the panel opens on the model choice to finish it.
 * The message box: Up and Down recall what was sent before, in every app (history.js); Ctrl+A and the other editing keys
 * stay the box's (shared/input/typing.js keeps the app's shortcuts off them). Beside it, the AI permissions mode
 * (permissions-ui.js modeControl). Open or closed is remembered on this device ('slop-ai.open'): shell/header.js opens
 * the panel again on the next app, except on a phone, where it would cover the page.
 * API: window.SlopAIPanel = { open({ auto }), close(), toggle(), send(text), use(engine), get messages(), ready (all of the
 *   kit), chatReady (what the chat needs: the composer works from then), isOpen, OPEN_KEY }. */
(function () {
  'use strict';
  if (window.SlopAIPanel) return;
  const me = document.currentScript;
  const base = me ? new URL('./', me.src).href : new URL('../shared/ai/', location.href).href;
  const opts = { button: !me || me.dataset.button !== 'false', app: me && me.dataset.app };
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  K.base = K.base || base;
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai.js
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'panel.css'; document.head.append(css);
  const add = (src, test) => new Promise((res, rej) => { if (test && test()) return res(); const s = document.createElement('script'); s.src = new URL(src + '.js', base).href; s.async = false; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); });
  const sheetP = add('../ui/sheet', () => window.SlopSheet);
  // a sign-in started in this tab (cloud/signin.js): that file at once, so it takes a returned code out of the address
  const signing = () => { try { return !!sessionStorage.getItem('slop-ai.signin'); } catch (e) { return false; } };
  if (signing()) add('cloud/signin', () => K.cloud && K.cloud.signin).catch(() => {});   // a phone's bottom sheet: as soon as it is here, not after the kit
  // The kit in two parts, each requested at once (K.load): what the chat needs (the composer works when it is in), then
  // what waits (permission settings, the model menu, pictures), which a send also waits for. A part that fails says so.
  const CORE = ['permissions', 'app-skills', 'apptools', 'cmdtools', 'toolbox', 'prompt', 'filetools', 'optools', 'handoff', 'md', 'makers', 'catalog', 'picker', 'panel-run',
    'quick/engine', 'quick/context', 'quick/shared', 'quick/ui'];   // the ready-made prompts (quick/ui.js), their words: i18n/index
  const LATER = ['permissions-ui', '../ui/menubutton', 'model-menu', 'imagegen/index'];
  K.panelKit = { CORE, LATER };
  const OPEN_KEY = 'slop-ai.open';   // '1' open, '0' closed: what the person did last, on any app (read by shell/header.js)
  const remember = (on) => { try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked */ } };
  const kit = Promise.all([add('slopai', () => window.SlopAI), add('history', () => K.history), add('../commands/args', () => window.SlopCmdArgs), sheetP, add('../ui/resize-panel', () => window.SlopResizePanel),
    add('i18n/index', () => !window.SlopI18n || SlopI18n.shipped('prompts').length)])
    .then(() => Promise.all([window.SlopAI.loaded, K.load(CORE), window.SlopI18n && SlopI18n.ready()]))
    .then(() => takeHandoff()).then(() => restoreCloud()).then(() => signedIn());
  const extras = kit.then(() => K.load(LATER)).then(() => K.imageGenReady && K.imageGenReady.catch(() => null));
  kit.then(() => extras.catch(() => null)).then(() => { if (P.pending && P.engine()) runPending(); }, () => {});
  kit.catch((e) => { P.kitError = e; if (root) P.render(); });
  extras.catch((e) => { if (!P.kitError) { P.kitError = e; P.kitPart = 'later'; } if (root) P.render(); });
  const allReady = kit.then(() => extras.catch(() => null));
  allReady.catch(() => {});   // reported in the panel (kit.catch)
  /** A message sent before the kit is in waits for it (the composer is there at once). */
  function sendWhenReady(t) {
    if (t == null && K.history) K.history.add(P.input.value.trim());   // what the person typed, for Up next time
    if (P.recall) P.recall.reset();
    return kit.then(() => extras.catch(() => null)).then(() => P.send(t));
  }
  /** Up and Down in the message box (history.js): on the first or last line only, never while an IME composes. */
  const recall = () => P.recall || (K.history && P.input && (P.recall = K.history.cursor(() => P.input.value, (t) => { P.input.value = t; P.input.setSelectionRange(t.length, t.length); })));
  function onComposerKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!P.busy) sendWhenReady(); }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.isComposing && e.keyCode !== 229 && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && recall()) {
      const up = e.key === 'ArrowUp';
      if (K.history.atEdge(P.input, up ? 'up' : 'down') && (up ? P.recall.up() : P.recall.down())) e.preventDefault();
    }
    if (e.key !== 'Escape') e.stopPropagation();
  }
  /** A request handed over from another app (handoff.js): its conversation, a line saying so, and its task, sent as soon
   * as a model is there. */
  function takeHandoff() {
    const ho = K.handoff && K.handoff.take(appId());
    if (!ho) return;
    const dk = ho.line ? ho.dk : ho.fromName ? 'ui.ai.panel.continued' : 'ui.ai.panel.continued_other', dv = ho.line ? ho.dv : { app: ho.fromName };
    P.messages.push(...(ho.messages || []), { role: 'assistant', content: '', display: ho.line || T(dk, dv), dk, dv, note: true, handoff: true });
    P.pending = ho.task; P.chain = ho.chain || null;
    if (!root || root.hidden) open();
  }
  function runPending() { const t = P.pending; P.pending = null; if (t) setTimeout(() => P.send(t), 0); }
  /** Back from "Sign in with OpenRouter" (cloud/signin.js took the code out of the address): the panel opens on the model
   * choice, whose form (cloud/connect.js) finishes the sign-in and tests the connection. */
  function signedIn() {
    if (!signing()) return null;
    return K.picker.loadCloud().then(() => {
      if (!K.cloud.signin.returned()) return;
      if (!root || root.hidden) open();
      if (P.engine() || P.messages.length) { P.choosing = true; P.setting = false; if (P.pickBox) P.pickBox.remove(); P.pickBox = null; }
      P.render();
    }).catch((e) => console.warn('Slop AI: sign-in', e));
  }
  /** The provider chosen last, when its key is still here (keys.js keeps no key in localStorage, only which one). */
  function restoreCloud() {
    let s = null; try { s = JSON.parse(localStorage.getItem('slop-ai.cloud') || 'null'); } catch (e) { s = null; }
    if (!s || !s.active || P.local) return null;
    return K.picker.loadCloud().then(() => K.cloud.connect.restore(appId())).then((eng) => { if (eng && !P.local) P.use(eng); }).catch((e) => console.warn('Slop AI: own key', e));
  }

  const h = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); return n; };
  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/></svg>';
  const appId = () => opts.app || (window.SlopHub && SlopHub.self && SlopHub.self.app) || location.pathname.split('/').filter(Boolean)[0] || 'home';
  const appName = () => { const a = (window.SLOP_APPS || []).find((x) => x.id === appId()); return a ? a.name : T('ui.ai.this_page'); };
  const WIDE = '(min-width: 901px)';

  const P = { messages: [], local: null, busy: null, h, appId, appName, K, T };
  /** What a message shows: a note made from a key (dk, dv) in the language now, else its text. */
  P.shown = (m) => (m.dk ? T(m.dk, m.dv) : m.display != null ? m.display : m.content);
  let host = null, root = null, sheet = null;

  function build() {
    if (root) return;
    P.toolsBox = h('input', { type: 'checkbox', checked: !!window.SlopCmd });
    P.input = h('textarea', { rows: 2 });
    P.sendBtn = h('button', { type: 'button', class: 'sap-send', onclick: () => (P.busy ? P.stop() : sendWhenReady()) }, '↑');
    P.input.addEventListener('keydown', onComposerKey);
    P.input.addEventListener('input', () => { if (P.recall) P.recall.reset(); });   // typing starts the recall over
    P.list = h('div', { class: 'sap-list', role: 'log', 'aria-live': 'polite' });
    P.status = h('button', { type: 'button', class: 'sap-status' });   // the quick model menu (model-menu.js)
    P.undoBtn = h('button', { type: 'button', class: 'sap-btn sap-undo', hidden: true, onclick: () => P.undoAll() });
    root = h('aside', { class: 'sap ssh-panel', role: 'complementary', 'aria-label': 'Slop AI', hidden: true },
      h('header', null, h('span', { class: 'sap-logo', html: null }), h('b', null, 'Slop AI'), P.status,
        P.gear = h('button', { type: 'button', class: 'sap-gear', onclick: () => extras.catch(() => null).then(() => P.settings()) }, '⚙'),
        P.xBtn = h('button', { type: 'button', class: 'sap-x', onclick: close }, '×')),
      P.list,
      P.bar = h('div', { class: 'sap-bar' }, h('label', { class: 'sap-tools' }, P.toolsBox, ' ', P.toolsText = h('span')), P.undoBtn),
      h('div', { class: 'sap-comp' }, P.input, P.sendBtn),
      P.foot = h('div', { class: 'sap-foot' }));
    root.querySelector('.sap-logo').innerHTML = SPARK;
    host = h('div', { class: 'sap-host' }, root);
    document.body.append(host);
    P.words();
    P.render();
    if (K.quickUI) K.quickUI.mount();   // the prompts button and list (else quick/ui.js mounts itself when it arrives)
    // the model menu arrives with the later part; a tap before then opens it as soon as it is in (or the model choice)
    const early = () => { if (!P.modelMenu) extras.catch(() => null).then(() => (P.modelMenu ? P.modelMenu.open() : P.choose())); };
    P.status.addEventListener('click', early);
    extras.then(() => { const Pm = window.SlopAIPermissions; if (Pm && Pm.modeControl && !P.modeSel) P.bar.insertBefore(P.modeSel = Pm.modeControl(), P.undoBtn); }, () => {});
    extras.then(() => { if (K.modelMenu) K.modelMenu.attach(P); P.status.removeEventListener('click', early); if (!P.modelMenu) P.status.addEventListener('click', () => P.choose()); }, () => {});
  }
  function fab() {
    if (!opts.button || document.querySelector('.sap-fab')) return;
    const b = h('button', { type: 'button', class: 'sap-fab', title: 'Slop AI', 'aria-label': T('ui.ai.panel.open'), onclick: toggle });
    b.innerHTML = SPARK; document.body.append(b);
  }
  /** The words of the parts built once (the header, the bar, the composer), again after a language change. */
  P.words = function () {
    const fabEl = document.querySelector('.sap-fab');
    if (fabEl) fabEl.setAttribute('aria-label', T('ui.ai.panel.open'));
    if (!root) return;
    P.input.placeholder = T('ui.ai.panel.placeholder', { app: appName() });
    P.input.setAttribute('aria-label', T('ui.ai.panel.message'));
    P.sendBtn.setAttribute('aria-label', T(P.busy ? 'ui.ai.panel.stop' : 'ui.ai.panel.send'));
    if (P.busy) P.sendBtn.textContent = T('ui.ai.panel.stop');
    P.status.title = T('ui.ai.panel.change_model');
    P.undoBtn.textContent = '↶ ' + (P.undoN ? T('ui.ai.panel.undo_all_n', { n: P.undoN }) : T('ui.ai.panel.undo_all'));
    P.gear.title = T('ui.ai.panel.permissions'); P.gear.setAttribute('aria-label', P.gear.title);
    P.xBtn.setAttribute('aria-label', T('ui.ai.panel.close'));
    P.toolsText.textContent = T('ui.ai.panel.control', { app: appName() });
    for (const b of root.querySelectorAll('.sap-back')) b.textContent = '← ' + T('ui.ai.panel.back');   // over a model choice kept as it is
  };

  P.engine = () => (P.local && P.local.loaded ? P.local : window.SlopAI && SlopAI.engine());
  P.renderStatus = function () {
    if (!P.status) return;
    const m = window.SlopAI && SlopAI.model, fabEl = document.querySelector('.sap-fab');
    if (fabEl) fabEl.classList.toggle('on', !!m);
    document.querySelectorAll('.sh-ai').forEach((b) => b.classList.toggle('on', !!m));
    const c = P.local && P.local.kind === 'cloud' && P.local.loaded ? P.local.info() : null;
    const name = m && (m.name || m.id || T('ui.ai.panel.model'));
    P.status.textContent = c ? `${c.short} · ${c.name}` : m ? (m.kind === 'remote' ? T('ui.ai.panel.status_shared', { name }) : m.kind === 'fake' ? T('ui.ai.panel.status_demo', { name }) : name) : T('ui.ai.panel.no_model');
    P.status.classList.toggle('cloud', !!c);
    if (P.foot) P.foot.textContent = c ? T(P.local.provider.local ? 'ui.ai.panel.foot_local' : 'ui.ai.panel.foot_cloud', { who: c.who }) : T('ui.ai.panel.foot_device');
  };
  /** Forget key: the engine that used it stops here too. */
  P.forgot = (p) => { if (P.local && P.local.kind === 'cloud' && P.local.provider.id === p.id) { P.local = null; P.renderStatus(); } };
  /** The model choice again (the header's model name), over the chat; Back returns to it. */
  P.choose = function () { P.choosing = !P.choosing; P.setting = false; if (P.pickBox) P.pickBox.remove(); P.pickBox = null; P.render(); };
  /** AI permissions (permissions-ui.js): the mode and the remembered "always allow" rules, over the chat. */
  P.settings = function () { P.setting = !P.setting; P.choosing = false; P.pickBox = null; P.render(); };
  P.render = function () {
    if (!P.list) return;
    P.renderStatus();
    const picking = ((!P.messages.length && !P.engine()) || P.choosing) && K.picker;
    if (picking && P.pickBox && P.pickBox.isConnected) return;   // keep the model choice (and a download in progress) as it is
    P.list.textContent = ''; P.pickBox = null;
    if (P.kitError) P.list.append(h('p', { class: 'sap-kit-error', role: 'alert' }, T(P.kitPart === 'later' ? 'ui.ai.panel.kit_error_part' : 'ui.ai.panel.kit_error', { error: P.kitError.message || String(P.kitError) })));
    if (P.undoBtn) P.undoBtn.hidden = !P.rollback;   // the button follows what can still be undone
    if (P.setting && window.SlopAIPermissions && SlopAIPermissions.renderSettings) {
      const box = h('div', { class: 'sap-empty sap-settings' });
      P.list.append(h('button', { type: 'button', class: 'sap-btn sap-back', onclick: () => P.settings() }, '← ' + T('ui.ai.panel.back')), box);
      SlopAIPermissions.renderSettings(box, { app: appId(), appName: appName() });
      if (K.handoff) K.handoff.renderSetting(box);
      return;
    }
    if (P.choosing && K.picker) {
      const box = P.pickBox = h('div', { class: 'sap-empty' });
      P.list.append(h('button', { type: 'button', class: 'sap-btn sap-back', onclick: () => P.choose() }, '← ' + T('ui.ai.panel.back')), box);
      K.picker.render(box, { appName: appName(), appId: appId(), tools: () => P.toolsBox.checked, cloudOpen: true, onReady: (eng) => { P.choosing = false; P.use(eng); }, onForget: P.forgot });
      return;
    }
    if (!P.messages.length) {
      if (P.engine()) P.list.append(h('div', { class: 'sap-empty' }, T('ui.ai.panel.empty', { app: appName() }), K.quickUI ? K.quickUI.chips() : null));
      else if (picking) {
        const box = P.pickBox = h('div', { class: 'sap-empty' });
        P.list.append(box);
        K.picker.render(box, { appName: appName(), appId: appId(), tools: () => P.toolsBox.checked, onReady: (eng) => P.use(eng), onForget: P.forgot });
      } else if (!P.kitError) P.list.append(h('div', { class: 'sap-empty sap-loading' }, T('ui.ai.panel.loading')));
    }
    if (P.viewAll) P.list.append(...P.viewAll(P.messages));
    else for (const m of P.messages) P.list.append(h('div', { class: 'sap-msg ' + m.role }, P.shown(m)));
    P.list.scrollTop = P.list.scrollHeight;
  };
  /** A model this page loaded itself (the picker, a test's fake engine): used here and shared with other tabs. */
  P.use = function (eng) {
    P.local = eng;
    if (window.SlopAI && eng && eng.kind !== 'cloud') SlopAI.use(eng);   // a key-based engine stays in this page
    P.render();
    if (P.pending && eng) runPending();
  };

  const beside = () => window.matchMedia && matchMedia(WIDE).matches;
  function layout() {
    const on = !!root && !root.hidden;
    document.documentElement.classList.toggle('sap-beside', on && beside());
    document.body.classList.toggle('sap-open', on);
    window.dispatchEvent(new Event('resize'));   // the app re-fits its canvas to the narrower page
  }
  let sizer = null;
  function attachSheet() {
    // its width: dragged on its edge, kept per app (shared/ui/resize-panel.js, the one implementation for every side panel)
    if (!sizer && window.SlopResizePanel) sizer = SlopResizePanel.attach(root, { app: opts.app, id: 'ai', edge: 'start', width: 380, min: 300, max: 720, phone: '(max-width: 900px)', label: 'Slop AI',
      apply: (px) => { if (px != null) document.documentElement.style.setProperty('--sap-w', px + 'px'); else document.documentElement.style.removeProperty('--sap-w'); if (root && !root.hidden) window.dispatchEvent(new Event('resize')); } });
    if (sheet || !window.SlopSheet) return;
    sheet = SlopSheet.attach({ root: host, panel: root, side: 'bottom', phone: '(max-width: 640px)', label: 'Slop AI',
      onChange: (open, why) => { if (!open && why !== 'api' && why !== 'wide') { root.hidden = true; remember(false); layout(); } } });
  }
  /** auto: shell/header.js reopening it on the next app (not remembered again, and the app keeps the focus). */
  function open(o) {
    const auto = !!(o && o.auto);
    if (!auto) remember(true);
    build(); attachSheet();
    if (!sizer) kit.then(attachSheet).catch(() => {});   // the resize module arrives with the kit
    root.hidden = false;
    if (sheet && sheet.isPhone()) sheet.open();
    else if (!sheet) sheetP.then(() => { attachSheet(); if (sheet && sheet.isPhone() && !root.hidden) { sheet.open(); layout(); } }).catch(() => {});
    layout(); P.renderStatus();
    if (!auto) setTimeout(() => P.input.focus({ preventScroll: true }), 0);
    kit.then(P.render).catch(() => {});   // a kit that failed shows its error line (kit.catch above)
    return kit;
  }
  function close() { remember(false); if (sheet && sheet.isOpen()) sheet.close(); if (root) root.hidden = true; layout(); }
  function toggle() { if (root && !root.hidden) close(); else open(); }
  if (window.matchMedia) matchMedia(WIDE).addEventListener('change', layout);

  const start = () => { fab(); kit.then(() => { SlopAI.on('change', () => { P.renderStatus(); if (root && !P.messages.length) P.render(); }); P.renderStatus(); }).catch((e) => console.warn('Slop AI panel:', e.message)); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  // a language change: the words built once, then the chat again (not during a reply; the model choice redraws itself)
  if (window.SlopI18n && SlopI18n.on) SlopI18n.on(() => { P.words(); P.renderStatus(); if (root && !P.busy) P.render(); });
  window.SlopAIPanel = { open, close, toggle, OPEN_KEY, send: (t) => { open(); return sendWhenReady(t); }, use: (e) => kit.then(() => P.use(e)),
    get messages() { return P.messages; }, get isOpen() { return !!root && !root.hidden; },
    ready: allReady, chatReady: kit, _p: P };
  K.panel = P;
})();
