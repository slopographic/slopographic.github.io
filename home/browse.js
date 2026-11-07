/* Homepage browse: the search and finder under the hero (shared/finder, SlopFinder), the hero's Open the apps button, the six section shelves and the
 * Experiments shelf (home/sections.js for what goes where), the jump links under the hero, and the Print card.
 * The finder's filter drives the shelves: a section with no matches is hidden. Classic script, loaded after catalog.js. */
(function () {
  'use strict';
  const APPS = window.SLOP_APPS || [];
  const H = window.SlopHomeSections, C = window.SlopHomeCards, M = window.SlopFinderModel, SF = window.SlopFinder;
  const SEARCH = window.SLOP_APP_SEARCH || {};
  /* The name shown for an app (see shared/apps.js). */
  const shown = (a) => window.slopAppLabel(a, window.slopBrandNamesOn());
  if (!H || !C) return;
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : String(attrs[k]));
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  };
  const desktop = () => !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

  /* ---------- the shelves: one <section> per homepage section, built once so the headings keep their perch ---------- */
  const host = document.getElementById('app-sections');
  const ALL = H.SHELVES || H.SECTION_DEFS.concat([H.EXPERIMENTS]);   // no Experiments shelf in a plain build
  const tr = H.tr || ((k, en) => en);
  const shelves = new Map();
  for (const d of ALL) {
    const grid = el('div', { class: d.tiles ? 'tile-grid' : 'app-grid', 'data-section': d.id });
    const sec = el('section', { id: d.id, class: 'shelf', 'aria-labelledby': d.id + '-title', 'data-section-id': d.id },
      el('header', { class: 'shelf-head' }, el('h2', { id: d.id + '-title', 'data-perch': '' }, d.title), el('p', null, d.desc)), grid);
    if (host) host.append(sec);
    shelves.set(d.id, { sec, grid, def: d });
  }

  /** The jump links under the hero: one per shelf that is showing. */
  function paintJumps() {
    const nav = document.getElementById('jump-links');
    if (!nav) return;
    nav.replaceChildren(...ALL.filter((d) => !shelves.get(d.id).sec.hidden)
      .map((d) => el('a', { class: 'jump-link', href: '#' + d.id, 'data-jump': '' }, d.title)));
  }
  /** Fills the shelves from the apps the finder lets through. The Print card shows only when nothing is filtered. */
  function render(list, filtering) {
    const all = filtering ? list : list.concat([H.PRINT]);
    const by = new Map([...shelves.keys()].map((k) => [k, []]));
    for (const a of all) for (const p of H.placements(a)) if (by.has(p.section)) by.get(p.section).push({ a, p });
    for (const [key, arr] of by) {
      arr.sort((x, y) => x.p.order - y.p.order);
      const s = shelves.get(key);
      s.grid.replaceChildren(...arr.map(({ a, p }) => (s.def.tiles ? C.tile(a) : C.appCard(a, p.line))));
      s.sec.hidden = !arr.length;
    }
    paintJumps();
    C.watch();
  }

  /** A list row opens its app from anywhere on the row; a click on the Open link itself is left to the link. */
  function rowLink(a, row) {
    row.classList.add('is-link');
    row.addEventListener('click', (e) => { if (!e.target.closest('a')) window.location.href = a.path; });
    return row;
  }

  /* ---------- the finder: search at the top, facets, views, and the matches (SlopFinder over the registry) ---------- */
  const folder = (a) => a.path.replace(/\/$/, '');
  const sectionsText = (a) => [...new Set(H.placements(a).map((p) => H.titleOf(p.section)))].join(', ');
  const ready = (a) => (a.status === 'building' ? H.statusLabel('building') : tr('home.ready', 'Ready'));
  const search = (a) => SEARCH[a.id] || { desc: '', keywords: [] };
  const tag = (a) => (window.slopAppTagline ? window.slopAppTagline(a) : a.tagline);   // in the chosen language
  const title = (a) => (window.slopAppTitle ? window.slopAppTitle(a) : a.title || a.name);
  const OPEN = tr('home.open', 'Open') + ' →';
  const finderHost = document.getElementById('app-finder');
  /** The finder's result for the hero's globe (home/globe/globe.js): the matching ids in the finder's order, and whether
   * anything is filtered. Kept for a late reader (SlopHomeBrowse.result()) and sent as 'slop-home-filter'. */
  let lastResult = null;
  function publish(shown, filter) {
    lastResult = { ids: shown.map((a) => a.id), filtered: !!(M && M.isFiltered(filter)) };
    window.dispatchEvent(new CustomEvent('slop-home-filter', { detail: lastResult }));
  }
  if (SF && M && finderHost) {
    const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();
    // Featured apps lead, then the registry's heavier apps (weight), and an app whose name starts with or contains the
    // search leads above them all.
    const rank = (a, q) => {
      const t = norm(q), n = norm(a.name);
      return (a.featured ? 50 : 0) + ((a.weight || 1) - 1) * 30 + (t && n.includes(t) ? 100 : 0) + (t && n.startsWith(t) ? 20 : 0);
    };
    // Wide screens keep the facets open in their column on the left; phones keep them behind "Filter by".
    const wide = window.matchMedia && matchMedia('(min-width: 900px)').matches;
    SF.mount(finderHost, {
      layout: 'faucet',
      facetsCollapsed: !wide,
      rank,
      items: APPS,
      fields: [
        { key: 'name', label: 'Name', get: (a) => a.name },
        { key: 'tagline', label: 'Description', get: (a) => [...new Set([tag(a), a.tagline, title(a)])] },   // the chosen language's words, and the English
        { key: 'desc', label: 'Details', get: (a) => search(a).desc },
        { key: 'keywords', label: 'Keywords', get: (a) => search(a).keywords },
        { key: 'features', label: 'Features', get: (a) => a.features || [] },
        { key: 'folder', label: 'Folder', get: folder },
      ],
      searchKeys: ['name', 'tagline', 'desc', 'keywords', 'features', 'folder'],
      facets: [
        { key: 'section', label: tr('finder.section', 'Section'), values: (a) => H.placements(a).map((p) => H.titleOf(p.section)) },
        { key: 'type', label: tr('finder.types', 'File types'), values: (a) => H.typeKinds(a.accepts) },
        ...(H.STORE ? [] : [{ key: 'status', label: tr('finder.status', 'Status'), values: (a) => [ready(a)] }]),   // no stages in the store app
        { key: 'tour', label: tr('finder.tour', 'Guided tour'), values: (a) => [H.TOUR_DIRS.has(folder(a)) ? tr('finder.has_tour', 'Has a tour') : tr('finder.no_tour', 'No tour')] },
      ],
      columns: [
        { key: 'name', label: tr('finder.app', 'App'), get: (a) => shown(a) },
        { key: 'section', label: tr('finder.section', 'Section'), get: sectionsText },
        { key: 'types', label: tr('finder.types', 'File types'), get: (a) => H.typeKinds(a.accepts).join(', ') },
        { key: 'open', label: tr('home.open', 'Open'), sortable: false, get: () => '', render: (a) => el('a', { href: a.path }, OPEN) },
      ],
      row: (a) => rowLink(a, el('div', { class: 'fd-row has-icon', 'data-id': a.id }, C.icon(a, 'fd-row-icon'), el('b', { class: 'app-title', 'data-id': a.id }, shown(a)), el('span', { class: 'fd-row-sec' }, sectionsText(a)),
        el('span', { class: 'fd-row-tag' }, tag(a)), el('span', { class: 'fd-row-types' }, H.typeKinds(a.accepts).join(', ')),
        el('a', { class: 'fd-row-open', href: a.path }, OPEN))),
      card: (a) => C.appCard(a),
      urlPrefix: 'hp',
      placeholder: tr('finder.placeholder', 'Search apps by name, job, file type or feature'),
      searchLabel: tr('switcher.search', 'Search apps'),
      count: (n) => (window.SlopI18n ? window.SlopI18n.t('finder.count', { n }) : String(n)),   // plural forms: shared/i18n/strings.js
      countOf: (shown, n) => (window.SlopI18n ? window.SlopI18n.t('finder.count_of', { shown, n }) : shown + ' / ' + n),
      emptyText: tr('finder.no_apps', 'No apps match these filters.'),
      view: 'list',
      big: true, // the large search box; the results filter live below it, so there is no dropdown
      autofocus: desktop(),
      // the faucet filters its own list; the shelves below always show every app; the hero's globe follows the result
      onChange: (shown, filter) => { render(APPS, false); publish(shown, filter); },
    });
  } else {
    render(APPS, false);
  }
  /* The hero's "Open the apps" (index.html, [data-to-finder]): scrolls to the finder and puts the cursor in its search; a tap
   * on a touch screen only scrolls (focus would pop up the on-screen keyboard over half the page). Keyboard activation
   * (a click with detail 0) always focuses. */
  document.addEventListener('click', (e) => {
    const go = e.target.closest && e.target.closest('a[data-to-finder]');
    const input = go && finderHost && finderHost.querySelector('.fd-input');
    if (!input) return;
    e.preventDefault();
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    finderHost.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    if (desktop() || e.detail === 0) input.focus({ preventScroll: true });
  });
  window.SlopHomeBrowse = { render, result: () => lastResult };
})();
