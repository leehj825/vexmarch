// Browser test for the AdMob banner code with a fake native plugin: going to the title screen and back must not hang the page (an observer that edited the class
// it was watching once froze the app there). Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_ads.js
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, Plugins: { AdMob: { initialize: async () => {}, requestConsentInfo: async () => ({}), hideBanner: async () => {}, addListener: (n, f) => { if (n === 'bannerAdLoaded') window.__loaded = f; }, showBanner: async () => { setTimeout(() => window.__loaded && window.__loaded(), 10); } } } }; });
  await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(400); await p.click('#startBtn');
  for (let i = 0; i < 30 && !(await p.evaluate(() => document.body.classList.contains('adLive'))); i++) await p.waitForTimeout(500);
  assert(await p.evaluate(() => document.body.classList.contains('adLive')), 'the banner went live');
  const alive = () => Promise.race([p.evaluate(() => document.body.className), new Promise(r => setTimeout(() => r(null), 5000))]);
  await p.click('#menuBtn'); await p.click('[data-pm="exit"]');
  const cls = await alive(); assert(cls !== null, 'the page froze on the way to the title'); assert(/titlemode/.test(cls) && !/adLive/.test(cls), 'title screen without the banner: ' + cls);
  await p.click('#contBtn'); await p.waitForTimeout(800); const back = await alive(); assert(back !== null && !/titlemode/.test(back), 'back in the game');
  console.log('ads test: 4 checks passed'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
