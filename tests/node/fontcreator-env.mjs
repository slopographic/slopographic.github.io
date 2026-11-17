// Slop Font's pure modules for the Node tests: SlopVector's geometry (slopvector/js/geom/*.js, classic scripts that set
// window.SVGeom), opentype.js (vendor/opentype) and fontcreator/js/core/*.js (UMD factories), wired as the page wires them.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const ctx = vm.createContext({});
ctx.window = ctx;
for (const f of ['math', 'bezier', 'hit', 'fit', 'pathdata', 'boolean']) vm.runInContext(readFileSync(path.join(ROOT, `slopvector/js/geom/${f}.js`), 'utf8'), ctx);
export const G = ctx.SVGeom;
export const OT = require('../../vendor/opentype/opentype.min.js');
const core = (f) => require(`../../fontcreator/js/core/${f}.js`);
export const CS = core('charset')();
export const P = core('paths')(G);
export const M = core('model')(CS, P);
export const S = core('sfnt')();
export const T = core('ttf')(P);
export const B = core('build')(OT, M, P, S, T);
export const I = core('import')(OT, M, CS, P);
export const TR = core('trace')(P, G);
export const ST = core('stroke')(P, G, TR);
export const SH = core('sheet')(CS);
/** zlib deflate and inflate as the page has them (CompressionStream), for WOFF. */
const pump = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
export const deflate = (b) => pump(b, new CompressionStream('deflate'));
export const inflate = (b) => pump(b, new DecompressionStream('deflate'));
export const parse = (bytes) => OT.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
export const font = (rel) => new Uint8Array(readFileSync(path.join(ROOT, rel)));
