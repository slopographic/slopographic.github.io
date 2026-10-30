// Slop Admin boot: the business router (shared/biz/router.js) with one view per tab (start, company, numbering, taxes, data,
// storage; #hash). Without a #hash it opens on Get started until the first steps are done, else on Company. The open tab is
// redrawn whenever the store reports a change.
(function (g) {
  'use strict';
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const VIEWS = ['start', 'company', 'numbering', 'taxes', 'data', 'storage'];
  NS.state = { view: 'company' };

  /** Draws the open tab. */
  async function render() {
    const v = NS.views[NS.state.view];
    if (v && v.render) await v.render();
  }

  /** Get started while a first step is still open. */
  async function start() {
    const r = await g.SlopBiz.setup.load();
    return r.ok && r.value.done < r.value.total ? 'start' : null;
  }

  const app = g.SlopBiz.router.start({ ns: NS, app: 'admin', parse: (h) => ({ view: VIEWS.includes(h) ? h : 'company' }), start, refresh: render });
  if (g.SlopI18n) g.SlopI18n.on(() => { if (NS.app && NS.app.booted) render(); });   // the open tab in the new language
  NS.app = Object.assign(app, { render, refreshSoon: () => render() });
})(typeof window !== 'undefined' ? window : globalThis);
