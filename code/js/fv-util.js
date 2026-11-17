/* Slop Code, Formatted view: small helpers shared by the formatters. Everything here is pure: text in, value out. */
import { message } from './fv-messages.js';

/** The 1-based line and column of offset `pos` in `text` (a lone CR is not a line break: the view turns them into LF first). */
export function lineCol(text, pos) {
  const end = Math.min(Math.max(pos, 0), text.length);
  let line = 1, last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < end; i = text.indexOf('\n', i + 1)) { line++; last = i; }
  return { line, col: end - last };
}

/** A failed result for message `id` (fv-messages.js) that points at offset `pos` of `text`. */
export function fail(text, pos, id, args) {
  const { line, col } = lineCol(text, pos);
  return { ok: false, ...message(id, args), line, col };
}

/** Two spaces per level, cached: the printers call this once per line. */
const PADS = [''];
export function pad(level) {
  while (PADS.length <= level) PADS.push(PADS[PADS.length - 1] + '  ');
  return PADS[level];
}
