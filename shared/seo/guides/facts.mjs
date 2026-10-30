// The facts of every guide (shared/seo/guides/<family>.mjs), in order, without their words: plain data, so a page can
// import it too (tests/convert/seo.test.html). index.mjs joins them with a language's words.
import { GUIDES as creative } from './creative.mjs';
import { GUIDES as creative2 } from './creative-2.mjs';
import { GUIDES as creative3 } from './creative-3.mjs';
import { GUIDES as creative4 } from './creative-4.mjs';
import { GUIDES as documents } from './documents.mjs';
import { GUIDES as documents2 } from './documents-2.mjs';
import { GUIDES as documents3 } from './documents-3.mjs';
import { GUIDES as documents4 } from './documents-4.mjs';
import { GUIDES as business } from './business.mjs';
import { GUIDES as everyday } from './everyday.mjs';
import { GUIDES as compare } from './compare.mjs';
import { GUIDES as colors } from './colors.mjs';
import { GUIDES as recorder } from './recorder.mjs';
import { GUIDES as fontcreator } from './fontcreator.mjs';

export const FACTS = [...creative, ...creative2, ...creative3, ...creative4, ...documents, ...documents2, ...documents3, ...documents4, ...business, ...everyday, ...compare, ...recorder, ...colors, ...fontcreator];
