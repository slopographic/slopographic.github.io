// Slop Orders: the sample buttons on the list ("Random sample", "Random samples…", "Delete all samples") and the
// editor's "Random sample" action for a new order. The behaviour is in shared/docs/samples-dialog.js.
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const D = g.SlopDocs.samples;
  const $ = (id) => document.getElementById(id);
  const getIO = () => NS.samples.io();
  const refresh = () => { if (NS.views && NS.views.list) NS.views.list.refresh(); };

  /** One random order now (a draft); it opens in the editor. */
  const quick = () => D.quick({ kind: 'order', getIO, onDone: (made) => { refresh(); NS.app.go(`o/${made.id}`); } });
  const options = () => D.options({ kind: 'order', getIO, onDone: refresh });
  const deleteAll = () => D.deleteAll({ kind: 'order', getIO, onDone: refresh });

  function mount() {
    $('oSample').addEventListener('click', quick);
    $('oSamples').addEventListener('click', options);
    $('oDelSamples').addEventListener('click', deleteAll);
  }

  NS.sampleActions = { quick, options, deleteAll, mount };
})(typeof window !== 'undefined' ? window : globalThis);
