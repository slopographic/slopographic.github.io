/* Slop Contacts: the place in the page URL, through shared/router (SlopRoute). Parameters: group (the selected group),
 * f (the filters, as text), view (cards or table). A link that names any of them wins over the saved session place;
 * back and forward re-apply the URL. Without the router the place stays in memory only. The URL is written only after
 * the saved place has been applied at boot (apply), so the session's place is not overwritten by an empty URL.
 * Adds SlopContacts.urlPlace. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const GROUP_OK = /^(recent|cat:.+|stage:(lead|contacted|customer|lost))$/;
  let ready = false;
  let R = null;

  /** The place as the URL names it, or null when it names none (so the saved session place stays). */
  function peek() {
    if (!R || !['group', 'f', 'view'].some((k) => R.has(k))) return null;
    const s = R.state();
    return { group: s.group, f: s.f, view: s.view === 'table' ? 'table' : '' };
  }
  /** Applies a place (null leaves the state alone), then writes the place to the URL. */
  function apply(p) {
    if (p) {
      S.group = GROUP_OK.test(p.group) ? p.group : null;
      S.filters = SC.filters.fromParam(p.f);
      S.view = p.view === 'table' ? 'table' : 'cards';
    }
    ready = true;
    S.emit('render');
  }
  /** Writes the place. The URL changes only when a value does (the router compares). */
  function write() {
    if (!ready || !R) return;
    R.set({ group: S.group || '', f: SC.filters.toParam(S.filters) || '', view: S.view === 'table' ? 'table' : 'cards' });
  }
  /** Registers the parameters, and listens to the render for writes. Back and forward: the URL that is shown. */
  function mount() {
    if (window.SlopRoute) {
      R = SlopRoute.register('contacts', {
        params: {
          group: { pattern: GROUP_OK, def: '' },
          f: { def: '', max: 1000 },
          view: { values: ['cards', 'table'], def: 'cards' },
        },
        apply(s, why) { if (why === 'popstate') apply(peek() || { group: '', f: '', view: '' }); },
      });
    }
    S.on('render', write);
  }

  SC.urlPlace = { mount, peek, apply };
})();
