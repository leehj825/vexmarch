// Vexmarch - AdMob banner (Android app only). A standard 320x50 banner at the top centre, so it covers only a strip in the middle of the top edge.
// While it is live the page gets the class adLive, and the HUD moves down by the banner's height. Hidden on the title screen.
(function () {
  const C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const AdMob = C.Plugins && C.Plugins.AdMob; if (!AdMob) return;
  const real = window.VX_ADS_MODE === 'real' && !!window.VX_BANNER_ID;
  const BANNER_ID = real ? window.VX_BANNER_ID : 'ca-app-pub-3940256099942544/6300978111';      // the second is Google's sample banner
  let shown = false;
  async function show() { if (shown) return; shown = true; try { await AdMob.showBanner({ adId: BANNER_ID, adSize: 'BANNER', position: 'TOP_CENTER', margin: 0, isTesting: !real }); } catch (e) { shown = false; } }
  async function hide() { if (!shown) return; shown = false; try { await AdMob.hideBanner(); } catch (e) { /* ignore */ } }
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  async function start() {
    try {
      await within(AdMob.initialize({ initializeForTesting: !real }), 8000);
      try { const info = await within(AdMob.requestConsentInfo(), 5000); if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') await AdMob.showConsentForm(); } catch (e) { /* consent is optional outside the EEA */ }
      AdMob.addListener('bannerAdLoaded', () => { if (!document.body.classList.contains('adLive')) document.body.classList.add('adLive'); });
      AdMob.addListener('bannerAdFailedToLoad', () => { if (document.body.classList.contains('adLive')) document.body.classList.remove('adLive'); });
      // Only touch the class when it really changes: even a no-op classList edit raises another mutation, and an observer that edits what it observes loops forever and freezes the app
      const sync = () => { const cl = document.body.classList; if (cl.contains('titlemode')) { hide(); if (cl.contains('adLive')) cl.remove('adLive'); } else show(); };
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] }); sync();
    } catch (e) { /* ads are never allowed to break the game */ }
  }
  // The Mobile Ads SDK starts on the UI thread and can freeze the app for a moment, so it only starts once the game is running.
  let waited = 0;
  (function ready() {
    const title = document.body.classList.contains('titlemode');
    if (title || waited < 4000) { waited = title ? 0 : waited + 500; return setTimeout(ready, 500); }
    start();
  })();
})();
