// The split view: two panes side by side for one anchor day, such as a month on the left and a day on the right (the pair
// is chosen in the toolbar and remembered). A click on a day in the left pane (a month cell, or a week column heading)
// makes it the anchor, so the right pane shows it. Exposes window.SlopCal.split.
(function (g) {
  'use strict';
  const UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopCal = g.SlopCal || {});

  /** Draws both panes into root. ctx is the app's view context, with pair ({ left, right }) and select(day). */
  function render(root, anchor, ctx) {
    const { pair } = ctx;
    const left = el('div', { class: 'sp-pane', role: 'region', 'aria-label': `${pair.left} pane`, 'data-pane': pair.left });
    const right = el('div', { class: 'sp-pane', role: 'region', 'aria-label': `${pair.right} pane`, 'data-pane': pair.right });
    root.replaceChildren(el('div', { class: 'sp' }, left, right));
    drawPane(left, pair.left, anchor, { ...ctx, selectDay: ctx.select });
    drawPane(right, pair.right, anchor, ctx);
  }

  /** One pane: a month grid, or a time grid of one or seven days. */
  function drawPane(root, view, anchor, ctx) {
    if (view === 'month') NS.month.render(root, anchor, ctx);
    else NS.timegrid.render(root, NS.periods.daysOf(view, anchor), ctx);
  }

  NS.split = { render };
})(typeof window !== 'undefined' ? window : globalThis);
