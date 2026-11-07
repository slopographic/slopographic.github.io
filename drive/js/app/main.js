/* Slop Drive — app/main: boot, the render loop, top bar wiring, and live updates from other tabs/apps. */
'use strict';
(function (DR) {
  const S = DR.S, $ = DR.$;
  const meter = DR.debounce(() => DR.renderMeter(), 250);

  DR.render = function () {
    if (!S.ready) return;
    DR.touchView();
    DR.renderPlaces(); DR.renderTree(); DR.renderProviders(); DR.renderTags(); DR.renderCrumbs(); DR.renderTools();
    const pane = $('pane'), view = DR.viewNow(), list = DR.visible();
    DR.lastVisible = list;
    const keep = pane.dataset.view === view && pane.dataset.place === S.section + ':' + S.cwd ? pane.scrollTop : 0;
    pane.replaceChildren();
    pane.dataset.view = view; pane.dataset.place = S.section + ':' + S.cwd;
    const driveEmpty = !S.files.size && !S.folders.size;
    if (driveEmpty) pane.append(DR.emptyState('drive'));
    else if (view === 'columns') DR.renderColumns(pane);
    else if (view === 'nodes') DR.renderNodes(pane);
    else if (view === 'usage') DR.renderUsage(pane);
    else if (!list.length) pane.append(DR.emptyState(S.query.trim() || S.tag || S.kind !== 'all' ? 'search' : S.section === 'folder' ? 'folder' : S.section));
    else DR.renderFiles(pane, list, view);
    pane.scrollTop = keep;
    document.title = (S.section === 'folder' && !S.cwd ? '' : DR.placeName() + ' — ') + DR.rootName() + ' — Slopographic';
    DR.renderSelbar(); DR.renderStatus(); DR.renderInfo(); meter();
    DR.syncUrl();
  };
  DR.onSelect = () => { DR.onSelectColumns(); };
  DR.viewKeys = (e) => DR.columnKeys(e);

  function wire() {
    const search = $('search'), go = DR.debounce(() => { S.query = search.value; S.sel.clear(); DR.render(); }, 120);
    search.addEventListener('input', go);
    $('btnNew').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); DR.newMenu(r.left, r.bottom + 4); });
    $('btnMore').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); DR.moreMenu(r.right - 220, r.bottom + 4); });
    $('btnBackup').addEventListener('click', () => DR.backupDialog());
    DR.wireDrawer(); DR.wireSheet();   // before the app's keys: the sheets' Escape comes first
    $('btnInfo').addEventListener('click', () => { if (!DR.isMobile()) DR.toggleInfo(); });   // on a phone it is the sheet's toggle
    $('btnSort').addEventListener('click', () => DR.openSortMenu());
    DR.wireCommands(); DR.wireSelect(); DR.wireDrag(); DR.wireDropUpload(); DR.wireKeys(); DR.wireCtxMenu();
    DR.wireProviders(); DR.wireProvDrag();
    $('btnCmd').addEventListener('click', () => DR.openPalette());
    addEventListener('resize', DR.debounce(() => { DR.clampInfoWidth(); if (['usage', 'nodes', 'list'].includes(DR.viewNow())) DR.render(); }, 200));
  }
  // Other tabs and apps change the Drive too (Send to…, saves, a restore): follow along.
  const outside = DR.debounce(async () => { await DR.timed(DR.t('drive.app.updating'), () => DR.refresh(), { onRetry: () => DR.render() }); DR.render(); }, 150);

  DR.boot = async function () {
    wire();
    try { window.SlopHub.register('drive'); } catch (e) { /* no bus */ }
    window.SlopHub.on('drive:change', outside);
    try { await DR.timed(DR.t('drive.app.loading'), () => DR.refresh(), { onRetry: () => DR.render() }); } catch (e) { window.SlopUI.alert(DR.t('drive.app.unavailable'), DR.t('drive.app.blocked', { msg: e.message })); }
    try { await DR.restoreView(); } catch (e) { /* no saved place: start at the root */ }
    // A link's place (drv.* in the URL) wins over the saved place; its file opens in Quick look once Drive is drawn.
    const linkFile = DR.urlHasPlace() ? DR.placeFromUrl().file : null;
    S.ready = true;
    DR.render();
    if (linkFile) DR.openFileById(linkFile);
    DR.folderRefresh().then(() => DR.renderFolder()).catch((e) => console.warn('Slop Drive: folder state', e));
    DR.refreshProviders().catch((e) => console.warn('Slop Drive: places', e));
    DR.restoreScroll();
    await window.SlopIntake.launch({ to: 'drive' }).catch(() => null); // ?drive=<id> is shown, launch files are uploaded (ui/dnd.js)
    document.body.classList.add('ready');
    $('pane').focus({ preventScroll: true });
  };
  // Ask the browser to keep our storage the first time a visit uploads something big (SlopQuota.askIfBig: 50 MB, once
  // per visit). The answer goes through SlopPWA, whose listener redraws the meter.
  const imp = DR.importFiles;
  DR.importFiles = async function (...a) {
    const r = await imp.apply(this, a);
    if (r.length) window.SlopQuota.askIfBig((a[0] || []).reduce((n, x) => n + ((x && x.file && x.file.size) || 0), 0));
    return r;
  };

  // A language change: the parts built once (the view buttons, the kind filter) are made again, then everything is drawn
  // in the new words (the static page follows through data-i18n, SlopI18n.apply).
  DR.onLang(() => { $('views').replaceChildren(); $('kind').replaceChildren(); DR.render(); if (DR.renderFolder) DR.renderFolder(); if (DR.renderInfo) DR.renderInfo(true); });   // the details pane: drawn again even when the selection is the same

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', DR.boot); else DR.boot();
})(window.DR);
