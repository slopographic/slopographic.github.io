/* Slop Paint, part 03: DOM handles, constants and the shared state (P.st).
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, ctx2d } = P;
P.st = {
  op: null, // current pointer operation
  sel: null, // selection {x,y,w,h,canvas?,mask?,ver}
  text: null, // active text box
  curve: null, // curve tool state
  poly: null, // polygon tool state
  clip: null, // internal clipboard canvas
  clipInternalNewer: false,
  pan: null, // two-finger pan state
  slopStroke: null,
  drips: [],
  dripRAF: 0,
  fileMode: 'open',
  openMenu: -1,
  menuEl: null,
};

/* =====================================================================
 * DOM + state
 * ===================================================================== */
const win = $('#win'), ws = $('#ws'), stage = $('#stage'), wrap = $('#wrap');
const main = $('#main'), over = $('#overlay'), gridEl = $('#grid');
const selBox = $('#selbox'), ghost = $('#ghost'), optbox = $('#optbox');
const fontbar = $('#fontbar'), toastEl = $('#toast');
const mctx = ctx2d(main, { alpha: false, willReadFrequently: true });
const octx = ctx2d(over);

const BRUSHES = [
  ['circle', 8], ['circle', 5], ['circle', 2],
  ['square', 8], ['square', 5], ['square', 2],
  ['slash', 8], ['slash', 5], ['slash', 3],
  ['back', 8], ['back', 5], ['back', 3],
];
const EMOJIS = ['🦐', '🙏', '😇', '🍞', '🥦', '🦀', '🔥', '✨', '💀', '😭'];
const FONTS = [
  ['Arial', 'Arial, "Liberation Sans", Helvetica, sans-serif'],
  ['Times New Roman', '"Times New Roman", "Liberation Serif", Times, serif'],
  ['Courier New', '"Courier New", "Liberation Mono", Courier, monospace'],
  ['Comic Sans MS', '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive'],
  ['Impact', 'Impact, "Arial Black", "Haettenschweiler", sans-serif'],
  ['Georgia', 'Georgia, "DejaVu Serif", serif'],
  ['Verdana', 'Verdana, "DejaVu Sans", sans-serif'],
  ['Trebuchet MS', '"Trebuchet MS", "Lucida Grande", sans-serif'],
  ['Tahoma', 'Tahoma, "DejaVu Sans", sans-serif'],
];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72, 96];
const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000', '#9fcc00',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040', '#d4ff3a',
];
const DEFAULT_MSG = 'paint-classic.status.default'; // a key: status() shows it in the chosen language

const S = {
  w: 800, h: 500, zoom: 1,
  tool: 'pencil', prevTool: 'pencil',
  primary: '#000000', secondary: '#ffffff',
  lineWidth: 1, fillMode: 0,
  brush: 1, eraser: 8, air: 8, magZoom: 4,
  transparent: false, textOpaque: false,
  slop: 14, emoji: '🦐', emojiSize: 40,
  grid: false, dirty: false, fileName: 'untitled',
  font: { family: 0, size: 18, bold: false, italic: false, underline: false },
  fontbarClosed: false,
};

const touches = new Map();
const undoStack = [], redoStack = [];

Object.assign(P, { BRUSHES, DEFAULT_MSG, EMOJIS, FONTS, FONT_SIZES, PALETTE, S, fontbar, ghost, gridEl, main, mctx, octx, optbox, over, redoStack, selBox, stage, toastEl, touches, undoStack, win, wrap, ws });
})();
