/* The operations' words (shared/i18n/APPS-HOWTO.md): the tables are shared/i18n/ui/<code>/ops*.js, keys ui.ops.*. Nothing
 * is translated into a constant: a step's label and description and an option's label, hint and choices are getters that
 * read the chosen language each time, so Slop Workflows, File convert and the AI panel follow a language switch.
 *   t(key, vars)        the text in the chosen language (SlopI18n); the key itself where no table is loaded
 *   opt(base, option)   an option whose label reads base; hint: true reads base_hint; a choice given as a bare value v
 *                       (not [v, label]) reads base_<v> (lower case, non-word characters as _: 'top-left' → base_top_left, '9:16' →
 *                       base_9_16, '' → base_default)
 *   like(option, over)  a copy of an option with some fields changed, its getters kept (a spread would freeze them)
 *   stepKey(id)         the key of a step's label, 'ui.ops.step.<id>' with . and - as _; '<key>_desc' is its description.
 *                       register() (registry.js) gives a step without a label of its own these two getters.
 * Node tests load the English tables first (tests/node/ui-i18n-en.mjs), as a page does. */
const g = globalThis;

export const t = (key, vars) => (g.SlopI18n && g.SlopI18n.t ? g.SlopI18n.t(key, vars) : key);

const word = (v) => (String(v) === '' ? 'default' : String(v).replace(/\W+/g, '_').toLowerCase());
const getter = (o, name, fn) => Object.defineProperty(o, name, { get: fn, enumerable: true, configurable: true });

/** A select choice [value, label] whose label reads the key now. */
export const choice = (v, key) => getter([v], 1, () => t(key));

export function opt(base, o) {
  getter(o, 'label', () => t(base));
  if (o.hint === true) getter(o, 'hint', () => t(base + '_hint'));
  if (Array.isArray(o.options)) o.options = o.options.map((c) => (Array.isArray(c) ? c : choice(c, `${base}_${word(c)}`)));
  return o;
}

export function like(o, over = {}) {
  const c = Object.defineProperties({}, Object.getOwnPropertyDescriptors(o));
  for (const [k, v] of Object.entries(over)) Object.defineProperty(c, k, { value: v, enumerable: true, configurable: true, writable: true });
  return c;
}

export const stepKey = (id) => 'ui.ops.step.' + word(id);

/** Gives a step without its own label and description the getters of its id's keys. */
export function stepWords(op) {
  const own = (k) => Object.prototype.hasOwnProperty.call(op, k);
  if (own('label')) return op;   // File convert's catalog and the macros name their own
  getter(op, 'label', () => t(stepKey(op.id)));
  if (!own('description')) getter(op, 'description', () => t(stepKey(op.id) + '_desc'));
  return op;
}
