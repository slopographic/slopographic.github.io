// Storage status: how much this site uses and whether the browser has promised to keep it (from SlopQuota,
// shared/storage/quota.js). The plain-words message for the answer comes from shared/pwa.js (SlopPWA.persistMessage),
// so every app says the same thing.
(function (g) {
  'use strict';
  const NS = (g.SlopAdmin = g.SlopAdmin || {});

  async function status() {
    const { usage, quota, persisted } = await g.SlopQuota.estimate();   // shared/storage/quota.js: never throws
    const answer = g.SlopPWA ? g.SlopPWA.persistAnswer() : null;
    const message = g.SlopPWA && answer ? g.SlopPWA.persistMessage(answer) : '';
    return { usage, quota, persisted, answer, message: message || (g.SlopI18n ? g.SlopI18n.t('admin.sg.not_asked') : '') };
  }

  /** Asks the browser to keep this site's storage (a user-visible prompt in some browsers). Returns the answer. */
  async function ask() {
    return g.SlopQuota.request();   // through SlopPWA when loaded, so the answer is recorded
  }

  NS.storage = { status, ask };
})(typeof window !== 'undefined' ? window : globalThis);
