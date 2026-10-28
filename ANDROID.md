# Vexmarch for Android (debug APK)

The game is wrapped with [Capacitor](https://capacitorjs.com/) (`com.vexmarch.game`) so the same web code runs as an app. Everything it needs is bundled, so it works offline. The Android project (`android/`) is generated, not committed: `npx cap add android`, then `tools/android_patch.js`.

## Easiest way: let GitHub build the APK
1. Push the repository to GitHub.
2. Open **Actions -> "Android debug APK" -> Run workflow**. (It also runs on every push to any branch that changes the game, and on tags such as `v1.0.0`; each branch gets its own artifact, `vexmarch-debug-apk-<branch>`, and a new push to the same branch cancels the older run.) The workflow first runs `npm test`.
3. When the run is green, download the `vexmarch-debug-apk-<branch>` artifact and unzip it to get the `.apk`.
4. Copy the APK to your phone, open it and allow "Install unknown apps" for the app you opened it from (or `adb install file.apk`).

A *debug* APK is signed with a debug key: fine for your phone and testers, not for the Play Store. It shows Google's **test** banner.

## Build on your own computer
Requirements: Node 20+, JDK 17, Android SDK (Android Studio installs it).
```
npm install
npm run android:debug        # copies the game into the app and runs Gradle
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
`npm run android:sync` only copies the web files into the Android project (use it before opening `android/` in Android Studio). `npm run icons` redraws the icons and splash screens (needs Pillow).

## Ads
The game shows a standard 320x50 AdMob banner at the top centre of the screen, through the `@capacitor-community/admob` plugin (it wraps the Google Mobile Ads SDK: the app id goes in the manifest, the banner is requested in `js/ads.js` with ad type *banner*, size *BANNER*, position *top centre*). While a banner is on screen the game moves its top bar, sheets and lessons down by the banner's height (`body.adLive` in `css/style.css`), so nothing is covered. It is hidden on the title screen, and the Google consent form (UMP) is shown first where the law asks for it.

Vexmarch's own ids are in `tools/ads_ids.js` (app `ca-app-pub-4400173019354346~6657386533`, banner unit `ca-app-pub-4400173019354346/4031223197`). They are used only by *real* builds:
```
VX_ADS=real npm run www
VX_ADS=real node tools/android_patch.js     # puts the app id into AndroidManifest.xml
```
or, on GitHub, **Actions -> Android debug APK -> Run workflow -> ads: real**. Everything else (every push, and the default of the manual run) builds with Google's **test** banner. Never click your own real ads: that is invalid traffic and can get the AdMob account banned. Before a Play Store release also check Google's AdMob policies (no ads over buttons, no accidental clicks: the layout above keeps the banner clear of the controls) and add an app-ads.txt on your developer website if you have one.

## What was customised
- Full-screen immersive window, screen kept on while playing (`MainActivity.java`).
- Launcher icon and splash screen drawn by `tools/make_icons.py`.
- The AdMob app id in the manifest and the network-state permission the ads need.

## Not covered here
## Release builds (merge to main)

`.github/workflows/android-release.yml` runs on every merge to `main` (or by hand: Actions -> "Android release" -> Run workflow). It builds the signed app bundle (`.aab`, for Play Console) and the signed release APK, with Vexmarch's real AdMob ids, and uploads both as the artifact `vexmarch-release-<run>-<commit>`. The version code is the run number, so each upload is higher than the last.

It needs four repository secrets (Settings -> Secrets and variables -> Actions): `ANDROID_KEYSTORE_BASE64` (the upload keystore, `base64 -w0 your.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Keep the keystore and its passwords safe: losing the upload key means Play cannot take updates from that app under the same listing without a key reset. If a secret is missing, the run stops with a message naming it.

Play Store publishing needs a release signing key, an app bundle (`./gradlew bundleRelease`), a developer account, a privacy policy and store assets (the feature graphic is in `icons/`). **The APK has not been built or run yet**: the Android SDK was not available where the project was written, so the first workflow run is the real test. If it fails, the log will say why.
