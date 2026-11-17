/* Slop AI Tools pages (ocr, speech, denoise, tags, portrait): each tool as the suite's View · Panel (shared/frame). The
 * page marks its controls: data-side="settings" (a setting: the panel's Settings section), data-side="save" (a button: the
 * panel's Save section) and data-side="main" (the main button: stuck to the panel's foot; the suite rule,
 * shared/frame/HANDOFF.md). Everything else (the drop zone, the picture, the text) stays in the view. Phones: the panel is
 * a bottom sheet whose foot (Settings + the main button) always shows. The controls keep their ids and listeners (the
 * page's own script wires them). Classic script, after the markup, before or after the page's script. */
(function (g) {
  'use strict';
  const tr = (k, en) => { const I = g.SlopI18n; return I && I.has(k) ? I.t(k) : en; };   // aitools/i18n, or English
  const doc = g.document, ui = doc.getElementById('ui');
  if (!ui || !g.SlopFrame || ui.dataset.framed) return;
  ui.dataset.framed = '1';
  const view = doc.createElement('div'), side = doc.createElement('aside');
  view.className = 'ai-view ai-stack'; view.id = 'aiView';
  side.className = 'ai-side'; side.id = 'aiSide'; side.setAttribute('aria-label', tr('aitools.frame.settings', 'Settings'));
  view.append(...ui.childNodes);
  ui.classList.remove('ai-stack');
  ui.append(view, side);
  const pick = (kind) => [...view.querySelectorAll('[data-side="' + kind + '"]')];
  const settings = pick('settings'), saves = pick('save'), main = pick('main');
  side.append(...settings, ...saves, ...main);
  const fr = g.SlopFrame.mount(ui, {
    list: null, view, panel: side, phone: '(max-width: 760px)', panelLabel: 'aitools.frame.settings',
    storageKey: 'aitools-' + (location.pathname.split('/').filter(Boolean).pop() || 'tool'), phoneButton: false, width: 300, min: 260,
  });
  // the page's title, in the current language when it is marked (data-i18n: the markup is translated only once parsed)
  const title = () => { const h = doc.querySelector('.ai-top h1'); return (h && (h.dataset.i18n ? tr(h.dataset.i18n, h.textContent) : h.textContent)) || tr('aitools.frame.tool', 'Tool'); };
  const panel = g.SlopFrame.panel(side, { title: title() });
  // built again on a language change, so the panel's words follow it
  function draw() {
    side.setAttribute('aria-label', tr('aitools.frame.settings', 'Settings'));
    panel.setTitle(title());
    panel.render([
      settings.length ? { title: tr('aitools.frame.settings', 'Settings'), key: 'settings', settings } : null,
      saves.length ? { title: tr('aitools.frame.save', 'Save'), key: 'save', actions: saves.map((el) => ({ el })) } : null,
    ]);
    if (main.length) panel.footer(main.map((el) => ({ el })), { more: tr('aitools.frame.settings', 'Settings') });
  }
  draw();
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(draw);
  g.SlopAIToolFrame = { frame: fr, panel };
})(typeof window !== 'undefined' ? window : globalThis);
