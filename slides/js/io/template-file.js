/* Slop Slides: template files. A .sslide-template is JSON: { kind: 'slop-slides-template', format: 1, name, created,
   deck }. The deck is a whole .sslide deck: theme, slides with their layouts, transitions and animations, and every
   picture they use as embedded data (copied in, never linked). Reading one goes through SS.native.normalize, the same
   validator as a .sslide (version check, migration, structure), so a bad file is refused before anything is stored.
   Exposes window.SS.templateFile. */
(function () {
  'use strict';
  var SS = window.SS, M = SS.model, U = SS.util;
  var TF = SS.templateFile = {};
  TF.MIME = 'application/x-slop-slides-template';
  TF.EXT = 'sslide-template';
  TF.KIND = 'slop-slides-template';
  TF.FORMAT = 1;
  TF.PREVIEW_WIDTH = 480;

  /** The template file object for a deck. slideIndex (optional) keeps only that slide. Copies the deck; keeps only used pictures. */
  TF.fromDeck = function (deck, opts) {
    opts = opts || {};
    var d = U.clone(deck);
    if (opts.slideIndex != null) {
      var s = d.slides[opts.slideIndex];
      if (!s) throw new Error('There is no slide ' + (opts.slideIndex + 1));
      d.slides = [s];
    }
    d.version = SS.anim.SCHEMA;
    d.title = opts.name || d.title;
    M.gcMedia(d);
    return TF.wrap(opts.name || d.title, d);
  };
  /** Wraps a deck in the template envelope. */
  TF.wrap = function (name, deck) {
    return { kind: TF.KIND, format: TF.FORMAT, name: name || deck.title || 'Untitled template', created: Date.now(), deck: deck }; // i18n-ignore
  };
  TF.toText = function (file) { return JSON.stringify(file); };
  TF.toBlob = function (file) { return new Blob([TF.toText(file)], { type: TF.MIME }); };
  /** Plain file name for a template name ("Pitch deck" -> "Pitch deck.sslide-template"). */
  TF.fileName = function (name) {
    var base = String(name || 'Template').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); // i18n-ignore
    return (base || 'Template') + '.' + TF.EXT; // i18n-ignore
  };

  /**
   * Reads a template file's text. Throws with the reason (damaged, not a template, newer format, or whatever the deck
   * validator finds). Returns { name, created, deck } with the deck normalized. Nothing is stored here.
   */
  TF.parse = function (text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('This file is damaged and could not be read'); }
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.kind !== TF.KIND) throw new Error('This is not a Slop Slides template file');
    if (!Number.isInteger(o.format) || o.format < 1) throw new Error('The template format "' + o.format + '" is not valid');
    if (o.format > TF.FORMAT) throw new Error('It was made by a newer Slop Slides (template format ' + o.format + ', this app reads up to ' + TF.FORMAT + ')');
    if (!o.deck) throw new Error('The template has no deck');
    var deck = SS.native.normalize(o.deck);   // the same validator as a .sslide file
    return { name: (typeof o.name === 'string' && o.name.trim()) || deck.title, created: Number(o.created) || Date.now(), deck: deck };
  };

  /** A JPEG data URL of the first slide, for the template list. */
  TF.preview = function (deck) {
    var s = deck.slides[0];
    if (!s) return null;
    return SS.canvasRender.slideToCanvas(deck, s, TF.PREVIEW_WIDTH).toDataURL('image/jpeg', 0.86);
  };
})();
