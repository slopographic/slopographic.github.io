# Store apps: Android (Google Play) and iPhone/iPad (App Store)

Both apps are made from this site, on request, by the **Store apps** workflow (`.github/workflows/mobile.yml`:
Actions -> Store apps -> Run workflow; choose `android`, `ios` or `both`). The builds are artifacts of the run; nothing in
this folder's output is ever committed (`mobile/.gitignore`), and nothing is published unless you tick **release**.

Everything comes from the site's own files, so a white-label build makes its own apps the same way:

| Fact | From |
| --- | --- |
| App id (Android package, iOS bundle id) | `CNAME`, reversed, plus `app`: `example.com` -> `com.example.app` (`mobile/config.mjs`) |
| Name, launcher name, colours, icons | `manifest.webmanifest` (`name`, `short_name`, `theme_color`, `background_color`, the 512 px `any` and `maskable` icons) |
| Signing fingerprints, the iOS app list | `mobile/mobile.json` |

Once an app id is in a store it can never change, so decide the domain (and so the id) before the first upload.

## Android: a Trusted Web Activity

The app opens the live site in the phone's own Chrome, full screen: every feature of the website (WebGPU, file
handling, the service worker and offline use) with no copy of the code to keep up to date. `mobile/android/generate.mjs`
makes the Gradle project with Bubblewrap (`@bubblewrap/core`, pinned in `mobile/android/package.json`) from the manifest
and icons of the checkout; the workflow builds an `.aab` (for Play) and `.apk` files.

Without signing secrets the run gives `app-debug.apk` (installable for testing: `adb install app-debug.apk`) and unsigned
release files. The URL bar shows until `/.well-known/assetlinks.json` names the key that signs the app.

**What the owner does, in order:**

1. **Google Play developer account**: play.google.com/console, 25 USD once, identity check (a few days). An organisation
   account needs a D-U-N-S number.
2. **Upload key** (on your own computer, kept safe and backed up; never commit it):
   `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
3. **Repository secrets** (Settings -> Secrets and variables -> Actions): `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload.jks`),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`.
4. Run the workflow (android). Its log prints the upload key's SHA-256; the artifact holds `app-release.aab`, signed.
5. In Play Console: create the app, keep **Play App Signing** on (Google holds the app signing key), upload the `.aab` to
   the internal testing track, and fill in the listing, content rating, data safety ("no data collected": everything
   stays on the device) and the target audience.
6. **Asset links**: Play Console -> Test and release -> App integrity -> App signing shows the **app signing key** SHA-256.
   Add it (and the upload key's) to `mobile/mobile.json` under `android.fingerprints["<app id>"]`, run
   `node mobile/android/assetlinks.mjs`, commit, and release the site. Check
   `https://<domain>/.well-known/assetlinks.json`; the app then opens without a URL bar.
7. Each new upload needs a higher version code: the workflow uses the run number, so later runs are always higher.

GitHub Pages serves `/.well-known/` because the site has `.nojekyll`; the Pages workflow uploads hidden files
(`include-hidden-files: true`). Any other host must serve the file as `application/json` with no redirect.

## iPhone and iPad: Capacitor around the app's own copy of the site

Apple refuses an app that only shows a website (App Review 4.2) and an app that downloads code (2.5.2). So the iOS app
carries the site: `mobile/ios/bundle.mjs` copies it into `mobile/ios/www`, Capacitor serves it from the app
(`capacitor://localhost`) in WKWebView, and it works offline from the first launch.

- **Every engine is inside the app**: the video (ffmpeg), HEIC, RAW and 3D engines the website fetches from the cdn
  repository at first use are bundled under `cdn/engines/` (about 37 MB) and answered from there by `native/native.js`.
  The AI models, font packs and other data still download at first use (data, not code).
- **No downloaded code**: `native/native.js` refuses any fetch of a script or WebAssembly file from another host. The
  local chat models (WebLLM) fetch compiled model code, so `vendor/web-llm` is left out of the app; choosing a local
  chat model there ends in a load error. Cloud AI with your own key works.
- **No analytics, ads or donation links** in the app (an App Store app may not point to outside payments).
- **Store-app mode** (`shared/native-app.js`, loaded on every page of the app): no install button or "Add to Home
  Screen" help, no desktop downloads, no other platforms or stores, no tip jar or payment links, and no links to the
  website's own comparison and app pages (App Review 2.3.10 and 3.1.1). A page marks website-only text with
  `data-web-only`.
- **Privacy policy**: `/privacy/` (the footer and Settings link to it). Its address on the website is the App Store
  Connect privacy policy URL.
- **Files** (`SiteFiles.swift`, `SiteInbox.swift`, `files.js`; the site side in `shared/native/`, used only where
  `SlopNative.files()` says the page runs in this app): the app's Documents folder shows in the Files app (On My
  iPhone/iPad › the app) and is in device backups. Slop Drive keeps a real file there for each of its files, at the path of
  its folders, and what is added, changed or deleted in Files comes back (`shared/native/files-sync.js`; the first sync
  writes everything Slop Drive already had). A download saves into the app's folder of the app it came from, with Save
  as… (the system's Save to Files sheet) and Share…. Other apps can hand the app a file (Open in…, the share sheet,
  Files, Mail) for every type in `desktop/lib/open-map.js` (the desktop app's table): it opens in the app the site uses for
  it, through `window.launchQueue` like an installed web app, and a file opened in place is saved back over itself.
- **iCloud Drive** (optional): with an iCloud container id (`ios.icloud` in `mobile/mobile.json`, or
  `node capacitor.mjs icloud iCloud.<id>` after `patch`; keep a brand's id with the brand), the app gets the entitlement
  and Settings › Files shows **Keep files in iCloud Drive**, which moves the folder there and back. The App ID needs the
  iCloud capability and the container (Xcode's automatic signing adds them with `-allowProvisioningUpdates`).
- **Pages**: the site is many pages; `SiteRouter.swift` serves `/pdf/` as `/pdf/index.html` (Capacitor's own router
  sends everything to the homepage).
- **Size**: about 250 MB installed, about 125 MB to download (onnxruntime-web and the bundled models are most of it).
- **Scope**: `mobile/mobile.json` `ios.apps` is `"all"` (the full suite). A list of app ids (`shared/apps.js`) makes a
  focused app (the other apps' folders are left out; check the kept apps do not load files from them), `ios.start` the
  page it opens (`"/pdf/"`), `ios.leaveOut` more path prefixes to leave out.
- The app needs iOS 16.4 or later (the site's support target, `tools/compat/features.mjs`).

Without secrets the run gives `app-simulator.zip` (an unsigned simulator build: unzip, then
`xcrun simctl install booted App.app`).

**What the owner does, in order:**

1. **Apple Developer Program**: developer.apple.com/programs, 99 USD a year. An organisation needs a D-U-N-S number.
2. **Bundle id**: Certificates, Identifiers & Profiles -> Identifiers -> App IDs: the app id above (explicit).
3. **App Store Connect**: My Apps -> New App with that bundle id, the name, the primary language and an SKU.
4. **API key**: App Store Connect -> Users and Access -> Integrations -> App Store Connect API -> Team Keys: a key with
   the **Admin** role (cloud signing makes the distribution certificate and profile itself). Download the `.p8` once.
5. **Repository secrets**: `APPLE_TEAM_ID` (Membership details), `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8_BASE64`
   (`base64 -i AuthKey_XXXX.p8`).
6. Run the workflow (ios): the artifact holds a signed `.ipa`. With **release** ticked the build is also uploaded to App
   Store Connect, and appears in TestFlight after processing (about 15 minutes; answer the export compliance question:
   the app uses only the system's encryption, `ITSAppUsesNonExemptEncryption` is false).
7. Fill in the listing (screenshots of 6.9" iPhone and 13" iPad), the privacy labels ("Data Not Collected"), and submit.

**Review notes** (paste into App Review Information -> Notes): "This is a complete office and creative suite that runs on
the device: PDF tools, documents, spreadsheets, slides, an image editor, a vector editor, video and audio tools and more.
Every app, engine and page ships inside the app and works offline (try airplane mode); nothing the user opens is
uploaded. Files are saved with the share sheet (Save to Files). Optional AI models are downloaded as data at first use;
no code is downloaded. No account is needed."

## Releasing

Run **Store apps** with **release** ticked: the signed files go into a draft GitHub Release (`apps-<run number>`), and
the iOS build to TestFlight. Publish the draft when the store versions are live. The Android `.aab` is uploaded to Play
by hand (Play Console -> a track -> Create new release), or later by a Play service account.

## Locally

```sh
cd mobile/android && npm ci && node generate.mjs        # then build/project: ./gradlew bundleRelease (JDK 17, Android SDK)
node mobile/ios/bundle.mjs                              # the app's copy of the site in mobile/ios/www
cd mobile/ios && npm ci && node capacitor.mjs config && npx cap add ios && node capacitor.mjs patch && npx cap open ios   # macOS
```

Tests: `tests/node/mobile-*.test.mjs`.
