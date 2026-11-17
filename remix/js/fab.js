/* Reel Remix: the floating Remix button (bottom right; hidden while the options panel has its footer, js/side.js, whose
   Remix button pulses instead) and the settings dialog. The button pulses while clips wait for a
   remix, or before any remix exists, and stops once a remix has run. A click remixes; a long press, the Settings button
   or the palette command "Remix settings" opens the settings (auto remix on or off). The pulse is a CSS keyframe on the
   button's ring; reduced motion gets a steady ring (css/remix-auto.css). Exposes RM.fab. */
(function () {
  'use strict';
  const RM = window.RM, $ = (id) => document.getElementById(id);
  const LONG_MS = 600;
  let pressTimer = null, longFired = false;

  /** Pulse while clips wait, or before the first remix. */
  function refresh() {
    const b = $('rm-fab'); if (!b) return;
    const n = RM.pendingCount();
    b.classList.toggle('pulse', n > 0 || !RM.state.plan);
    $('rm-remix').classList.toggle('pulse', n > 0 || !RM.state.plan);   // the panel's Remix (side.js) carries the pulse
    b.title = n ? RM.t('remix.fab.title_n', { n }) : RM.t('remix.fab.title');
  }
  function openSettings() {
    const d = $('rm-settings'); if (!d) return;
    $('rm-set-auto').checked = RM.auto.enabled();
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }
  function closeSettings() {
    const d = $('rm-settings'); if (!d) return;
    if (d.close) d.close(); else d.removeAttribute('open');
  }

  const b = $('rm-fab');
  b.addEventListener('pointerdown', () => {
    longFired = false; clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { longFired = true; openSettings(); }, LONG_MS);
  });
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, () => { clearTimeout(pressTimer); pressTimer = null; });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    if (longFired) { longFired = false; return; } // the press opened the settings
    RM.remixNow(false);
  });
  $('rm-settings-btn').addEventListener('click', openSettings);
  $('rm-set-close').addEventListener('click', closeSettings);
  $('rm-set-auto').addEventListener('change', (e) => {
    RM.auto.setEnabled(e.target.checked);
    if (RM.say) RM.say(RM.t(e.target.checked ? 'remix.fab.auto_on' : 'remix.fab.auto_off'));
  });
  $('rm-settings').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSettings(); }); // a click on the backdrop
  RM.onPlan(refresh);
  RM.fab = { refresh, openSettings };
  refresh();
  const reg = () => {   // the palette title in the chosen language (again after a change)
    try {
      if (window.SlopCmd && SlopCmd.register) SlopCmd.register([{ id: 'remix.settings', title: RM.t('remix.page.settings_title'), group: 'Reel Remix', run: openSettings }]); // i18n-ignore: the app's name
    } catch (e) { console.warn('Remix: settings command not registered', e); }
  };
  reg();
  RM.onLang(() => { reg(); refresh(); });
})();
