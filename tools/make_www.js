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
['index.html', 'css', 'js'].forEach(copy);
// Release builds: VX_ADS=real VX_BANNER_ID=ca-app-pub-.../... VX_APP_ID=ca-app-pub-...~... npm run www
if (process.env.VX_ADS === 'real') {
  if (!process.env.VX_BANNER_ID || !process.env.VX_APP_ID) { console.error('VX_ADS=real needs VX_BANNER_ID and VX_APP_ID'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'js/ads_env.js'), `window.VX_ADS_MODE = 'real';\nwindow.VX_BANNER_ID = '${process.env.VX_BANNER_ID}';\nwindow.VX_APP_ID = '${process.env.VX_APP_ID}';\n`);
  console.log('www/ written with real ad ids');
}
console.log('www/ ready');
