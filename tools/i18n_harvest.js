// Lists the English texts the game can show, for js/lang_ko.js. Usage: node tools/i18n_harvest.js [--missing]
// It reads string literals and template strings from the UI and rules code, plus the page's own text, keeps the ones that look like text for
// people, and turns ${...} into {0}, {1}... (numbers) - names are written as {a}, {b}, {c} by hand. --missing lists only texts the Korean table lacks.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const files = ['js/ui/panels.js', 'js/ui/sheets.js', 'js/ui/alerts.js', 'js/ui/title.js', 'js/ui/tutorial.js', 'js/ui/map.js', 'js/main.js', 'js/sim/commands.js', 'js/sim/armies.js', 'js/sim/war.js', 'js/sim/officers.js', 'js/data/config.js'];
const out = new Set();
function add(t) {
  t = t.replace(/\$\{[^}]*\}/g, '\u0001').trim();
  if (!/[A-Za-z]{3}/.test(t) || /^[a-z][A-Za-z0-9_.\[\]]*$/.test(t) || /^[#.\[]|[{};=]|=>|\bfunction\b|rgba?\(|px\b|^https?:|\.js$|\.png$/.test(t.replace(/\u0001/g, ''))) return;
  if (/^[a-z]+(-[a-z]+)*$/.test(t)) return;
  let i = 0; out.add(t.replace(/\u0001/g, () => '{' + (i++) + '}'));
}
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const t = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
    if (m[3] !== undefined) {                                   // an HTML template: take the text between tags
      for (const piece of t.split(/<[^>]*>/)) add(piece);
    } else add(t);
  }
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
for (const piece of html.split(/<[^>]*>/)) add(piece);
for (const m of html.matchAll(/title="([^"]+)"/g)) add(m[1]);
let list = [...out].sort();
if (process.argv.includes('--missing')) {
  global.window = {}; const T = new Function(fs.readFileSync(path.join(root, 'js/lang_ko.js'), 'utf8') + '; return LANG_KO;')();
  list = list.filter(k => T[k] === undefined);
}
console.log(list.join('\n')); console.error(list.length + ' texts');
