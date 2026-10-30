// Two README parts every copy of the site carries, written once: "Fork me!" (why and how to host your own copy) and the
// line with the yearly savings (shared/savings/data.mjs). This repository's README.md holds them as these functions write
// them for its own profile (tests/node/whitelabel-readme-fork.test.mjs checks it), and a white-label build's generated README
// (emit.mjs readme) gets them for its profile: its name, its address, its own files.
// Node only. Tests: tests/node/whitelabel-readme-fork.test.mjs.
import { SHOWN } from '../../shared/savings/data.mjs';
import { hasOverlay } from './mascot.mjs';

const usd = (n) => '$' + n.toLocaleString('en-US');
// the mascot's art is all rights reserved (LICENSE-ART): this site's own, or a build's own mascot (hasOverlay)
const art = (p, source) => (source ? p.mascot === true : hasOverlay(p));
const kept = (p, source) => {
  const l = [`the name ${p.name}`, 'its logo'].concat(art(p, source) ? ['the mascot art'] : [], p.media ? ['the media (screenshots, videos)'] : []);
  return l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
};
const notes = (p, source) => ['[`NOTICE.md`](NOTICE.md)', '[`TRADEMARKS.md`](TRADEMARKS.md)']
  .concat(art(p, source) ? ['[`LICENSE-ART`](LICENSE-ART)'] : []).join(', ');

/** "Fork me!": p is the profile; source is true for this repository (it has the brand guide), false for a build. */
export const forkMe = (p, source) => `## Fork me! (no, really)

Every copy of ${p.name} is one more place where people can use free, private, offline browser tools. A single site can go
down, get blocked by a school or office filter, or simply disappear; a hundred copies are much harder to lose. It is MIT
licensed, so hosting your own is not just allowed, it is the point.

1. **Fork** this repository.
2. **Enable GitHub Pages** on your fork (Settings → Pages) for your default branch, from the root folder. There is no
   build step: the files are the site.
3. **Give it a home of its own.** The site expects the root of a domain: name the fork \`<your-account>.github.io\`, or
   put your own domain in \`CNAME\` (it holds ours, so change or delete it either way).
4. **Optional: make it yours.** Name, colours and logo are one file: ${source
    ? 'see [`brand/README.md`](brand/README.md)'
    : '[`brand/brand.json`](brand/brand.json)'}.

The code is MIT, but ${kept(p, source)}
are not part of that licence (${notes(p, source)}): a public copy brings its own.

Congratulations: you now run a software suite, and your hosting bill is still zero.
`;

/** The savings line, or '' when the profile hides the figure ("savings": false). */
export const savingsLine = (p) => (p.savings === false ? '' : `The apps stand in for about **${usd(SHOWN)} a year** of paid software for one person, at list prices
([how it is counted](${p.origin}/#savings)).
`);
