/* Slop Tables: loads the whole function library (each file registers into FN). */
import './math.js';
import './stats.js';
import './dist.js';
import './logic.js';
import './text.js';
import './date.js';
import './lookup.js';
import { setDateCoercer } from '../engine/evaluator.js';
import { parseDateTime } from '../engine/datetime.js';
setDateCoercer((s) => { const d = parseDateTime(s); return d ? d.v : null; });
export { FN, fnNames } from './registry.js';
