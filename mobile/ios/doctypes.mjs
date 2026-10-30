// The iPhone and iPad app's files, as the system sees them: the facts the patch step (mobile/ios/capacitor.mjs) writes
// into the Xcode project so that
//   - the app's Documents folder shows in the Files app (On My iPhone/iPad › <app>) and in device backups;
//   - other apps can hand it files (Open in…, the share sheet, Files, Mail): the document types are the one table of the
//     types the suite opens (desktop/lib/open-map.js ASSOCIATIONS), opened in place so a save goes back to the file;
//   - with a container id (mobile/mobile.json ios.icloud, or `capacitor.mjs icloud <id>`: the brand side, never this
//     repository) the app may keep its folder in iCloud Drive.
// Pure; Node only. Tests: tests/node/mobile-ios-files.test.mjs.
//   documentTypes(assoc)            CFBundleDocumentTypes
//   importedTypes()                 UTImportedTypeDeclarations for the types iOS itself may not declare (Markdown, .eml)
//   fileKeys(assoc)                 the Info.plist keys for Files, backups and Open in
//   icloudKeys(container, name)     the Info.plist keys of the iCloud Drive folder
//   entitlements(container)         App.entitlements for that container
//   useEntitlements(pbxproj, file)  CODE_SIGN_ENTITLEMENTS in the app target's build settings
//   hookScene(swift)                SceneDelegate.swift hands opened files to the app's inbox (SiteFiles.swift)

/** One document type per association: every app of the suite edits what it opens; another app stays the owner. */
export function documentTypes(assoc) {
  return assoc.map((a) => ({
    CFBundleTypeName: a.name,
    CFBundleTypeRole: 'Editor',
    LSHandlerRank: 'Alternate',
    LSItemContentTypes: a.uti,
  }));
}

/** Types an iPhone may not declare itself: declared here as imported (the system's own declaration wins where it has one). */
export function importedTypes() {
  return [
    { UTTypeIdentifier: 'net.daringfireball.markdown', UTTypeDescription: 'Markdown file', UTTypeConformsTo: ['public.plain-text'],
      UTTypeTagSpecification: { 'public.filename-extension': ['md', 'markdown'], 'public.mime-type': ['text/markdown'] } },
    { UTTypeIdentifier: 'com.apple.mail.email', UTTypeDescription: 'Email message', UTTypeConformsTo: ['public.data', 'public.email-message'],
      UTTypeTagSpecification: { 'public.filename-extension': ['eml'], 'public.mime-type': ['message/rfc822'] } },
  ];
}

/** The Info.plist keys: the Documents folder in Files (and so in backups), files opened in place, the document types. */
export function fileKeys(assoc) {
  return {
    UIFileSharingEnabled: true,
    LSSupportsOpeningDocumentsInPlace: true,
    CFBundleDocumentTypes: documentTypes(assoc),
    UTImportedTypeDeclarations: importedTypes(),
  };
}

const CONTAINER = /^iCloud\.[A-Za-z0-9.-]+$/;
/** True for an iCloud container id (iCloud.<reverse domain>). */
export const isContainer = (id) => CONTAINER.test(String(id || ''));

/** The Info.plist keys of the iCloud Drive folder: public (it shows in iCloud Drive under name) and the id the app reads. */
export function icloudKeys(container, name) {
  if (!isContainer(container)) throw new Error(`not an iCloud container id: ${container}`);
  return {
    SiteICloudContainer: container,
    NSUbiquitousContainers: { [container]: { NSUbiquitousContainerIsDocumentScopePublic: true, NSUbiquitousContainerName: name, NSUbiquitousContainerSupportedFolderLevels: 'Any' } },
  };
}

/** App.entitlements: iCloud Documents in that container. */
export function entitlements(container) {
  if (!isContainer(container)) throw new Error(`not an iCloud container id: ${container}`);
  return {
    'com.apple.developer.icloud-container-identifiers': [container],
    'com.apple.developer.icloud-services': ['CloudDocuments'],
    'com.apple.developer.ubiquity-container-identifiers': [container],
  };
}

/** project.pbxproj with CODE_SIGN_ENTITLEMENTS = file in every build configuration of the app target (the ones that
 * name App/Info.plist); an existing setting is replaced. */
export function useEntitlements(pbx, file = 'App/App.entitlements') {
  return pbx.replace(/\n\s*CODE_SIGN_ENTITLEMENTS = [^;]+;/g, '')
    .replace(/\n(\s*)INFOPLIST_FILE = App\/Info\.plist;/g, (m, pad) => `\n${pad}CODE_SIGN_ENTITLEMENTS = ${file};${m}`);
}

/** SceneDelegate.swift: files opened with the app (Open in…, share, Files; at launch or later) go to SiteInbox first. */
export function hookScene(swift) {
  let s = swift;
  if (!s.includes('SiteInbox.shared.receive(connectionOptions.urlContexts)')) {
    s = s.replace(/(\n([ \t]*))(SceneDelegateProxy\.shared\.scene\(scene, willConnectTo:)/, '$1SiteInbox.shared.receive(connectionOptions.urlContexts)$1$3');
  }
  if (!s.includes('SiteInbox.shared.receive(URLContexts)')) {
    s = s.replace(/(\n([ \t]*))(SceneDelegateProxy\.shared\.scene\(scene, openURLContexts:)/, '$1SiteInbox.shared.receive(URLContexts)$1$3');
  }
  return s;
}
