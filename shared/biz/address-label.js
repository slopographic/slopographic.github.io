// An address label for a parcel: a SlopLabel project (the label app's own .sloplabel file) on a 4 × 2" thermal roll, with
// who it is from, the name in bold, the address, and a reference (an order number). send() puts it in Slop Drive and opens
// it in SlopLabel through SlopHub, ready to print or to change. Classic script, loaded after biz.js.
// SlopBiz.addressLabel = { project({ name, lines, from, ref }) (pure), send(opts) }.
(function (g) {
  'use strict';
  const B = (g.SlopBiz = g.SlopBiz || {});
  const W = 101.6, H = 50.8;   // 4 × 2 inches, in millimetres (the label app's unit inside its files)

  /** The label project. name: who it goes to; lines: the address lines; from: the sender (empty to leave it out); ref: a
   *  reference such as the order number. Positions are millimetres; the label app fills in every other property. */
  function project({ name, lines = [], from = '', ref = '' }) {
    const text = (id, x, y, w, h, content, props) => ({ id, type: 'text', name: id, x, y, w, h, content, ...props });
    const objects = [
      from ? text('from', 4, 2.5, W - 8, 4, `From: ${from}`, { size: 7 }) : null,   // i18n-ignore: the label and the sheet are documents the user prints
      text('name', 4, 8, W - 8, 8, name || '', { size: 15, bold: true, fit: 'box', shrink: true }),
      { id: 'address', type: 'para', name: 'address', x: 4, y: 17.5, w: W - 8, h: 25, content: lines.filter(Boolean).join('\n'), size: 11, fit: 'box', shrink: true, wrap: true },
      ref ? text('ref', 4, H - 6.5, W - 8, 4, ref, { size: 7, align: 'right' }) : null,
    ].filter(Boolean);
    return {
      app: 'sloplabel', version: 1, name: `Address label${ref ? ` ${ref}` : ''}`, unit: 'in', dpi: 203,   // i18n-ignore: the label and the sheet are documents the user prints
      label: { w: W, h: H, radius: 1.5, margin: [1.5, 1.5, 1.5, 1.5], gap: 3, orientation: 'landscape' },
      stock: { kind: 'roll', id: 'roll-4x2', name: '4 × 2"', cols: 1, left: 0, hpitch: 0 },
      objects, vars: [], data: null, assets: {},
    };
  }

  /** Opens the label in SlopLabel (a new tab), through Slop Drive. Resolves to the Drive file id. */
  function send(opts) {
    const doc = project(opts);
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
    const from = opts.app || (g.SlopHub.self && g.SlopHub.self.app), name = `${doc.name}.sloplabel`;
    // the one way out (shared/intake/outtake.js), where the page has it
    if (g.SlopOuttake) return g.SlopOuttake.send('label', { from, get: () => blob, name, type: 'application/json' });
    return g.SlopHub.sendTo('label', blob, name, { from });
  }

  B.addressLabel = { project, send, SIZE: { w: W, h: H } };
})(typeof window !== 'undefined' ? window : globalThis);
