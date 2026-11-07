// Slop Colors' pure modules for the Node tests: shared/color/model.js (SlopColor, a classic script), the shared contrast
// maths and colors/js/core/*.js (UMD factories, the colour wheel's core/wheel.js too), wired as the page wires them.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const ctx = vm.createContext({});
ctx.window = ctx;
vm.runInContext(readFileSync(path.join(ROOT, 'shared/color/model.js'), 'utf8'), ctx);
export const Model = ctx.SlopColor;
export const M = require('../../shared/color/contrast.js');
export const C = require('../../colors/js/core/convert.js')(Model, M);
export const H = require('../../colors/js/core/harmony.js')(C, M);
export const K = require('../../colors/js/core/kmeans.js')(C);
export const F = require('../../colors/js/core/formats.js')(C);
export const A = require('../../colors/js/core/ase.js')(C);
export const WH = require('../../colors/js/core/wheel.js')(C, H);
