/* SlopAIPermissions, the part people see (after permissions.js; needs SlopUI). Classic script; sets on window.SlopAIPermissions:
 *   prompt(req) → Promise<'once' | 'request' | 'visit' | 'always' | 'deny'>
 *       the question for one action. It names the action ("Crop, ratio 1:1"), the app and what kind of action it is, then
 *       offers Allow once · Allow for this request · Allow <kind> for this visit · Always allow <kind> in <app> · Deny.
 *       Closing it (×, Escape) is Deny.
 *   renderSettings(box, { app, appName, onChange }) → the panel's "AI permissions": the mode (three choices, the last
 *       with a plain warning) and the remembered "always allow" rules, each with Remove.
 *   modeControl() → a compact switch for the mode (a <select> with MODES' short labels) that the panel shows by the
 *       message box, as Claude Code shows its permission mode. Choosing "Allow everything" shows its warning first
 *       (Cancel keeps the mode); it follows a switch made anywhere else (the settings, another tab).
 * Styles are injected once (class names sap-perm-*), so any page with SlopUI can ask, not only the AI panel. */
(function (g) {
  'use strict';
  const P = g.SlopAIPermissions;
  if (!P || P.renderSettings) return;
  const CSS = `.sui-dlg.sap-perm-dlg { max-width: min(440px, calc(100vw - 24px)); }
.sap-perm-dlg .sui-foot { flex-direction: column; align-items: stretch; gap: 6px; }
.sap-perm-dlg .sui-foot .sui-btn { width: 100%; justify-content: center; margin: 0; }
.sap-perm-act { font-weight: 600; font-size: 15px; margin: 0 0 6px; word-break: break-word; }
.sap-perm-kind { opacity: .75; font-size: 12px; margin: 8px 0 0; }
.sap-perm { display: grid; gap: 8px; }
.sap-perm label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
.sap-perm label input { margin-top: 3px; }
.sap-perm-warn { color: #ff8a98; font-size: 12px; margin: 0 0 0 24px; }
.sap-perm-rules { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.sap-mode { max-width: 11.5em; height: 28px; font-size: 12px; padding: 0 4px; border-radius: 6px; border: 1px solid var(--p-line, #8884); background: var(--p-input, transparent); color: inherit; }
.sap-mode.all { border-color: #ff8a98; }
.sap-perm-rules li { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12.5px; }`;
  function style() {
    if (document.getElementById('sap-perm-css')) return;
    const s = document.createElement('style'); s.id = 'sap-perm-css'; s.textContent = CSS; document.head.append(s);
  }
  const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { if (attrs[k] == null || attrs[k] === false) continue; if (k === 'class') n.className = attrs[k]; else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k] === true ? '' : attrs[k]); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); return n; };
  const kindName = (kind) => (P.KINDS[kind] || P.KINDS.delete).name;
  const T = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);   // the words: shared/i18n/ui/<code>/ai2.js
  const onLang = (fn) => (g.SlopI18n && g.SlopI18n.on ? g.SlopI18n.on(fn) : () => {});

  P.prompt = function (req) {
    if (!g.SlopUI || !g.SlopUI.dialog) return Promise.resolve(g.confirm(`${req.action}\n\n${req.detail || ''}`) ? 'once' : 'deny');
    style();
    const app = req.appName || T('ui.ai.this_app'), k = kindName(req.kind);
    const body = el('div', null,
      el('p', { class: 'sui-p sap-perm-act' }, req.action || T('ui.ai.perm.an_action')),
      req.detail ? el('p', { class: 'sui-p' }, req.detail) : null,
      el('p', { class: 'sui-p sap-perm-kind' }, req.step ? T('ui.ai.perm.kind_line_step', { kind: k, step: req.step }) : T('ui.ai.perm.kind_line', { kind: k })));
    return new Promise((resolve) => {
      let choice = 'deny';
      const pick = (c) => () => { choice = c; };
      g.SlopUI.dialog({ title: req.title || T('ui.ai.perm.title', { app }), body, cls: 'sap-perm-dlg',
        buttons: [
          { label: T('ui.ai.perm.allow_once'), primary: true, act: pick('once') },
          { label: T('ui.ai.perm.allow_request'), act: pick('request') },
          { label: T('ui.ai.perm.allow_visit', { kind: k }), act: pick('visit') },
          { label: T('ui.ai.perm.allow_always', { kind: k, app }), act: pick('always') },
          { label: T('ui.ai.perm.deny'), act: pick('deny') },
        ],
        onClose: () => resolve(choice) });
    });
  };

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  P.modeControl = function () {
    style();
    const sel = el('select', { class: 'sap-mode' }, P.MODES.map((m) => el('option', { value: m.id })));
    const words = () => {
      sel.setAttribute('aria-label', T('ui.ai.panel.permissions')); sel.title = T('ui.ai.perm.what');
      for (const o of sel.options) { const m = P.MODES.find((x) => x.id === o.value); o.title = m.note; o.textContent = m.short || m.label; }
    };
    words(); onLang(words);
    const sync = () => { sel.value = P.mode(); sel.classList.toggle('all', sel.value === 'all'); };
    sel.addEventListener('change', async () => {
      const m = P.MODES.find((x) => x.id === sel.value);
      if (m && m.warning) {
        const ok = g.SlopUI && g.SlopUI.confirm ? await g.SlopUI.confirm(m.question || m.label, m.warning, m.label, { danger: true }) : g.confirm(m.warning);
        if (!ok) return sync();
      }
      P.setMode(sel.value); sync();
    });
    g.addEventListener('slopaipermissions', sync);
    g.addEventListener('storage', (e) => { if (!e.key || /^slop-ai\.permissions/.test(e.key)) sync(); });
    sync();
    return sel;
  };

  P.renderSettings = function (box, o = {}) {
    style();
    const wrap = el('div', { class: 'sap-perm' });
    const draw = () => {
      wrap.textContent = '';
      const now = P.mode();
      wrap.append(el('b', null, T('ui.ai.panel.permissions')),
        el('p', { class: 'sap-dim' }, T('ui.ai.perm.intro')));
      for (const m of P.MODES) {
        const r = el('input', { type: 'radio', name: 'sap-perm-mode', value: m.id, checked: m.id === now || null, class: 'sap-perm-mode' });
        r.addEventListener('change', () => { P.setMode(m.id); draw(); if (o.onChange) o.onChange(m.id); });
        wrap.append(el('label', null, r, el('span', null, el('span', null, m.label), el('br'), el('span', { class: 'sap-dim' }, m.note))));
        if (m.warning && m.id === now) wrap.append(el('p', { class: 'sap-perm-warn', role: 'alert' }, m.warning));
      }
      const list = P.rules();
      wrap.append(el('b', null, T('ui.ai.perm.always_h')));
      if (!list.length) wrap.append(el('p', { class: 'sap-dim sap-perm-none' }, T('ui.ai.perm.none')));
      else wrap.append(el('ul', { class: 'sap-perm-rules' }, list.map((r) => el('li', null, el('span', null, cap(T('ui.ai.perm.rule', { kind: kindName(r.kind), app: r.appName || r.app }))),
        el('button', { type: 'button', class: 'sap-btn sap-perm-remove', 'data-kind': r.kind, 'data-app': r.app, onclick: () => { P.removeRule(r.kind, r.app); draw(); if (o.onChange) o.onChange(); } }, T('ui.remove'))))));
    };
    draw();
    const off = onLang(() => { if (wrap.isConnected) draw(); else off(); });
    box.append(wrap);
    return wrap;
  };
})(window);
