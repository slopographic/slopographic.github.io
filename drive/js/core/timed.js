/* Slop Drive — core/timed: a Drive operation that waits on IndexedDB gets a time limit. When the browser holds a
 * storage transaction open too long, the wait is given up (the list keeps what it shows) and a toast offers Retry.
 * The operation itself keeps running; Retry starts it again and calls onRetry with the result. */
'use strict';
(function (DR) {
  const STUCK = {};
  /** Resolves { ok: true, value } when fn() settles in time, or { ok: false } after the toast. Rejections pass through. */
  DR.timed = function (label, fn, { ms = 8000, onRetry = null } = {}) {
    let timer = 0;
    const late = new Promise((res) => { timer = setTimeout(() => res(STUCK), ms); });
    const run = Promise.resolve().then(fn).then((value) => ({ ok: true, value }));
    return Promise.race([run, late]).then((r) => {
      clearTimeout(timer);
      if (r !== STUCK) return r;
      window.SlopUI.toast(DR.t('drive.app.too_long', { what: label }), 6000, {
        label: DR.t('drive.app.retry'),
        run: () => DR.timed(label, fn, { ms, onRetry }).then((again) => { if (again.ok && onRetry) onRetry(again.value); }),
      });
      return { ok: false };
    });
  };
})(window.DR);
