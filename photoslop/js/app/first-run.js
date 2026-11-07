/* PhotoSlop: the guided tour opens by itself on the first run. shared/tour/mount.js (loaded just before this
 * file) adds the Tour button and opens the tour for ?tour=1. The button stays for later. The "shown" flag lives
 * in localStorage; if storage is blocked the tour simply opens on each load. */
'use strict';

const TOUR_SHOWN_KEY = 'photoslop.tourShown';
function tourWasShown() {
  try { return localStorage.getItem(TOUR_SHOWN_KEY) === '1'; } catch (e) { return false; }
}
function rememberTourShown() {
  try { localStorage.setItem(TOUR_SHOWN_KEY, '1'); } catch (e) { /* private mode or blocked storage */ }
}
/** Click the header's Tour button once the app has finished booting (so the tour points at real panels). */
function openTourOnFirstRun() {
  if (tourWasShown()) return;
  if (new URLSearchParams(location.search).get('connect') === '1') return; // an AI app opened the page to pair (shared/agent/bridge-ui.js): that dialog first, the tour next time
  rememberTourShown();
  if (new URLSearchParams(location.search).get('tour') === '1') return; // the mount script opens ?tour=1 itself
  let waits = 0; // give up after about 30 s, so a failed boot does not keep polling
  const go = () => {
    if (!document.body.classList.contains('ready')) { if (++waits < 300) setTimeout(go, 100); return; }
    const btn = document.querySelector('.stour-btn');
    if (btn) btn.click();
  };
  go();
}
document.addEventListener('DOMContentLoaded', openTourOnFirstRun);
