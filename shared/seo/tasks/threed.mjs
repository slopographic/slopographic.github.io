// 3D model files: viewing them in Slop 3D (app id 3d) and converting them in File convert (app id convert). Both read
// and write through the shared 3D I/O module (shared/3d-io, the three.js 0.170.0 loaders and exporters). File convert
// takes ?to=<conversion id> (convert/js/ui/route.js), for example to=3d-to-stl.
// The facts only: the words are in the SEO tables, shared/seo/i18n/<code>/task-threed*.js (keys seo.task.*),
// joined by index.mjs (shared/seo/i18n.mjs). '@<key>' is the text of that key. Rules: shared/seo/i18n/README.md.
export const TASKS = [
  { app: '3d', slug: 'stl-viewer' },
  { app: '3d', slug: 'fbx-viewer' },
  { app: 'convert', slug: '3d-file-converter', h1: '@seo.task.convert.3d-file-converter.crumb' },
  { app: 'convert', slug: '3d-model-to-stl', query: 'to=3d-to-stl' },
];
