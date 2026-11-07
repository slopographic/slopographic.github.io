/* SlopDeck: the swipe deck for sorting photos, one at a time, full screen. Used by Slop Gallery (its library) and by Slop
 * Photo Sorter (photos dropped on the page). Classic script; sets window.SlopDeck = { create, rules }.
 *   Up arrow / Like: like and next        Down arrow / Dislike: dislike and next
 *   Left arrow: back, no tag               Right arrow: skip ahead, no tag
 *   Enter, or a letter or number typed on the photo: a tag field under it (Enter adds, commas separate, Esc cancels)
 *   Escape: close
 * Each decision stamps the photo (♥ Liked / ✕ Disliked); the top shows "Photo 3 of 8", a progress bar and the tallies.
 * Past the last photo an end card sums up (liked, disliked, not sorted) with See the results, Sort the N left and Back.
 * The photos come from a source the app passes in:
 *   { photo(id) -> { name, liked: 'liked' | 'disliked' | null, tags: [] } | null,  url(id) -> Promise<url>,  release(url),
 *     setLiked(id, tag) -> Promise,  addTag(id, tag) -> Promise,  removeTag(id, tag) -> Promise,  on(fn)?  (fn('tags' | 'photos')),
 *     onClose()? }
 * const deck = SlopDeck.create(source): deck.open(ids, { start }), deck.close(), deck.press(key) -> Promise<{ pos, tag, atEnd }>,
 * deck.state() -> { open, pos, length, id, quick }. Styles: shared/deck/deck.css. */
(function (g) {
  'use strict';
  if (g.SlopDeck) return;
  const KEYS = {
    ArrowUp: { tag: 'liked', move: 1 }, ArrowDown: { tag: 'disliked', move: 1 },
    ArrowLeft: { tag: null, move: -1 }, ArrowRight: { tag: null, move: 1 },
  };
  /** Pure: what a key does at a position in a queue: { tag, pos, moved, atEnd }, or null for a key that means nothing.
   *  The position stays inside the queue; a move forward from the last photo stays on it and reports atEnd. */
  function decide(key, pos, length) {
    const k = KEYS[key];
    if (!k || !(length > 0)) return null;
    const start = Math.min(Math.max(0, pos | 0), length - 1);
    const next = Math.min(Math.max(0, start + k.move), length - 1);
    return { tag: k.tag, pos: next, moved: next !== start, atEnd: k.move > 0 && start === length - 1 };
  }
  // Words: shared/i18n/ui/<code>/preview.js (keys ui.deck.*). The markup's words are marked (data-i18n, data-i18n-attr), so a
  // language switch rewrites them; the counts and notes are written again then (SlopI18n.on).
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const TAG_KEY = { liked: 'ui.deck.liked', disliked: 'ui.deck.disliked' };
  const CHAR = /^[\p{L}\p{N}]$/u;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /** Marked words for the markup: text (key), or attributes ({ attr: key }). */
  const W = (k) => `data-i18n="${k}">${esc(tr(k))}`;
  const A = (map) => Object.entries(map).map(([at, k]) => `${at}="${esc(tr(k))}"`).join(' ') + ` data-i18n-attr="${Object.entries(map).map(([at, k]) => at + ':' + k).join(';')}"`;
  const markup = () => `
      <div class="s-top">
        <button type="button" class="dk-btn" data-act="close" ${A({ title: 'ui.deck.close_tip' })} ${W('ui.done')}</button>
        <span class="s-count"></span>
        <span class="s-tally"></span>
        <span class="dk-spacer"></span>
        <span class="s-hint" ${W('ui.deck.hint')}</span>
      </div>
      <div class="s-progress" aria-hidden="true"><i></i></div>
      <div class="s-stage">
        <button type="button" class="dk-nav prev" data-act="back" ${A({ 'aria-label': 'ui.deck.back_aria' })}>‹</button>
        <div class="s-pic"><img alt=""><span class="s-mark" hidden></span><span class="s-stamp" aria-hidden="true"></span></div>
        <button type="button" class="dk-nav next" data-act="skip" ${A({ 'aria-label': 'ui.deck.skip_aria' })}>›</button>
        <div class="s-end" hidden role="group" ${A({ 'aria-label': 'ui.deck.end_aria' })}>
          <h2 ${W('ui.deck.all_done')}</h2><p class="s-end-sum"></p>
          <div class="s-end-acts"><button type="button" class="s-big like" data-act="close" ${W('ui.deck.see_results')}</button>
            <button type="button" class="dk-btn" data-act="rest" hidden></button>
            <button type="button" class="dk-btn" data-act="unend" ${W('ui.deck.back_last')}</button></div>
        </div>
      </div>
      <div class="s-quick" hidden><input type="text" maxlength="64" autocomplete="off" ${A({ placeholder: 'ui.deck.quick_placeholder', 'aria-label': 'ui.deck.quick_aria' })}></div>
      <div class="s-bar">
        <button type="button" class="s-big like" data-act="like" ${A({ 'aria-label': 'ui.deck.like_aria' })} ${W('ui.deck.like')}</button>
        <button type="button" class="s-big dislike" data-act="dislike" ${A({ 'aria-label': 'ui.deck.dislike_aria' })} ${W('ui.deck.dislike')}</button>
      </div>
      <div class="s-tags">
        <form class="s-tagform"><input type="text" maxlength="64" ${A({ placeholder: 'ui.deck.tag_placeholder', 'aria-label': 'ui.deck.tag_aria' })}><button type="submit" class="dk-btn" ${W('ui.deck.add_tag')}</button></form>
        <div class="s-taglist"></div>
        <p class="s-status" role="status" aria-live="polite"></p>
      </div>`;

  function create(src) {
    let root = null, queue = [], pos = 0, url = null, token = 0, opener = null;
    const $ = (sel) => root.querySelector(sel);
    const cur = () => (queue.length ? src.photo(queue[pos]) : null);
    const quickOpen = () => !!root && !$('.s-quick').hidden;
    const setStatus = (t) => { if (root) $('.s-status').textContent = t; };

    function build() {
      root = document.createElement('div');
      root.className = 'sortmode';
      root.hidden = true; root.tabIndex = -1;
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', tr('ui.deck.aria')); root.setAttribute('data-i18n-attr', 'aria-label:ui.deck.aria');
      root.innerHTML = markup();
      document.body.append(root);
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const map = { close: 'Escape', back: 'ArrowLeft', skip: 'ArrowRight', like: 'ArrowUp', dislike: 'ArrowDown' };
        if (b.dataset.act === 'rest') sortRest();
        else if (b.dataset.act === 'unend') hideEnd();
        else if (map[b.dataset.act]) press(map[b.dataset.act]);
      });
      $('.s-tagform').addEventListener('submit', (e) => { e.preventDefault(); addTag(); });
      root.addEventListener('keydown', onKey);
      if (src.on) src.on((what) => {
        if (root.hidden || (what !== 'tags' && what !== 'photos')) return;
        queue = queue.filter((id) => src.photo(id));
        if (pos >= queue.length) pos = Math.max(0, queue.length - 1);
        if (!queue.length) close(); else paint();
      });
      // a language switch: the marked words are rewritten by SlopI18n.apply; the counts and the end card here
      if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { if (root.hidden) return; setStatus(''); paint(); if (endOpen()) showEnd(); });
    }

    /** One key: the position moves at once; the tag (if any) is written, then the deck repaints. */
    function press(key) {
      if (!root || root.hidden) return Promise.resolve(null);
      if (key === 'Escape') { close(); return Promise.resolve(null); }
      if (endOpen()) { if (key === 'ArrowLeft') hideEnd(); return Promise.resolve(null); }
      const d = decide(key, pos, queue.length);
      if (!d) return Promise.resolve(null);
      hideQuick();
      const id = queue[pos], m = cur(), name = m ? m.name : tr('ui.deck.photo');
      pos = d.pos;
      const write = d.tag && id ? Promise.resolve(src.setLiked(id, d.tag)) : Promise.resolve(null);
      if (d.tag) stamp(d.tag);
      const at = d.atEnd ? '' : tr('ui.deck.photo_of_dot', { i: pos + 1, n: queue.length });
      setStatus(d.tag ? tr('ui.deck.tagged_photo', { tag: tr(TAG_KEY[d.tag]), name, at }).trim() : at);
      paint();
      return write.then(() => { paint(); if (d.atEnd) showEnd(); return { pos: d.pos, tag: d.tag, atEnd: d.atEnd }; });
    }
    function openQuick(first) {
      if (!root || root.hidden || !queue.length) return;
      const input = $('.s-quick input');
      input.value = first || '';
      $('.s-quick').hidden = false;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    }
    function hideQuick(refocus) {
      if (!quickOpen()) return;
      $('.s-quick input').value = '';
      $('.s-quick').hidden = true;
      if (refocus !== false) root.focus({ preventScroll: true });
    }
    /** The field's text as tags: trimmed, lower case, no repeats, none the photo already has. */
    function parseTags(text, m) {
      const have = new Set(m ? m.tags : []), out = [];
      for (const part of String(text).split(',')) { const t = part.trim().toLowerCase(); if (t && !have.has(t) && !out.includes(t)) out.push(t); }
      return out;
    }
    function commitQuick() {
      const id = queue[pos];
      if (!id) { hideQuick(); return Promise.resolve(null); }
      const tags = parseTags($('.s-quick input').value, cur());
      if (!tags.length) { hideQuick(); setStatus(tr('ui.deck.no_tag')); return Promise.resolve(null); }
      hideQuick();
      const d = decide('ArrowRight', pos, queue.length);
      pos = d.pos;
      const writes = tags.reduce((p, t) => p.then(() => src.addTag(id, t)), Promise.resolve());
      setStatus(tr('ui.deck.tagged', { tags: tags.map((x) => tr('ui.deck.quoted', { text: x })).join(', ') }));
      paint();
      return writes.then(() => { paint(); if (d.atEnd) showEnd(); return { pos: d.pos, tags, atEnd: d.atEnd }; });
    }
    function addTag() {
      const input = $('.s-tagform input'), t = input.value.trim().toLowerCase();
      if (!t || !queue[pos]) return;
      input.value = '';
      Promise.resolve(src.addTag(queue[pos], t)).then(() => { paint(); setStatus(tr('ui.deck.tagged', { tags: tr('ui.deck.quoted', { text: t }) })); });
    }

    /** The decisions in this queue: { liked, disliked, left }. */
    function tally() {
      const t = { liked: 0, disliked: 0, left: 0 };
      for (const id of queue) { const m = src.photo(id); if (m && m.liked === 'liked') t.liked++; else if (m && m.liked === 'disliked') t.disliked++; else t.left++; }
      return t;
    }
    /** The big stamp over the photo for a moment: ♥ Liked or ✕ Disliked. */
    function stamp(tag) {
      const el = $('.s-stamp');
      el.textContent = tr(tag === 'liked' ? 'ui.deck.stamp_liked' : 'ui.deck.stamp_disliked');
      el.className = 's-stamp ' + tag;
      void el.offsetWidth;
      el.classList.add('go');
    }
    const endOpen = () => !!root && !$('.s-end').hidden;
    /** The end card: what was decided in this round, and what to do next. */
    function showEnd() {
      const t = tally(), rest = $('[data-act="rest"]');
      $('.s-end-sum').textContent = tr(t.left ? 'ui.deck.end_sum_left' : 'ui.deck.end_sum', { n: queue.length, liked: t.liked, disliked: t.disliked, left: t.left });
      rest.hidden = !t.left; rest.textContent = tr('ui.deck.sort_left', { n: t.left });
      $('.s-end').hidden = false;
      root.classList.add('is-end');
      setStatus(tr('ui.deck.all_done_sum', { sum: $('.s-end-sum').textContent }));
      $('.s-end .s-big').focus({ preventScroll: true });
    }
    function hideEnd() { if (!endOpen()) return; $('.s-end').hidden = true; root.classList.remove('is-end'); root.focus({ preventScroll: true }); setStatus(tr('ui.deck.photo_of_dot', { i: pos + 1, n: queue.length })); }
    /** Another round with only the photos not liked or disliked yet. */
    function sortRest() {
      const left = queue.filter((id) => { const m = src.photo(id); return m && !m.liked; });
      $('.s-end').hidden = true; root.classList.remove('is-end');
      if (left.length) { queue = left; pos = 0; setStatus(tr('ui.deck.sorting_left', { n: left.length })); paint(); }
      root.focus({ preventScroll: true });
    }

    async function paint() {
      const id = queue[pos], m = cur(), my = ++token;
      const t = tally();
      $('.s-count').textContent = queue.length ? tr('ui.deck.photo_of', { i: pos + 1, n: queue.length }) : tr('ui.deck.no_photos');
      $('.s-tally').textContent = queue.length ? tr('ui.deck.tally', { liked: t.liked, disliked: t.disliked, left: t.left }) : '';
      $('.s-progress i').style.width = queue.length ? `${Math.round((100 * (t.liked + t.disliked)) / queue.length)}%` : '0';
      const mark = $('.s-mark');
      mark.hidden = !(m && m.liked);
      mark.className = 's-mark ' + (m && m.liked ? m.liked : '');
      mark.textContent = m && m.liked === 'liked' ? tr('ui.deck.stamp_liked') : m && m.liked === 'disliked' ? tr('ui.deck.stamp_disliked') : '';
      $('[data-act="like"]').setAttribute('aria-pressed', String(!!m && m.liked === 'liked'));
      $('[data-act="dislike"]').setAttribute('aria-pressed', String(!!m && m.liked === 'disliked'));
      $('.s-taglist').replaceChildren(...(m ? m.tags : []).map((t) => {
        const chip = document.createElement('button');
        chip.type = 'button'; chip.className = 'chip'; chip.textContent = t + ' ×'; chip.title = tr('ui.deck.remove_tag', { tag: t });
        chip.addEventListener('click', () => Promise.resolve(src.removeTag(id, t)).then(paint));
        return chip;
      }));
      const next = id ? await src.url(id) : null;
      if (my !== token) { src.release(next); return; }
      src.release(url); url = next;
      const img = $('.s-pic img');
      img.src = url || '';
      img.alt = m ? m.name : '';
    }

    function onKey(e) {
      // The tag field owns its keys: nothing typed there reaches the deck's shortcuts or the page's.
      if (e.target.closest && e.target.closest('.s-quick')) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commitQuick(); } else if (e.key === 'Escape') { e.preventDefault(); hideQuick(); }
        return;
      }
      // The panel's tag box keeps its keys, except Escape, which closes the deck.
      if (e.target.closest && e.target.closest('input')) { if (e.key !== 'Escape') return; }
      // The end card: its buttons take Enter and Tab; Escape closes, the left arrow goes back to the last photo.
      if (endOpen() && e.key !== 'Escape' && e.key !== 'ArrowLeft') return;
      if (e.key === 'Enter' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); e.stopPropagation(); openQuick(''); return; }
      if (!quickOpen() && !e.ctrlKey && !e.metaKey && !e.altKey && CHAR.test(e.key)) { e.preventDefault(); e.stopPropagation(); openQuick(e.key); return; }
      if (!KEYS[e.key] && e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      press(e.key);
    }

    function open(ids, { start = 0 } = {}) {
      if (!root) build();
      queue = ids.slice(); pos = Math.min(Math.max(0, start), Math.max(0, queue.length - 1));
      opener = document.activeElement;
      root.hidden = false;
      $('.s-end').hidden = true; root.classList.remove('is-end');
      hideQuick(false);
      setStatus(queue.length ? '' : tr('ui.deck.nothing'));
      paint();
      root.focus({ preventScroll: true });
    }
    function close() {
      if (!root || root.hidden) return;
      token++;
      hideQuick(false);
      root.hidden = true;
      src.release(url); url = null;
      $('.s-pic img').removeAttribute('src');
      if (opener && opener.isConnected) try { opener.focus({ preventScroll: true }); } catch (e) { /* gone */ }
      if (src.onClose) src.onClose();
    }
    const state = () => ({ open: !!root && !root.hidden, pos, length: queue.length, id: queue[pos] || null, quick: quickOpen(), end: endOpen() });
    return { open, close, press, state, get element() { return root; } };
  }

  g.SlopDeck = { create, rules: { decide, KEYS } };
})(typeof window !== 'undefined' ? window : globalThis);
