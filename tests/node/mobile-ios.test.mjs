// The iPhone and iPad app (mobile/ios): the bundle's file list (the site minus what only the website and this repository
// use, and minus code that downloads code), every cdn engine the apps fetch is under engines/ (which the bundle carries),
// the page glue loaded first on every page, the brand's third parties off; the glue itself (native.js: engine fetches
// answered from the app, remote code refused, download links to the share sheet); and the Capacitor settings and the
// changes to the generated Xcode project (capacitor.mjs).
// Covers: mobile/ios/bundle.mjs, mobile/ios/native.js, mobile/ios/capacitor.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleFiles, appFolders, injectNative, appBrand, thirdPartyOff, nativeConfig } from '../../mobile/ios/bundle.mjs';
import { capConfig, patchPlist, useSiteController, useSiteStoryboard, appendOnce, patchPbxproj, iconSvg, privacyKeys, infoKeys, MIN_IOS } from '../../mobile/ios/capacitor.mjs';
import { readConfig } from '../../mobile/config.mjs';
import { TARGET } from '../../tools/compat/features.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = createRequire(import.meta.url);
const N = req('../../mobile/ios/native.js');
const C = req('../../shared/cdn/assets.js');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

const FILES = ['index.html', 'pdf/index.html', 'pdf/js/app.js', 'apps/pdf/index.html', 'apps/docs/index.html', 'docs/index.html',
  'shared/ui.js', 'vendor/pdfjs/pdf.min.mjs', 'vendor/web-llm/index.js', 'vendor/models/tools/convert.py', 'vendor/models/u2netp.onnx',
  'tests/run.mjs', 'tools/check-rules.mjs', 'sv/pdf/index.html', 'mobile/config.mjs', '.github/workflows/rules.yml', '.nojekyll',
  '.well-known/assetlinks.json', 'shot.png', 'README.md', 'CNAME', 'package.json', 'robots.txt', 'sitemap.xml', 'shared/cdn/HANDOFF.md', 'LICENSE'];

test("the bundle: the site's pages, code and models; not tests, tools, SEO language pages or code that downloads code", () => {
  const got = bundleFiles(FILES, { apps: 'all', leaveOut: [] });
  assert.deepEqual(got, ['index.html', 'pdf/index.html', 'pdf/js/app.js', 'apps/pdf/index.html', 'apps/docs/index.html', 'docs/index.html',
    'shared/ui.js', 'vendor/pdfjs/pdf.min.mjs', 'vendor/models/u2netp.onnx', 'LICENSE']);
  assert.ok(!bundleFiles(FILES, { leaveOut: ['/vendor/models/'] }).includes('vendor/models/u2netp.onnx'));
});

test('a focused app (ios.apps): the other apps and their landing pages are left out, shared code stays', () => {
  const got = bundleFiles(FILES, { apps: ['pdf'] }, { pdf: 'pdf', docs: 'docs' });
  assert.ok(got.includes('pdf/js/app.js') && got.includes('apps/pdf/index.html') && got.includes('shared/ui.js'));
  assert.ok(!got.includes('docs/index.html') && !got.includes('apps/docs/index.html'));
  const folders = appFolders(read('shared/apps.js'));
  assert.ok(Object.keys(folders).length > 20);
  for (const f of Object.values(folders)) assert.match(f, /^[a-z0-9-]+$/);
});

test('Slop Scan is in the app: its pages are bundled and get the glue and the store-app mode', () => {
  const folders = appFolders(read('shared/apps.js'));
  assert.equal(folders.scan, 'scan');
  const files = ['scan/index.html', 'scan/js/main.js', 'apps/scan/index.html', 'shared/native-app.js'];
  assert.deepEqual(bundleFiles(files, { apps: 'all', leaveOut: [] }, folders), files);
  assert.match(injectNative(read('scan/index.html')), /<script src="\/shared\/native-app\.js"><\/script>/);
});

test('every cdn engine the apps fetch is under engines/ (the folder the bundle carries)', () => {
  const dirs = [
    [read('convert/js/core/ffmpeg-engine.js'), /CORE_DIR = '([^']+)'/], [read('shared/heic/engine.js'), /BASE = '([^']+)'/],
    [read('shared/raw/engine.js'), /BASE = '([^']+)'/], [read('shared/3d-io/decoders.js'), /CDN_DIR = '([^']+)'/],
  ];
  for (const [text, re] of dirs) assert.match(text.match(re)[1], /^engines\//);
});

test('the page glue loads first, once; the app copy has no ads, donations or third parties', () => {
  const html = injectNative('<!doctype html><html><head lang="en"><script src="/x.js"></script></head></html>');
  assert.match(html, /<head lang="en"><script src="\/native\/config\.js"><\/script><script src="\/native\/native\.js"><\/script><script src="\/native\/files\.js"><\/script><script src="\/shared\/native-app\.js"><\/script><script src="\/x\.js">/);
  assert.equal(injectNative(html), html);
  assert.ok(injectNative('<p>x</p>').startsWith('<script src="/native/config.js">'));
  const b = JSON.parse(appBrand(read('brand/brand.json')));
  assert.equal(b.support.ads, false);
  assert.equal(b.support.donate, false);
  const consent = read('shared/consent/config.js');
  assert.match(consent, /\/\*profile:analytics\*\/(true|false)/);   // a white-label build may have it off already
  const on = consent.replace(/(\/\*profile:analytics\*\/)false/, '$1true');
  assert.match(thirdPartyOff(on), /\/\*profile:analytics\*\/false/);
});

test("native/config.js maps every place of an engine file (jsDelivr, GitHub) to the app's copy", () => {
  const text = nativeConfig(C, ['engines/ffmpeg/0.12.10/ffmpeg-core.wasm', 'engines/libheif/x/libheif.js'], '/pdf/');
  const win = {};
  new Function('window', text)(win);
  const cfg = win.NATIVE_CONFIG;
  assert.equal(cfg.start, '/pdf/');
  assert.equal(cfg.tag, C.TAG);
  for (const u of C.urls('engines/libheif/x/libheif.js')) assert.equal(cfg.local[u], '/cdn/engines/libheif/x/libheif.js');
  assert.equal(N.localFor(C.urls('engines/ffmpeg/0.12.10/ffmpeg-core.wasm')[0] + '?v=1', cfg.local), '/cdn/engines/ffmpeg/0.12.10/ffmpeg-core.wasm');
  assert.equal(N.localFor('https://example.org/a.wasm', cfg.local), null);
});

test('remote code is refused, data is not; download links are found', () => {
  const o = 'capacitor://localhost';
  assert.ok(N.isRemoteCode('https://example.org/lib/model-webgpu.wasm', o));
  assert.ok(N.isRemoteCode('https://example.org/x.mjs?y', o));
  assert.ok(!N.isRemoteCode('https://example.org/model.onnx', o));
  assert.ok(!N.isRemoteCode('/vendor/onnxruntime-web/ort.wasm', o));
  assert.ok(!N.isRemoteCode('blob:capacitor://localhost/abc', o));
  const a = (attrs) => ({ href: attrs.href, getAttribute: (k) => attrs[k] ?? null, hasAttribute: (k) => k in attrs });
  assert.deepEqual(N.saveTarget(a({ href: 'blob:x/1', download: 'a/b.pdf' })), { href: 'blob:x/1', name: 'a_b.pdf' });
  assert.equal(N.saveTarget(a({ href: 'blob:x/1', download: '' })).name, 'download');
  assert.equal(N.saveTarget(a({ href: 'https://x/y.pdf', download: 'y.pdf' })), null);
  assert.equal(N.saveTarget(a({ href: 'blob:x/1' })), null);
});

test('installed: engine fetches come from the app (no URL of their own), remote code is refused, saving shares', async () => {
  const calls = [], shared = [];
  const engine = C.urls('engines/raw/x/libraw.wasm')[0];
  class A { constructor(at) { this.at = at; this.href = at.href; } getAttribute(k) { return this.at[k] ?? null; } hasAttribute(k) { return k in this.at; } click() { calls.push('native-click'); } }
  const win = {
    NATIVE_CONFIG: { local: { [engine]: '/cdn/engines/raw/x/libraw.wasm' } }, location: { origin: 'capacitor://localhost' },
    fetch: async (u) => { calls.push(String(u)); return new Response(new Blob(['wasm'], { type: 'application/wasm' }), { status: 200, headers: { 'content-type': 'application/wasm' } }); },
    HTMLAnchorElement: A, navigator: {}, open: () => {},
    document: { addEventListener: () => {}, documentElement: { classList: { add: () => {} } } },
    Capacitor: { Plugins: { Filesystem: { writeFile: async (o) => ({ uri: 'file:///cache/' + o.path }) }, Share: { share: async (o) => { shared.push(o); } } } },
  };
  N.install(win);
  const r = await win.fetch(engine, { cache: 'force-cache' });
  assert.equal(r.url, '');
  assert.equal(await r.text(), 'wasm');
  assert.deepEqual(calls, ['/cdn/engines/raw/x/libraw.wasm']);
  await assert.rejects(win.fetch('https://example.org/lib.wasm'), /does not download code/);
  new A({ href: 'https://example.org/page' }).click();
  assert.equal(calls.pop(), 'native-click');
  new A({ href: 'blob:capacitor://localhost/1', download: 'report.pdf' }).click();
  for (let i = 0; i < 20 && !shared.length; i++) await new Promise((res) => setTimeout(res, 5));
  assert.deepEqual(shared, [{ title: 'report.pdf', files: ['file:///cache/report.pdf'] }]);
});

test("the bands around the page: the colours at the page's top and bottom edges, reported to the app when they change", async () => {
  assert.deepEqual(N.parseColor('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.deepEqual(N.parseColor('rgba(255, 255, 255, 0.9)'), [255, 255, 255]);
  assert.deepEqual(N.parseColor('rgb(1 2 3 / 50%)'), [1, 2, 3]);
  assert.equal(N.parseColor('rgba(0, 0, 0, 0)'), null);
  assert.equal(N.parseColor('transparent'), null);
  const node = (bg, parent = null) => ({ nodeType: 1, bg, parentElement: parent });
  const body = node('rgb(250, 250, 250)'), header = node('rgb(255, 255, 255)', body), link = node('rgba(0, 0, 0, 0)', header);
  const posted = [], frames = [], hooks = {};
  const win = {
    innerWidth: 400, innerHeight: 800, document: { body, documentElement: node('rgba(0, 0, 0, 0)'), elementFromPoint: (x, y) => (y < 10 ? link : body) },
    getComputedStyle: (e) => ({ backgroundColor: e.bg }), matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    requestAnimationFrame: (f) => frames.push(f), addEventListener: (ev, f) => { hooks[ev] = f; },
    MutationObserver: class { constructor(f) { hooks.mutation = f; } observe() {} },
    webkit: { messageHandlers: { siteChrome: { postMessage: (m) => posted.push(m) } } },
    location: { origin: 'capacitor://localhost' }, fetch: async () => new Response(''), HTMLAnchorElement: class { click() {} }, navigator: {},
  };
  win.document.addEventListener = () => {};
  win.document.documentElement.classList = { add: () => {} };
  assert.deepEqual(N.edgeColors(win), { top: [255, 255, 255], bottom: [250, 250, 250] });
  N.install(win);
  frames.shift()();
  assert.deepEqual(posted, [{ top: [255, 255, 255], bottom: [250, 250, 250] }]);
  hooks.scroll(); hooks.scroll(); assert.equal(frames.length, 1);   // once per frame
  frames.shift()(); assert.equal(posted.length, 1);                 // unchanged: not sent again
  header.bg = 'rgb(20, 20, 20)'; hooks.mutation(); frames.shift()();   // dark theme
  assert.deepEqual(posted[1], { top: [20, 20, 20], bottom: [250, 250, 250] });
});

test("Capacitor settings and the Xcode project's changes", () => {
  const cfg = readConfig(ROOT);
  const c = capConfig(cfg, { start: '/' });
  assert.equal(c.appId, cfg.appId);
  assert.equal(c.appName, cfg.name);
  assert.equal(c.webDir, 'www');
  assert.equal(c.server.appStartPath, undefined);
  assert.equal(capConfig(cfg, { start: '/pdf/' }).server.appStartPath, '/pdf/');
  assert.equal(MIN_IOS, String(TARGET.ios), 'the app needs the iOS the site supports');
  const plist = '<plist><dict>\n<key>CFBundleDisplayName</key>\n<string>My App</string>\n</dict></plist>';
  const out = patchPlist(plist, Object.assign({ CFBundleDisplayName: 'A & B', ITSAppUsesNonExemptEncryption: false }, privacyKeys('A')));
  assert.match(out, /<key>CFBundleDisplayName<\/key>\n<string>A &amp; B<\/string>/);
  assert.match(out, /<key>ITSAppUsesNonExemptEncryption<\/key>\n\t<false\/>/);
  for (const k of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryAddUsageDescription']) assert.ok(out.includes(`<key>${k}</key>`), k);
  assert.equal(patchPlist(out, { CFBundleDisplayName: 'A & B' }), out);
  assert.equal(useSiteController('window?.rootViewController = CAPBridgeViewController()'), 'window?.rootViewController = SiteViewController()');
  assert.match(useSiteStoryboard('customClass="CAPBridgeViewController" customModule="Capacitor" sceneMemberID'), /customClass="SiteViewController" customModule="App" customModuleProvider="target"/);
  const swift = readFileSync(path.join(ROOT, 'mobile/ios/SiteRouter.swift'), 'utf8');
  assert.match(swift, /struct SiteRouter: Router/);
  assert.match(swift, /class SiteViewController: CAPBridgeViewController/);
  const once = appendOnce('class AppDelegate {}\n', swift);
  assert.equal(appendOnce(once, swift), once);
  assert.equal(appendOnce(once.replace('SiteRouter()', 'Old()'), swift), once);   // a re-patch replaces an older copy
  assert.match(swift, /web\.topAnchor\.constraint\(equalTo: safe\.topAnchor\)/);   // the web view inside the safe area
  // iOS ended the page's process (too much memory): the page comes back where it was (its saved work with it), not at the start
  assert.match(swift, /web\.navigationDelegate = guardian/);
  assert.match(swift, /func webViewWebContentProcessDidTerminate\(_ webView: WKWebView\)[\s\S]*webView\.load\(URLRequest\(url: u\)\)/);
  assert.match(swift, /observe\(\\\.url/);   // the last address it showed is kept
  assert.match(swift, /forwardingTarget\(for aSelector/);   // Capacitor's own delegate still gets everything else
  const pbx = patchPbxproj('IPHONEOS_DEPLOYMENT_TARGET = 15.0;\nPRODUCT_BUNDLE_IDENTIFIER = com.getcapacitor.App;', 'com.example.app');
  assert.equal(pbx, `IPHONEOS_DEPLOYMENT_TARGET = ${MIN_IOS};\nPRODUCT_BUNDLE_IDENTIFIER = com.example.app;`);
  const svg = iconSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32"><rect/></svg>', '#000000', 1000, 0.8);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1000" height="1000"[^>]*><rect width="1000" height="1000" fill="#000000"\/><svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 32" x="100" y="100" width="800" height="800"><rect\/><\/svg><\/svg>$/);
});

test('export compliance: every build says it uses no non-exempt encryption (no question in App Store Connect)', () => {
  const cfg = readConfig(ROOT);
  const keys = infoKeys(cfg, []);
  assert.equal(keys.ITSAppUsesNonExemptEncryption, false);
  assert.equal(infoKeys({ name: 'A long app name here', shortName: 'A very long short name' }).CFBundleDisplayName, 'A long app name here');
  const plist = '<plist><dict>\n<key>ITSAppUsesNonExemptEncryption</key>\n<true/>\n</dict></plist>';
  const out = patchPlist(plist, keys);
  assert.match(out, /<key>ITSAppUsesNonExemptEncryption<\/key>\n<false\/>/);   // a true from elsewhere is turned off
  assert.equal(out.split('ITSAppUsesNonExemptEncryption').length, 2);
  assert.match(readFileSync(path.join(ROOT, 'mobile', 'ios', 'capacitor.mjs'), 'utf8'), /patchPlist\(t, infoKeys\(cfg, ASSOCIATIONS\)\)/);
});
