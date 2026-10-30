// The site frame written into a hand-made page between its markers (tools/seo/write.mjs): <!-- site:head --> (theme,
// consent, the content-page stylesheet), <!-- site:top --> (the header), <!-- site:foot --> (the footer),
// <!-- site:footnav --> (the footer's site links alone, footnav.mjs: the homepage and the converter pages) and
// <!-- site:marquee --> (the homepage's capability strip, marquee.mjs). A page without markers is unchanged.
//   siteChrome(html, L) -> the page with its frame in language L (a lang.mjs context; the root one when left out)
import { SITE_HEAD, siteTop, siteFoot, ROOT_L } from './frame.mjs';
import { footNav } from './footnav.mjs';
import { marquee } from './marquee.mjs';

export function siteChrome(html, L = ROOT_L) {
  const put = (name, body) => (h) => h.replace(new RegExp(`<!-- site:${name} -->[\\s\\S]*?<!-- /site:${name} -->`), () => `<!-- site:${name} -->\n${body()}\n<!-- /site:${name} -->`);
  return [put('head', () => SITE_HEAD.map((t) => '  ' + t).join('\n')), put('top', () => siteTop(L)), put('foot', () => siteFoot(L)), put('footnav', () => footNav(L)), put('marquee', () => marquee(L))].reduce((h, f) => f(h), html);
}
