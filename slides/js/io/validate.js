/* Slop Slides: the deck validator. Every deck that comes in (a .sslide from Slop Drive, a draft, or a .sslide-template
   file) goes through SS.deckCheck.run(deck) before the editor sees it: shape, version check, migration of older files
   (anim/migrate.js), then structure. A bad deck throws an Error whose message says where and what is wrong, so the
   caller can show the reason and change nothing. Exposes window.SS.deckCheck. */
(function () {
  'use strict';
  var SS = window.SS, O = SS.objects;
  var C = SS.deckCheck = {};
  var TYPES = ['text', 'shape', 'image', 'table', 'chart', 'media', 'group'];

  function fail(where, msg) { throw new Error(where ? where + ': ' + msg : msg); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /** Step 1: the outer shape. Runs before anything is changed, so migration can rely on it. */
  C.shape = function (d) {
    if (!isObj(d)) fail('', 'this is not a Slop Slides deck'); // i18n-ignore
    if (!Array.isArray(d.slides)) fail('', 'the deck has no list of slides'); // i18n-ignore
    if (!isObj(d.size) || !isNum(d.size.w) || !isNum(d.size.h) || d.size.w <= 0 || d.size.h <= 0) fail('', 'the slide size is missing or not a number'); // i18n-ignore
    if (d.media != null && !isObj(d.media)) fail('', 'the picture list is not an object'); // i18n-ignore
    if (d.theme != null && typeof d.theme !== 'string' && !isObj(d.theme)) fail('', 'the theme is not valid'); // i18n-ignore
    d.slides.forEach(function (s, i) {
      var at = 'Slide ' + (i + 1); // i18n-ignore
      if (!isObj(s)) fail(at, 'this is not a slide'); // i18n-ignore
      if (!Array.isArray(s.objects)) fail(at, 'the object list is missing'); // i18n-ignore
      if (s.layout != null && typeof s.layout !== 'string') fail(at, 'the layout is not a name'); // i18n-ignore
      if (s.transition != null && !isObj(s.transition)) fail(at, 'the transition is not an object'); // i18n-ignore
    });
  };

  /** Step 2: the version. Files from a newer Slop Slides are refused; version 1 files are migrated in step 3. */
  C.version = function (d) {
    var v = d.version;
    if (v == null) return;
    if (!Number.isInteger(v) || v < 1) fail('', 'the file version "' + v + '" is not valid'); // i18n-ignore
    if (v > SS.anim.SCHEMA) fail('', 'it was made by a newer Slop Slides (file version ' + v + ', this app reads up to ' + SS.anim.SCHEMA + ')'); // i18n-ignore
  };

  /** Step 4: structure after migration. Every object has a known type and numbers, and every picture reference exists. */
  C.objects = function (d) {
    var media = d.media || {};
    Object.keys(media).forEach(function (k) {
      var m = media[k];
      if (!isObj(m) || typeof m.data !== 'string' || !/^data:[^,]*,/.test(m.data)) fail('Picture ' + k, 'the picture is not embedded in the file'); // i18n-ignore
    });
    var layouts = SS.layouts.list.map(function (l) { return l.id; });
    d.slides.forEach(function (s, i) {
      var at = 'Slide ' + (i + 1); // i18n-ignore
      if (s.layout != null && layouts.indexOf(s.layout) < 0) fail(at, 'unknown layout "' + s.layout + '"'); // i18n-ignore
      if (s.background && s.background.media) checkRef(media, s.background.media, at, 'background');
      checkList(s.objects, at, media);
    });
  };
  function checkRef(media, id, at, what) {
    if (!media[id]) fail(at, what + ' refers to a picture that is not in the file'); // i18n-ignore
  }
  function checkList(list, at, media) {
    list.forEach(function (o, i) {
      var where = at + ', object ' + (i + 1) + (o && o.name ? ' (' + o.name + ')' : '');
      if (!isObj(o)) fail(where, 'this is not an object'); // i18n-ignore
      if (TYPES.indexOf(o.type) < 0) fail(where, 'unknown type "' + o.type + '"'); // i18n-ignore
      if (!isNum(o.x) || !isNum(o.y) || !isNum(o.w) || !isNum(o.h)) fail(where, 'the position or size is not a number'); // i18n-ignore
      if (o.type === 'shape' && O.SHAPES.indexOf(o.shape) < 0) fail(where, 'unknown shape "' + o.shape + '"'); // i18n-ignore
      if (o.type === 'table' && !Array.isArray(o.cells)) fail(where, 'the table has no cells'); // i18n-ignore
      if (o.type === 'group') { if (!Array.isArray(o.children)) fail(where, 'the group has no children'); checkList(o.children, where, media); } // i18n-ignore
      if (o.anims != null && !Array.isArray(o.anims)) fail(where, 'the animations are not a list'); // i18n-ignore
      if (o.media != null) checkRef(media, o.media, where, 'picture');
      if (o.poster != null) checkRef(media, o.poster, where, 'poster');
    });
  }

  /** The whole check, in order. Migrates a version 1 deck in place and returns it. Throws with the reason. */
  C.run = function (d) {
    C.shape(d);
    C.version(d);
    if (SS.anim) SS.anim.migrateDeck(d);
    C.objects(d);
    return d;
  };
})();
