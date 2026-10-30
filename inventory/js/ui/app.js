// Slop Inventory boot: the business router (shared/biz/router.js) with one view per tab (products, scan, stock, count,
// reports, prices, data; #hash). Without a #view it opens the view Inventory was left on (ui/view-state.js), with its scroll. The open
// view is refreshed, with the settings re-read, whenever the store reports a change (from this tab or another one).
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});
  const U = NS.util;
  const VIEWS = ['products', 'scan', 'stock', 'count', 'reports', 'prices', 'data'];
  let place = null;

  NS.state = { settings: { currency: 'USD', locale: 'en-US', defaultTaxRate: 0 }, view: 'products' };

  /** Re-reads the settings and redraws the open view. */
  async function refresh() {
    NS.state.settings = await U.settings();
    const view = NS.views[NS.state.view];
    if (view && view.refresh) await view.refresh();
  }

  /** The view Inventory was left on, when the address names none. */
  async function start() {
    NS.state.settings = await U.settings();
    place = await NS.viewState.restore();
    return place && VIEWS.includes(place.view) ? place.view : null;
  }

  // Receive, Sell, Adjust and Transfer (and their answer) are the panel on the right of the stock view (shared/biz/panel.js),
  // one form at a time with its one main button at the panel's foot (ui/stock.js); on a phone a bottom sheet over the stock
  // levels whose closed state still shows that button and Stock actions. The product form is the products view's panel
  // the same way (ui/product-form.js), Create product / Save at its foot.
  const forms = document.querySelector('#view-stock .forms');
  if (g.SlopBiz.panel && forms) {
    forms.append(document.getElementById('sMsg'));
    NS.stockPanel = g.SlopBiz.panel.form({ app: 'inventory', key: 'stock', view: '#view-stock', form: forms, foot: ['#sApply'], label: 'inventory.ap.stock' });
  }
  if (g.SlopBiz.panel && document.getElementById('pForm')) {
    NS.productPanel = g.SlopBiz.panel.form({ app: 'inventory', key: 'product', view: '#view-products', form: '#pForm', foot: ['#pCancel', '#pSave'], label: 'inventory.ap.product' });
  }
  const app = g.SlopBiz.router.start({
    ns: NS, app: 'inventory', parse: (h) => ({ view: VIEWS.includes(h) ? h : 'products' }),
    start, refresh, ready: () => NS.viewState.restoreScroll(place),
  });
  NS.app = Object.assign(app, { refresh, refreshSoon: () => refresh() });
})(typeof window !== 'undefined' ? window : globalThis);
