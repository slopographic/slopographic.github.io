/* Slop Gallery: Sort mode, the swipe deck (shared/deck/deck.js) over a queue: the photos visible when it opened, or the
 * selection. Likes, dislikes and tags are the library's own (photo.liked, photo.tags, and the Drive record for Drive
 * photos), so every view of the app sees them at once. The deck's keys and rules are SlopDeck's (and G.sort, for the
 * code and tests that read the rules here). Exposes window.SlopGallery.sortmode: open(ids), close(), press(key), state(). */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  G.sort = window.SlopDeck.rules;
  let deck = null;
  /** The deck, made on first use (the library is ready by then). */
  function get() {
    if (!deck) deck = window.SlopDeck.create({
      photo: (id) => G.library.photo(id),
      url: (id) => G.urls.original(id),
      release: (u) => G.urls.release(u),
      setLiked: (id, tag) => G.library.setLiked([id], tag),
      addTag: (id, tag) => G.library.addTag([id], tag),
      removeTag: (id, tag) => G.library.removeTag([id], tag),
      on: (fn) => G.library.on(fn),
    });
    return deck;
  }
  G.sortmode = {
    open: (ids, o) => get().open(ids, o),
    close: () => deck && deck.close(),
    press: (key) => (deck ? deck.press(key) : Promise.resolve(null)),
    state: () => (deck ? deck.state() : { open: false, pos: 0, length: 0, id: null, quick: false }),
  };
})();
