// Copies the web app into www/ for Capacitor (npm run www).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
function copy(rel) {
  const from = path.join(root, rel), to = path.join(out, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.statSync(from).isDirectory()) fs.readdirSync(from).forEach(f => copy(path.join(rel, f)));
  else fs.copyFileSync(from, to);
}
['index.html', 'css', 'js', 'vendor'].forEach(copy);
// Release builds: VX_ADS=real npm run www  (the ids are in tools/ads_ids.js; VX_BANNER_ID and VX_APP_ID override them)
if (process.env.VX_ADS === 'real') {
  const ids = require('./ads_ids'), banner = process.env.VX_BANNER_ID || ids.bannerId, app = process.env.VX_APP_ID || ids.appId;
  fs.writeFileSync(path.join(out, 'js/ads_env.js'), `window.VX_ADS_MODE = 'real';\nwindow.VX_BANNER_ID = '${banner}';\nwindow.VX_APP_ID = '${app}';\n`);
  console.log('www/ written with the real ad ids');
}
console.log('www/ ready');
