// The facts of every task (shared/seo/tasks/<family>.mjs), in order, without their words: plain data, so a page can
// import it too (tests/convert/seo.test.html). index.mjs joins them with a language's words.
import { TASKS as cutout } from './cutout.mjs';
import { TASKS as creative } from './creative.mjs';
import { TASKS as creative2 } from './creative-2.mjs';
import { TASKS as creative3 } from './creative-3.mjs';
import { TASKS as documents } from './documents.mjs';
import { TASKS as documents2 } from './documents-2.mjs';
import { TASKS as documents3 } from './documents-3.mjs';
import { TASKS as documents4 } from './documents-4.mjs';
import { TASKS as business } from './business.mjs';
import { TASKS as business2 } from './business-2.mjs';
import { TASKS as business3 } from './business-3.mjs';
import { TASKS as everyday } from './everyday.mjs';
import { TASKS as everyday2 } from './everyday-2.mjs';
import { TASKS as threed } from './threed.mjs';
import { TASKS as finance } from './finance.mjs';
import { TASKS as raw } from './raw.mjs';
import { TASKS as compare } from './compare.mjs';
import { TASKS as colors } from './colors.mjs';
import { TASKS as recorder } from './recorder.mjs';
import { TASKS as fontcreator } from './fontcreator.mjs';

export const FACTS = [...cutout, ...creative, ...creative2, ...creative3, ...documents, ...documents2, ...documents3, ...documents4, ...business, ...business2, ...business3, ...everyday, ...everyday2, ...threed, ...finance, ...raw, ...compare, ...recorder, ...colors, ...fontcreator];
