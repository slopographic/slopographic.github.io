/* SlopOpenTabs: which app tabs are open right now, shared by every Slopographic page on this browser.
 * Each page says hello on a BroadcastChannel ('slopographic-shell') every 3 s and says bye when it
 * closes. A tab not heard from for 8 s is dropped. Exposes window.SlopOpenTabs (not SlopTabs, which is the view tab strip in shared/ui/tabs.js):
 *   list()        other open pages: [{ tab, app, name, url, seen }], newest hello first
 *   focus(tabId)  asks that page to bring its window to the front (browsers may refuse)
 *   id            this page's id */
(function () {
  'use strict';
  if (window.SlopOpenTabs) return;
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const peers = new Map();
  const STALE = 8000;
  let ch = null;
  try { ch = new BroadcastChannel('slopographic-shell'); } catch (e) { /* no channel: the list stays empty */ }
  const self = () => {
    const app = window.SlopShell && window.SlopShell.currentApp;
    return { tab: id, app: app ? app.id : '', name: app ? app.name : (document.title || 'Slopographic'), url: location.href };
  };
  const send = (m) => { if (ch) try { ch.postMessage(m); } catch (e) { /* closed channel */ } };
  const hello = () => send(Object.assign({ type: 'hello' }, self()));

  if (ch) {
    ch.onmessage = (e) => {
      const m = e.data;
      if (!m || typeof m !== 'object' || m.tab === id) return;
      if (m.type === 'hello') { peers.set(m.tab, { tab: m.tab, app: String(m.app || ''), name: String(m.name || ''), url: String(m.url || ''), seen: Date.now() }); }
      else if (m.type === 'bye') peers.delete(m.tab);
      else if (m.type === 'who') hello();
      else if (m.type === 'focus' && m.to === id) { try { window.focus(); } catch (err) { /* ignored */ } }
    };
    send({ type: 'who', tab: id });
    hello();
    setInterval(hello, 3000);
    addEventListener('pagehide', () => send({ type: 'bye', tab: id }));
  }

  window.SlopOpenTabs = {
    id,
    list() {
      const now = Date.now();
      for (const [k, v] of peers) if (now - v.seen > STALE) peers.delete(k);
      return [...peers.values()].sort((a, b) => b.seen - a.seen);
    },
    focus(tab) { send({ type: 'focus', to: tab, tab: id }); },
  };
})();
