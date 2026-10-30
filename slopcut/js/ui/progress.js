/* SlopCut: a progress dialog with an optional Cancel button.
   const p = SE.progress.open(title, { cancel: true }); p.set(0.4, 'Encoding…'); p.cancelled; p.close(); */
(function () {
  'use strict';
  const SE = window.SE, h = SE.util.h;
  SE.progress = {
    open(title, { cancel = true, onCancel } = {}) {
      const bar = h('i'), msg = h('div', { class: 'prog-msg' }, SE.util.t('slopedit.prog.starting')), pct = h('b', null, '');
      const st = { cancelled: false };
      const d = SlopUI.dialog({
        title, cls: 'sui-narrow prog-dlg',
        body: h('div', { class: 'prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { class: 'prog-bar' }, bar), h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, msg, pct)),
        buttons: cancel ? [{ label: SE.util.t('slopedit.fx.cancel'), act: () => { st.cancelled = true; if (onCancel) onCancel(); msg.textContent = SE.util.t('slopedit.prog.cancelling'); return false; } }] : [],
        onClose: () => { if (!st.done) { st.cancelled = true; if (onCancel) onCancel(); } }
      });
      const root = d.box.querySelector('.prog');
      st.set = (f, text) => {
        if (f != null && isFinite(f)) { const v = Math.round(Math.max(0, Math.min(1, f)) * 100); bar.style.width = v + '%'; pct.textContent = v + '%'; root.setAttribute('aria-valuenow', String(v)); }
        if (text) msg.textContent = text;
      };
      st.close = () => { st.done = true; d.close(true); };
      st.box = d.box;
      return st;
    }
  };
})();
