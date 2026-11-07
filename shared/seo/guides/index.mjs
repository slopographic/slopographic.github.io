// Guides: the tutorials of each app ("Getting started with PhotoSlop" and the like), one file per family (split into
// parts to stay short), drawn by tools/seo/guides.mjs (the shape of a guide is in its header) and listed in each app's
// guide sidebar.
import { hydrate, seg } from '../i18n.mjs';

// The facts of every guide, in this order; guidesIn(code) joins them with that language's words.
import { FACTS } from './facts.mjs';
export const guidesIn = (code = 'en') => FACTS.map((g) => hydrate(g, `seo.guide.${seg(g.app)}.${seg(g.slug)}`, code));
export const GUIDES = guidesIn('en');
