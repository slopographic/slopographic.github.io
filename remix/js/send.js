/* Reel Remix: send the project to SlopCut through Slop Drive, the way Slop Gallery sends a reel. Every clip is
   stored in Drive, the manifest (type application/x-slop-reel+json, with the remix options) is stored too, and
   SlopCut opens the manifest with ?drive=<id>. SlopCut replays the same plan from the same options. */
(function () {
  'use strict';
  const RM = window.RM;
  const TYPE = 'application/x-slop-reel+json';
  /** Store the clips and the manifest in Slop Drive, then open SlopCut on the manifest. */
  RM.sendToSlopCut = async function () {
    const st = RM.state;
    if (!window.SlopHub) { $('rm-status').textContent = RM.t('remix.send.no_drive'); return null; }
    if (!RM.media().length) { $('rm-status').textContent = RM.t('remix.ui.add_first'); return null; }
    if (!st.plan) RM.remix();
    $('rm-status').textContent = RM.t('remix.send.sending');
    const ids = [];
    for (const it of RM.media()) ids.push(await SlopHub.put(it.file, { name: it.name, from: 'remix' }));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '.');
    const blob = new Blob([JSON.stringify(RM.manifest(ids), null, 1)], { type: TYPE });
    const name = 'Remix ' + stamp + '.reel.json'; // i18n-ignore: a file name
    const mid = await SlopHub.put(blob, { name, from: 'remix' });
    await window.SlopOuttake.send('slopedit', { id: mid, name, type: TYPE, from: 'remix' }); // the one way out, no copy
    $('rm-status').textContent = RM.t('remix.send.opened', { n: ids.length, name });
    return mid;
  };
  function $(id) { return document.getElementById(id); }
})();
