// Vexmarch - ad settings. Debug builds always show Google's TEST banner. For a release build set VX_ADS_MODE to 'real' and fill in
// the AdMob ids (they are in tools/ads_ids.js; `VX_ADS=real npm run www` writes this file for you): the app id also goes into android/app/src/main/AndroidManifest.xml (tools/android_patch.js).
// Never click your own real ads.
window.VX_ADS_MODE = 'test';
window.VX_BANNER_ID = '';          // e.g. 'ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN'
window.VX_APP_ID = '';             // e.g. 'ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN'
