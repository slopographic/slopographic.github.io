/* Slop Press — the panel dock: tabbed groups (Pages|Layers, Properties|Swatches, Paragraph|Character styles). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, h = U.h, ST = PR.store;
  var UI = PR.ui = PR.ui || {};
  var panels = {}, groups = [];
  UI.panels = panels;

  /** Registers a panel: { id, title (a string-table key), group, build(body), refresh(), grow, foot(el) } */
  UI.panel = function (def) { panels[def.id] = def; };
  UI.GROUPS = [{ ids: ['pages', 'layers'], grow: true }, { ids: ['props', 'swatches'] }, { ids: ['parastyles', 'charstyles'], grow: true }];

  UI.buildDock = function () {
    var dock = U.$('#dock'); dock.innerHTML = '';   // SlopSheet puts its × back at once
    var saved = ST.pref('dock') || {};
    groups = UI.GROUPS.map(function (g, gi) {
      var el = h('section', { class: 'dgroup' + (g.grow ? ' grow' : '') + (saved['c' + gi] ? ' collapsed' : '') });
      var tabs = h('div', { class: 'dtabs', role: 'tablist' }), body = h('div', { class: 'pbody' }), foot = h('div', { class: 'pfoot' });
      var grp = { el: el, tabs: tabs, body: body, foot: foot, ids: g.ids, cur: saved['t' + gi] && g.ids.indexOf(saved['t' + gi]) >= 0 ? saved['t' + gi] : g.ids[0] };
      g.ids.forEach(function (id) {
        var p = panels[id]; if (!p) return;
        var t = h('button', { type: 'button', class: 'dtab', role: 'tab', 'data-panel': id }, U.t(p.title));
        t.addEventListener('click', function () { if (el.classList.contains('collapsed')) toggle(grp, gi); select(grp, id); save(); });
        tabs.append(t);
      });
      var col = h('button', { type: 'button', class: 'dcollapse', 'aria-label': U.t('press.dock.collapse'), html: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 9l6 6 6-6"/></svg>' });
      col.addEventListener('click', function () { toggle(grp, gi); save(); });
      tabs.append(col);
      el.append(tabs, body, foot);
      dock.append(el);
      select(grp, grp.cur);
      return grp;
    });
    function save() { var o = {}; groups.forEach(function (g, i) { o['t' + i] = g.cur; o['c' + i] = g.el.classList.contains('collapsed'); }); ST.pref('dock', o); }
  };
  function toggle(grp) { grp.el.classList.toggle('collapsed'); }
  function select(grp, id) {
    grp.cur = id;
    U.$$('.dtab', grp.tabs).forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-panel') === id); t.setAttribute('aria-selected', String(t.getAttribute('data-panel') === id)); });
    grp.body.innerHTML = ''; grp.foot.innerHTML = '';
    var p = panels[id]; if (!p) return;
    p.body = grp.body; p.footEl = grp.foot;
    if (!PR.state.doc) return; p.footEl = grp.foot;
    p.build(grp.body, grp.foot);
    grp.foot.hidden = !grp.foot.childNodes.length;
  }
  UI.visiblePanel = function (id) { return groups.some(function (g) { return g.cur === id && !g.el.classList.contains('collapsed'); }); };
  UI.refreshPanels = function (which) {
    groups.forEach(function (g) {
      var p = panels[g.cur];
      if (!p || !PR.state.doc || g.el.classList.contains('collapsed') || (which && which !== g.cur)) return;
      if (p.refresh) p.refresh(); else { g.body.innerHTML = ''; g.foot.innerHTML = ''; p.build(g.body, g.foot); g.foot.hidden = !g.foot.childNodes.length; }
    });
  };
  UI.showPanel = function (id, sub) {
    var map = { styles: sub === 'char' ? 'charstyles' : 'parastyles' };
    id = map[id] || id;
    var app = U.$('#app');
    app.classList.remove('no-dock'); if (UI.dockSheet && UI.dockSheet.isPhone()) UI.dockSheet.open();
    groups.forEach(function (g) { if (g.ids.indexOf(id) >= 0) { g.el.classList.remove('collapsed'); select(g, id); g.el.scrollIntoView({ block: 'nearest' }); } });
  };
  UI.togglePanels = function () {
    if (UI.dockSheet && UI.dockSheet.isPhone()) return UI.dockSheet.toggle();   // a phone: the panels drawer
    U.$('#app').classList.toggle('no-dock');
    PR.view.resize();
  };
  /** Phones: the dock is a drawer from the right. SlopSheet (shared/ui/sheet.js) does the Panels button, the ×, Escape, a
   * tap outside and the swipe. */
  UI.attachDockSheet = function () {
    UI.dockSheet = SlopSheet.attach({ root: U.$('#app'), panel: U.$('#dock'), side: 'end', phone: '(max-width: 899px)', toggles: [U.$('#panelsToggle')], label: U.t('press.dock.panels') });
    // The suite rule (shared/frame/HANDOFF.md): the main button, Export PDF… (File ▸ Export PDF, Ctrl+E), sits at the foot
    // of the dock (the shared footer, shared/frame/panel.js).
    if (window.SlopFramePanel && window.SlopCmd) {
      var fp = SlopFramePanel.create(U.$('#dock'), { bare: true });
      var foot = function () {
        fp.footer([{ id: 'dockExport', label: U.t('press.dock.export_pdf'), primary: true, title: U.t('press.dock.export_pdf_tip', { key: 'Ctrl+E' }), run: function () { SlopCmd.run('file.exportPDF'); } }],
          { more: U.t('press.dock.panels'), onMore: function () { UI.dockSheet.toggle(); } });
      };
      foot(); U.onLang(foot);
    }
  };
  /** A language change: the tab names and the open panels again. */
  U.onLang(function () {
    groups.forEach(function (g) {
      U.$$('.dtab', g.tabs).forEach(function (t) { var p = panels[t.getAttribute('data-panel')]; if (p) t.textContent = U.t(p.title); });
      var c = g.tabs.querySelector('.dcollapse'); if (c) c.setAttribute('aria-label', U.t('press.dock.collapse'));
      if (!g.el.classList.contains('collapsed')) select(g, g.cur);
    });
  });
  /** Builds a small icon button for panel footers. */
  UI.footBtn = function (icon, title, fn) {
    var b = h('button', { type: 'button', class: 'ibtn', title: title, 'aria-label': title, html: PR.kit.icon(icon) });
    b.addEventListener('click', fn); return b;
  };
})();
