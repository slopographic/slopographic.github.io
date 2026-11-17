// Guides for the creative apps, part 2: Slop Resize (resize), Slop Upscale (upscale), SlopIsolate (cutout) and Slop
// Watermark (watermark). Shape in tools/seo/guides.mjs. Every step matches the app as it is; screenshots are real.
// Sources: resize/index.html, resize/js/app/*.js; upscale/index.html; slopisolate/HANDOFF.md, slopisolate/js/ui/*.js;
// watermark/index.html, watermark/js/main.js, export.js.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/guide-creative-2*.js (keys seo.guide.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const GUIDES = [
  {
    app: 'resize',
    slug: 'getting-started',
    sections: [null, { image: { src: '/assets/guides/resize-getting-started-1.jpg' } }, { image: { src: '/assets/guides/resize-getting-started-2.jpg' } }],
  },
  {
    app: 'upscale',
    slug: 'getting-started',
    crumb: '@seo.guide.resize.getting-started.crumb',
    sections: [null, null, { image: { src: '/assets/guides/upscale-getting-started-1.jpg' } }],
  },
  {
    app: 'cutout',
    slug: 'getting-started',
    crumb: '@seo.guide.resize.getting-started.crumb',
    sections: [{ image: { src: '/assets/guides/cutout-getting-started-1.jpg' } }],
    shortcuts: [['Ctrl+O'], ['K / R'], ['H'], ['0'], ['+ / -'], ['Ctrl+Z / Ctrl+Y'], ['Ctrl+S'], ['Shift+Ctrl+S']],
  },
  {
    app: 'watermark',
    slug: 'getting-started',
    crumb: '@seo.guide.resize.getting-started.crumb',
    sections: [
      { h2: '@seo.guide.resize.getting-started.sections.0.h2', steps: [null, '@seo.guide.resize.getting-started.sections.0.steps.1'] },
      { image: { src: '/assets/guides/watermark-getting-started-1.jpg' } },
      { image: { src: '/assets/guides/watermark-getting-started-2.jpg' } },
    ],
  },
];
