/* Slop Time manual clock offset. NOT a network sync: nothing is fetched. The person types a time from a source they
 * trust; the app stores how far this device's clock was from it at that moment and applies that offset to the
  * displayed times. Classic script (after state.js, sync.js, ui.js). Exposes window.SlopTime.syncPanel: init(), render(). */
(function (g) {
  'use strict';
  const ns = (g.SlopTime = g.SlopTime || {});
  const Z = ns.zones, S = ns.state, SY = ns.sync, UI = ns.ui, $ = UI.$;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  function hms(ms) { const d = new Date(ms); return `${UI.pad(d.getHours())}:${UI.pad(d.getMinutes())}:${UI.pad(d.getSeconds())}`; }

  function render() {
    const off = S.offset();
    const status = $('st-sync-status');
    if (!off) {
      status.textContent = t('time.sync.none');
      $('st-sync-now').textContent = '';
      $('st-sync-clear').disabled = true;
      return;
    }
    $('st-sync-clear').disabled = false;
    status.textContent = t('time.sync.set_at', { time: hms(off.setAt), ref: off.reference, what: SY.describe(off.offsetMs) });
    $('st-sync-now').textContent = t('time.sync.now', { time: hms(S.nowMs()) });
  }

  function setOffset() {
    const zone = $('st-sync-zone').value.trim();
    const date = $('st-sync-date').value;
    const clock = $('st-sync-time').value.trim();
    const ref = SY.referenceMs(zone, date, clock);
    const err = $('st-sync-err');
    if (ref === null) { err.textContent = t('time.sync.bad'); return; }
    err.textContent = '';
    const offsetMs = SY.offsetFor(ref, Date.now());
    S.setOffset({ offsetMs, setAt: Date.now(), reference: `${clock} ${date} ${Z.cityOf(zone)}` });
    ns.world.render();
    render();
  }

  function clearOffset() { S.clearOffset(); ns.world.render(); render(); }

  function init() {
    const p = S.prefs();
    $('st-sync-zone').value = p.zone;
    $('st-sync-date').value = UI.todayIn(p.zone);
    $('st-sync-set').addEventListener('click', setOffset);
    $('st-sync-clear').addEventListener('click', clearOffset);
    render();
  }

  ns.syncPanel = Object.freeze({ init, render });
})(typeof window !== 'undefined' ? window : globalThis);
