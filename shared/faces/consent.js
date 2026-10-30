/* SlopFaces consent: the explanation dialog, shown on first use (Drive's Find faces, Gallery's People view) while the
 * setting is off. Built on SlopUI.dialog; the wording is copy.js, the same text the Profile page shows. "Turn on" saves
 * the setting through SlopFaces.setEnabled; "Not now" changes nothing. A link opens Profile at this app's section.
 * Classic script; adds to window.SlopFaces. Words: copy.js and shared/i18n/ui/<code>/preview.js (ui.faces.*), read on open. */
(function (g) {
  'use strict';
  const F = (g.SlopFaces = g.SlopFaces || {});
  const ASKED = 'slop-faces-asked';
  const tr = (k) => (g.SlopI18n ? g.SlopI18n.t(k) : k);
  const copy = () => g.SLOP_FACES_COPY || { title: tr('ui.faces.copy_title'), lines: [] };

  /** Whether the explanation has been shown in this browser (a per-viewer convenience, not the setting). */
  F.asked = () => { try { return g.localStorage.getItem(ASKED) === '1'; } catch (e) { return false; } };
  const markAsked = () => { try { g.localStorage.setItem(ASKED, '1'); } catch (e) { /* storage blocked: it asks again */ } };

  /** Opens the dialog for an app ('drive' or 'gallery'). Resolves true when detection is on afterwards. */
  F.askOptIn = function (appId) {
    markAsked();
    if (F.enabled()) return Promise.resolve(true);
    const SU = g.SlopUI;
    if (!SU || !SU.dialog || !SU.el) return Promise.resolve(false);
    const el = SU.el, c = copy();
    return new Promise((resolve) => {
      const note = el('p', { class: 'sui-p muted', role: 'status' });
      const link = el('a', { href: '../settings/#app-' + appId, target: '_blank', rel: 'noopener' }, tr('ui.faces.change_in_profile'));
      const body = el('div', { class: 'faces-consent' },
        ...c.lines.map((t) => el('p', { class: 'sui-p' }, t)),
        el('p', { class: 'sui-p' }, link), note);
      SU.dialog({
        title: c.title, body, cls: 'faces-dlg',
        buttons: [
          { label: tr('ui.faces.not_now') },
          { label: tr('ui.faces.turn_on'), primary: true, act: () => {
            const r = F.setEnabled(true);
            if (!r.ok) { note.textContent = r.error; return false; }
            return undefined;
          } },
        ],
        onClose: () => resolve(F.enabled()),
      });
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
