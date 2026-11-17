// Slop Invoices: the sample buttons on the list ("Random sample", "Random samples…", "Delete all samples") and the
// editor's "Random sample" action for a new draft. The behaviour is in shared/docs/samples-dialog.js.
(function (g) {
  'use strict';
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const D = g.SlopDocs.samples;
  const $ = (id) => document.getElementById(id);
  const getIO = () => NS.samples.io();
  const refresh = () => { if (NS.views && NS.views.list) NS.views.list.refresh(); };

  /** One random invoice now; it opens in the editor. */
  const quick = () => D.quick({ kind: 'invoice', getIO, onDone: (made) => { refresh(); NS.app.go(`i/${made.id}`); } });
  const options = () => D.options({ kind: 'invoice', getIO, onDone: refresh });
  const deleteAll = () => D.deleteAll({ kind: 'invoice', getIO, onDone: refresh });

  function mount() {
    $('iSample').addEventListener('click', quick);
    $('iSamples').addEventListener('click', options);
    $('iDelSamples').addEventListener('click', deleteAll);
  }

  NS.sampleActions = { quick, options, deleteAll, mount };
})(typeof window !== 'undefined' ? window : globalThis);
