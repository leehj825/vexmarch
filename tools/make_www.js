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
console.log('www/ ready');
