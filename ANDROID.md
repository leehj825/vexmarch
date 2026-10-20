# Vexmarch for Android (debug APK)

The game is wrapped with [Capacitor](https://capacitorjs.com/) (`com.vexmarch.game`) so the same web code runs as an app. Everything it needs is bundled, so it works offline. The Android project (`android/`) is generated, not committed: `npx cap add android`, then `tools/android_patch.js`.

## Easiest way: let GitHub build the APK
1. Push the repository to GitHub.
2. Open **Actions -> "Android debug APK" -> Run workflow**. (It also runs on pushes to `main` that change the game, and on tags such as `v1.0.0`.) The workflow first runs `npm test`.
3. When the run is green, download the **vexmarch-debug-apk** artifact and unzip it to get the `.apk`.
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
`js/ads_env.js` holds the ad settings. By default the app shows Google's sample banner (safe for development). For a release build, create the app and a banner unit in AdMob, then:
```
VX_ADS=real VX_BANNER_ID=ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN VX_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN npm run www
VX_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN node tools/android_patch.js
```
Never click your own real ads. The ids in your other games belong to those apps; do not reuse them here.

## What was customised
- Full-screen immersive window, screen kept on while playing (`MainActivity.java`).
- Launcher icon and splash screen drawn by `tools/make_icons.py`.
- The AdMob app id in the manifest and the network-state permission the ads need.

## Not covered here
Play Store publishing needs a release signing key, an app bundle (`./gradlew bundleRelease`), a developer account, a privacy policy and store assets (the feature graphic is in `icons/`). **The APK has not been built or run yet**: the Android SDK was not available where the project was written, so the first workflow run is the real test. If it fails, the log will say why.
