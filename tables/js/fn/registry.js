/* Slop Tables: the function registry. def(name(s), f, opts) where f(ctx, ...args).
   opts: min, max (arg counts), sc (true | [indices]: lift scalars elementwise over arrays),
   lazy (args arrive as AST nodes; call ctx.ev(node)), vol (volatile), fmt (result format hint),
   help: 'ARGS|description' shown in the formula bar hints. */
export const FN = Object.create(null);
export function def(names, f, o = {}) {
  for (const n of [].concat(names)) FN[n] = { name: n, f, min: o.min ?? 0, max: o.max ?? Infinity, sc: o.sc, lazy: !!o.lazy, vol: !!o.vol, fmt: o.fmt, help: o.help, cat: o.cat };
}
/** Alias names to an existing definition. */
export function alias(to, ...names) { for (const n of names) FN[n] = { ...FN[to], name: n }; }
export const fnNames = () => Object.keys(FN).sort();
