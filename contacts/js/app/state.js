/* Slop Contacts: the screen state and events. The list is the contact view of the shared customer records
 * (see core/customer-map.js). Changing it with setList() writes the difference to SlopData (records.js) unless
 * { write: false } is given. Adds SlopContacts.state (S).
 *   S.on('change', fn)  the list changed (the data, not only the view)
 *   S.on('render', fn)  the view changed (group, search, selection, the open contact, edit mode) */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const CC_KEY = 'slop-contacts.cc';
  const RECENT = 25;
  const STAGES = ['lead', 'contacted', 'customer', 'lost'];
  const readCc = () => { try { return localStorage.getItem(CC_KEY) || ''; } catch (e) { return ''; } };
  const MODE_KEY = 'slop-contacts.mode';
  const readMode = () => { try { return localStorage.getItem(MODE_KEY) === 'edit' ? 'edit' : 'view'; } catch (e) { return 'view'; } };
  const writeMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* blocked */ } };
  let mode = readMode();     // the card's mode, remembered per device
  const subs = {};
  const byName = (a, b) => String(a.fn).localeCompare(String(b.fn), undefined, { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1);

  const S = {
    list: [],                 // contacts, sorted by name
    sel: new Set(),           // selected ids (Cmd or Shift click, or Select mode)
    anchor: null,             // last clicked id, for Shift-click ranges
    focus: null,              // keyboard position in the list
    selectMode: false,        // checkboxes on every row (touch)
    query: '',                // search text
    group: null,              // null = all, 'recent', 'cat:<name>' or 'stage:<stage>'
    open: null,               // id of the contact in the card
    draft: null,              // the New contact row in the list ({ id, fn }) until it is created (new-contact.js)
    // card mode: 'view' (read-only) or 'edit' (the form). Remembered per device; set through the card's View / Edit switch.
    get mode() { return mode; },
    set mode(v) { mode = v === 'edit' ? 'edit' : 'view'; writeMode(mode); },
    touched: new Map(),       // id -> updatedAt (ms), for Recent and the updated-date filter
    created: new Map(),       // id -> createdAt (ms), for the created-date filter
    tags: [],                 // the shared CRM tags: { id, name, color }
    view: 'cards',            // middle column: 'cards' (the list) or 'table'
    sort: { id: null, dir: 'asc' }, // table sort column and direction
    filters: SC.filters.clean({}), // the sidebar facets (core/filters.js)
    rev: 0,                   // counts changes made by the person (not reloads); the import undo checks it
    cc: readCc(),             // default country code for E.164 (per viewer)
    ready: false,
    persist: null,            // set by records.js: (prev, next) => writes the difference
    STAGES,
    on(type, fn) { (subs[type] = subs[type] || []).push(fn); return () => { subs[type] = (subs[type] || []).filter((f) => f !== fn); }; },
    emit(type, data) { for (const fn of (subs[type] || []).slice()) { try { fn(data); } catch (e) { console.error(e); } } },
    byId: (id) => S.list.find((c) => c.id === id) || null,
    /** The ids of the most recently changed contacts, newest first. */
    recentIds: () => [...S.touched.entries()].sort((a, b) => b[1] - a[1]).slice(0, RECENT).map((x) => x[0]),
    /** The contacts shown now: the group, then the search (every word must match). Recent keeps its own order. */
    visible() {
      let list = S.list;
      const g = S.group || '';
      if (g === 'recent') {
        const pos = new Map(S.recentIds().map((id, i) => [id, i]));
        list = list.filter((c) => pos.has(c.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
      } else if (g.startsWith('cat:')) {
        const name = g.slice(4);
        list = list.filter((c) => c.groups.includes(name));
      } else if (g.startsWith('stage:')) {
        const st = g.slice(6);
        list = list.filter((c) => c.stage === st);
      }
      list = SC.filters.apply(list, S.filters, { created: S.created, updated: S.touched });
      const words = S.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length) list = list.filter((c) => { const hay = SC.model.haystack(c); return words.every((w) => hay.includes(w)); });
      return list;
    },
    selected: () => S.list.filter((c) => S.sel.has(c.id)),
    /** Ids for a bulk action: the selection when there is one, else null (= every contact). */
    scope: () => (S.sel.size ? new Set(S.sel) : null),
    /** Counts for the group list. */
    groupCounts() {
      const cats = new Map(), stages = Object.fromEntries(STAGES.map((s) => [s, 0]));
      for (const c of S.list) {
        stages[c.stage] = (stages[c.stage] || 0) + 1;
        for (const g of c.groups) cats.set(g, (cats.get(g) || 0) + 1);
      }
      return { all: S.list.length, recent: S.recentIds().length, cats: [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })), stages };
    },
    /** Replace the whole list. Writes the difference unless write is false (a load from the store). */
    setList(list, { write = true } = {}) {
      const prev = S.list;
      S.list = list.map((x) => { const c = SC.model.normalise(x); if (!c.stage) c.stage = 'lead'; return c; }).sort(byName);
      const ids = new Set(S.list.map((c) => c.id));
      S.sel = new Set([...S.sel].filter((id) => ids.has(id)));
      if (S.open && !ids.has(S.open)) { S.open = null; S.mode = 'view'; }
      if (S.focus && !ids.has(S.focus)) S.focus = null;
      if (write) S.rev++;
      S.emit('change');
      S.emit('render');
      if (write && S.persist) S.persist(prev, S.list);
    },
    /** Puts changed contacts back by id (same order). */
    replaceMany(updated) {
      const byId = new Map(updated.map((c) => [c.id, c]));
      S.setList(S.list.map((c) => byId.get(c.id) || c));
    },
    setSel(ids) { S.sel = new Set(ids); S.emit('render'); },
    setCc(v) { S.cc = String(v || '').trim(); try { localStorage.setItem(CC_KEY, S.cc); } catch (e) { /* blocked */ } S.emit('change'); },
  };
  SC.state = S;
  SC.STAGES = STAGES;
  /** A word from the string tables (contacts/i18n), in the chosen language; the key when SlopI18n is absent. */
  SC.tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  SC.stageLabel = (s) => (STAGES.includes(s) ? SC.tr('contacts.stage.' + s) : s);
  /** A phone, e-mail or address label (mobile, work, home, other) in words; another label as it is. */
  SC.labelWord = (l) => (['mobile', 'work', 'home', 'other'].includes(l) ? SC.tr('contacts.lbl.' + l) : l);
})();
