// The iPhone and iPad app's files: the Info.plist and entitlements the patch step writes (the folder in the Files app and
// in backups, Open in… for the suite's types, iCloud Drive with a container id from the brand side), SceneDelegate
// handing opened files to the inbox, the one file → app table (shared with the desktop app), and the page glue's pure
// parts (native/files.js). The browser side: tests/native/files.test.html.
// Covers: mobile/ios/plist.mjs, mobile/ios/doctypes.mjs, mobile/ios/files.js, desktop/lib/open-map.js, mobile/ios/capacitor.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { plistValue, patchPlist, plistDoc } from '../../mobile/ios/plist.mjs';
import { documentTypes, importedTypes, fileKeys, icloudKeys, entitlements, useEntitlements, hookScene, isContainer } from '../../mobile/ios/doctypes.mjs';
import { nativeConfig, injectNative } from '../../mobile/ios/bundle.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OM = require('../../desktop/lib/open-map.js');
const FJ = require('../../mobile/ios/files.js');
const PLIST = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleDisplayName</key>\n\t<string>Old</string>\n\t<key>UIApplicationSceneManifest</key>\n\t<dict>\n\t\t<key>UIFileSharingEnabled</key>\n\t\t<false/>\n\t</dict>\n\t<key>CFBundleDocumentTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleTypeName</key>\n\t\t\t<string>Old</string>\n\t\t</dict>\n\t</array>\n\t<key>LSRequiresIPhoneOS</key>\n\t<true/>\n</dict>\n</plist>\n`;

test('plist values: strings, booleans, numbers, arrays and dicts', () => {
  assert.equal(plistValue('a<b'), '<string>a&lt;b</string>');
  assert.equal(plistValue(true), '<true/>');
  assert.equal(plistValue(3), '<integer>3</integer>');
  assert.equal(plistValue([]), '<array/>');
  assert.equal(plistValue({ k: ['x'] }, 0), '<dict>\n\t<key>k</key>\n\t<array>\n\t\t<string>x</string>\n\t</array>\n</dict>');
  assert.match(plistDoc({ a: true }), /^<\?xml[\s\S]*<plist version="1.0">\n<dict>\n\t<key>a<\/key>\n\t<true\/>\n<\/dict>\n<\/plist>\n$/);
});

test('patchPlist replaces a top-level key of any type, never one inside a nested dict, and adds new keys', () => {
  const out = patchPlist(PLIST, { UIFileSharingEnabled: true, CFBundleDocumentTypes: [{ CFBundleTypeName: 'PDF' }], CFBundleDisplayName: 'New' });
  assert.match(out, /<key>CFBundleDisplayName<\/key>\n\t<string>New<\/string>/);
  assert.match(out, /<dict>\n\t\t<key>UIFileSharingEnabled<\/key>\n\t\t<false\/>/, 'the nested key stays');
  assert.match(out, /\t<key>UIFileSharingEnabled<\/key>\n\t<true\/>\n<\/dict>/, 'a top-level one is added');
  assert.equal((out.match(/CFBundleTypeName/g) || []).length, 1, 'the old array is replaced');
  assert.match(out, /<string>PDF<\/string>/);
  assert.equal(patchPlist(out, { UIFileSharingEnabled: true, CFBundleDocumentTypes: [{ CFBundleTypeName: 'PDF' }], CFBundleDisplayName: 'New' }), out, 'patching again changes nothing');
  assert.match(out, /<key>LSRequiresIPhoneOS<\/key>\n\t<true\/>/);
});

test('the document types are the one file table: every type the app must open, as Apple type identifiers', () => {
  const types = documentTypes(OM.ASSOCIATIONS), utis = types.flatMap((t) => t.LSItemContentTypes);
  for (const u of ['com.adobe.pdf', 'org.openxmlformats.wordprocessingml.document', 'org.openxmlformats.spreadsheetml.sheet', 'org.openxmlformats.presentationml.presentation',
    'public.comma-separated-values-text', 'public.png', 'public.jpeg', 'public.heic', 'public.svg-image', 'net.daringfireball.markdown', 'public.plain-text', 'public.json', 'com.apple.mail.email']) assert.ok(utis.includes(u), u);
  for (const t of types) { assert.equal(t.CFBundleTypeRole, 'Editor'); assert.equal(t.LSHandlerRank, 'Alternate'); assert.ok(t.CFBundleTypeName); }
  for (const a of OM.ASSOCIATIONS) assert.ok(Array.isArray(a.uti) && a.uti.length && a.mime && a.name, a.ext.join());
  assert.deepEqual(importedTypes().map((t) => t.UTTypeIdentifier), ['net.daringfireball.markdown', 'com.apple.mail.email']);
  const keys = fileKeys(OM.ASSOCIATIONS);
  assert.equal(keys.UIFileSharingEnabled, true, 'the Documents folder shows in Files (and is in backups)');
  assert.equal(keys.LSSupportsOpeningDocumentsInPlace, true, 'files open in place, so a save goes back to them');
});

test('each type opens in the app the site uses for it (the desktop app and the iPhone app read the same map)', () => {
  const { manifest, apps } = OM.loadRegistry(ROOT), map = OM.openMap(manifest, apps), at = (id) => '/' + apps.find((a) => a.id === id).path;
  assert.equal(map.pdf, at('pdf'));
  assert.equal(map.docx, at('docs'));
  assert.equal(map.xlsx, at('tables'));
  assert.equal(map.pptx, at('slides'));
  assert.equal(map.eml, at('eml'));
  for (const a of OM.ASSOCIATIONS) for (const e of a.ext) assert.ok(/^\/[\w-]+\/$/.test(map[e]), e);
  assert.equal(OM.routeFor('Scan.HEIC', map), map.heic);
  // the app's config carries the map; every page loads the files glue
  const cfg = nativeConfig({ TAG: 't', urls: () => [] }, [], '/', map);
  assert.equal(JSON.parse(cfg.replace(/^window\.NATIVE_CONFIG = |;\n$/g, '')).open.pdf, at('pdf'));
  assert.match(injectNative('<head></head>'), /<script src="\/native\/native\.js"><\/script><script src="\/native\/files\.js"><\/script><script src="\/shared\/native-app\.js">/);
});

test('iCloud Drive: the container id comes from outside (it is checked, never made up here)', () => {
  assert.equal(isContainer('iCloud.com.example.app'), true);
  assert.equal(isContainer('com.example.app'), false);
  assert.throws(() => icloudKeys('nope', 'X'));
  const k = icloudKeys('iCloud.com.example.app', 'Ex Office');
  assert.equal(k.SiteICloudContainer, 'iCloud.com.example.app');
  assert.deepEqual(k.NSUbiquitousContainers['iCloud.com.example.app'], { NSUbiquitousContainerIsDocumentScopePublic: true, NSUbiquitousContainerName: 'Ex Office', NSUbiquitousContainerSupportedFolderLevels: 'Any' });
  assert.deepEqual(entitlements('iCloud.com.example.app')['com.apple.developer.icloud-services'], ['CloudDocuments']);
  const pbx = '\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;\n\t\t\t\tX = 1;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;\n';
  const once = useEntitlements(pbx);
  assert.equal((once.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2, 'Debug and Release');
  assert.equal(useEntitlements(once), once);
  // nothing in this repository names a real container
  assert.equal(JSON.parse(readFileSync(path.join(ROOT, 'mobile/mobile.json'), 'utf8')).ios.icloud, undefined);
});

test('SceneDelegate hands every opened file to the inbox first, at launch and later; the plugin is registered', () => {
  const swift = `class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }
}`;
  const out = hookScene(swift);
  assert.match(out, /\n {8}SiteInbox\.shared\.receive\(connectionOptions\.urlContexts\)\n {8}SceneDelegateProxy\.shared\.scene\(scene, willConnectTo:/);
  assert.match(out, /\n {8}SiteInbox\.shared\.receive\(URLContexts\)\n {8}SceneDelegateProxy\.shared\.scene\(scene, openURLContexts:/);
  assert.equal(hookScene(out), out);
  const read = (f) => readFileSync(path.join(ROOT, 'mobile/ios', f), 'utf8');
  assert.match(read('SiteRouter.swift'), /bridge\?\.registerPluginInstance\(SiteFilesPlugin\(\)\)/);
  for (const m of ['info', 'setICloud', 'tree', 'write', 'move', 'remove', 'mkdir', 'takeOpened', 'writeBack', 'exportFile']) assert.match(read('SiteFiles.swift'), new RegExp(`@objc func ${m}\\(`), m);
  assert.match(read('SiteFiles.swift'), /to = try self\.place\(call, "to"\)/, 'move takes its target from "to" (files.js), never the root itself');
  assert.match(read('SiteInbox.swift'), /func receive\(_ contexts: Set<UIOpenURLContext>\)/);
  assert.match(read('capacitor.mjs'), /'SiteRouter\.swift', 'SiteFiles\.swift', 'SiteInbox\.swift'/);
});

test('the files glue: the page a file opens in, a file of the app\'s own folder as its Drive file', () => {
  const map = { pdf: '/pdf/', docx: '/docs/' };
  assert.equal(FJ.routeFor('A.PDF', map), '/pdf/');
  assert.equal(FJ.routeFor('archive.zip', map), '/drive/');
  assert.equal(FJ.join('file:///docs/', 'My Papers/a b#.pdf'), 'file:///docs/My%20Papers/a%20b%23.pdf');
  assert.equal(FJ.partOf('a/b/c.pdf'), 'a/b/.c.pdf.part');
  assert.equal(FJ.partOf('c.pdf'), '.c.pdf.part');
  const state = { root: 'documents', files: { id1: { p: 'My Papers/a.pdf' } } };
  const g = FJ.group([{ name: 'a.pdf', inside: 'documents', rel: 'My Papers/a.pdf' }, { name: 'b.docx', inside: '' }, { name: 'c.pdf', inside: 'icloud', rel: 'My Papers/a.pdf' }], map, state);
  assert.equal(g['/pdf/'][0].drive, 'id1');
  assert.equal(g['/pdf/'][1].drive, undefined, 'another root: not that Drive file');
  assert.equal(g['/docs/'].length, 1);
});
