/* Slop Time page: the tabs, the one-second tick and the start-up. Classic script, loaded after every panel script.
 * Tabs (SlopTabs): World clock, My time, Meetings, Convert, Timers, Sync. The active tab is kept in the URL hash (#my).
 * A task page's link can name the first tab as ?tab=meet (tabOf), used when there is no #hash; it is not stored. */
(function () {
  'use strict';
  const ns = window.SlopTime;
  const TABS = [['world'], ['my'], ['meet'], ['conv'], ['timers'], ['sync']];   // the tab ids; their words are on the page (time.tab.<id>)
  const $ = ns.ui.$;
  let active = 'world', tabs = null;

  /** Shows one tab (SlopTabs, shared/ui/tabs.js: the panel, the selected tab, the arrow keys) and keeps it in the #hash. */
  function show(id) {
    if (!tabs.show(id)) return;
    active = id;
    if (location.hash !== '#' + id) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* sandboxed page */ } }
  }

  /** Pure: the tab a page address asks for (?tab=conv), or null for a missing or unknown one. */
  function tabOf(search) {
    const t = new URLSearchParams(search || '').get('tab');
    return TABS.some(([k]) => k === t) ? t : null;
  }

  function tick() {
    if (active === 'world') ns.world.render();
    if (active === 'my') ns.my.render();
    if (active === 'meet') ns.meet.render();
    if (active === 'conv') ns.conv.render();
    if (active === 'sync') ns.syncPanel.render();
    ns.clocks.tick();
  }

  function fillZoneList() {
    $('st-zones').replaceChildren(...ns.zones.list().map((z) => {
      const o = document.createElement('option');
      o.value = z;
      return o;
    }));
  }

  function boot() {
    fillZoneList();
    const device = () => { $('st-device').textContent = window.SlopI18n ? SlopI18n.t('time.dev.this', { zone: ns.state.device() }) : ns.state.device(); };
    device();
    tabs = window.SlopTabs.mount(document.querySelector('.st-tabs'), { select: show, panel: (k) => $('p-' + k) });
    ns.world.init();
    ns.my.init();
    ns.meet.init();
    ns.conv.init();
    ns.clocks.init();
    ns.syncPanel.init();
    const h = location.hash.slice(1);
    show(TABS.some(([k]) => k === h) ? h : tabOf(location.search) || 'world');
    setInterval(tick, 250);
    // a language change: the words each panel writes, drawn again (the static ones follow data-i18n)
    if (window.SlopI18n) SlopI18n.on(() => { device(); ns.world.render(true); ns.my.render(); ns.meet.render(); ns.conv.renderConvert(); ns.conv.renderDiff(); ns.syncPanel.render(); ns.clocks.tick(true); });
  }

  window.SlopTimeApp = { show, tick, tabOf, get active() { return active; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
