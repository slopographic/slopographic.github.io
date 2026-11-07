/* Slop Slides: the slide sorter (left column; a row along the bottom on phones). Each slide is a thumbnail painted with
   the editor's scene minus the prompts. A click selects the slide. The list rebuilds when slides are added, removed
   or moved, and repaints thumbnails after other edits (coalesced). Hidden slides are dimmed. Exposes window.SS.sorter. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, R = SS.canvasRender, D = SS.dom;
  var Z = SS.sorter = {};
  var list = null, items = [], timer = 0, shape = '';
  var THUMB_W = 240;

  Z.mount = function (el) {
    list = el;
    A.on('load', build);
    A.on('deck', build);
    A.on('slide', mark);
    A.on('select', mark);
    A.on('change', Z.later);
    build();
    if (SS.sorterDrag) SS.sorterDrag.mount(list);
  };
  /** After an edit: rebuild at once if slides were added, removed or moved; otherwise repaint the thumbnails soon. */
  Z.later = function () {
    if (shapeOf() !== shape) { clearTimeout(timer); build(); return; }
    clearTimeout(timer);
    timer = setTimeout(paintAll, 120);
  };
  function shapeOf() { return A.deck ? A.deck.slides.map(function (s) { return s.id; }).join(',') : ''; }
  function build() {
    if (!list || !A.deck) return;
    list.replaceChildren();
    items = A.deck.slides.map(function (s, i) {
      var cv = D.el('canvas', { class: 'thumb-cv', width: THUMB_W, height: Math.round(THUMB_W * A.deck.size.h / A.deck.size.w) });
      var btn = D.el('button', { type: 'button', class: 'thumb', draggable: 'true', 'data-id': s.id, 'aria-label': SS.util.t(s.hidden ? 'slides.app.thumb_hidden' : 'slides.app.thumb', { i: i + 1 }),
        onclick: function () { A.go(i); } }, cv, D.el('span', { class: 'thumb-n', text: String(i + 1) }));
      var li = D.el('li', { class: 'thumb-li' }, btn);
      list.append(li);
      return { id: s.id, li: li, btn: btn, cv: cv };
    });
    shape = shapeOf();
    mark();
    paintAll();
  }
  function paint(it, i) {
    var s = A.deck.slides[i];
    if (!s) return;
    R.slideToCanvas(A.deck, s, THUMB_W, { canvas: it.cv, scene: { editor: false }, onImage: Z.later });
  }
  function paintAll() { items.forEach(function (it, i) { paint(it, i); }); }
  function mark() {
    if (!A.deck) return;
    items.forEach(function (it, i) {
      var on = i === A.idx, s = A.deck.slides[i];
      it.btn.classList.toggle('on', on);
      it.btn.classList.toggle('hid', !!(s && s.hidden));
      it.btn.setAttribute('aria-current', on ? 'true' : 'false');
      if (on && it.li.scrollIntoView) it.li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
})();
