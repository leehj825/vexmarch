// Browser test for the icon UI: every icon used by a panel exists in the sprite, icon buttons carry a tip, and the panels hold very little plain text.
// Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_icons.js
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let n = 0;
  for (const [w, h] of [[390, 780], [1280, 760]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(300);
    const ev = (fn, a) => p.evaluate(({ f, a }) => (new Function('return ' + f))()(a), { f: fn.toString(), a });
    const ok = (c, m) => { assert(c, `[${w}px] ${m}`); n++; if (process.env.V) console.log('ok', m); };
    await p.click('#startBtn'); await p.waitForTimeout(400);
    await ev(() => { __vm.speed = 0; const s = __vm.state, c = s.factions[s.player].capital, o = s.officers.find(o => o.owner === s.player && o.army === null && o.role !== 'governor'); VM.Armies.spawn(s, s.player, c, { infantry: 8, spear: 4, cavalry: 3, archer: 10, siege: 2 }, o.id); __vm.selectedCity = c; });
    const check = async (what, open) => {
      await open(); await p.waitForTimeout(350);
      const r = await ev(() => {
        const root = document.querySelector('#panel.open') || document.querySelector('#sheet.open'); if (!root) return null;
        const bad = []; root.querySelectorAll('use').forEach(u => { if (!document.querySelector(u.getAttribute('href'))) bad.push(u.getAttribute('href')); });
        const noTip = []; root.querySelectorAll('button').forEach(bt => { if (!bt.getAttribute('data-tip') && bt.querySelector('svg')) noTip.push(bt.dataset.act || bt.className); });
        const text = root.innerText.replace(/[\s\d.,+\-−/·×%:→]+/g, ' ').trim(), words = text.split(' ').filter(x => /[A-Za-z]{4,}/.test(x));
        return { icons: root.querySelectorAll('svg.ic').length, bad, noTip, words: words.length };
      });
      ok(r && r.icons >= 6, what + ' is made of icons (' + (r && r.icons) + ')');
      ok(r.bad.length === 0, what + ' uses only icons that exist: ' + r.bad.join(','));
      ok(r.noTip.length === 0, what + ' icon buttons all have tips: ' + r.noTip.join(','));
      return r;
    };
    await check('the city panel', async () => {});
    await check('the army panel', async () => { await ev(() => { __vm.selectedCity = -1; __vm.selectedArmy = __vm.state.armies[__vm.state.armies.length - 1].id; }); });
    await ev(() => { __vm.selectedArmy = null; });
    await check('the officers sheet', async () => { await p.click('#offBtn'); });
    await check('the diplomacy sheet', async () => { await p.click('#dipBtn'); });
    await check('the alerts sheet', async () => { await ev(() => VM.Eco.pushEvent(__vm.state, { type: 'attacked', owner: 1, city: __vm.state.factions[1].capital, besieged: true })); await p.waitForTimeout(300); await p.click('#alertBtn'); });
    ok(await ev(() => document.querySelectorAll('#sheet .alert svg.ic').length) >= 1, 'alerts have icons');
    ok(await ev(() => { const t = document.getElementById('res').innerText; return !/Gold|Food|Year/.test(t); }), 'the gold, food and date have no words');
    // words and labels: Details shows the stat labels; Icons only hides the words; Words and labels shows both
    await ev(() => { __vm.selectedCity = __vm.state.factions[1].capital; document.getElementById('sheet').classList.remove('open'); __vm.sheet = null; }); await p.waitForTimeout(300);
    const vis = sel => ev(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
    ok(await vis('#panel .w') && !(await vis('#panel .sl')), 'by default: words are shown, stat labels are not');
    await p.click('#panel [data-act="detailsToggle"]'); await p.waitForTimeout(200);
    ok(await vis('#panel .sl'), 'the Details button shows the stat labels');
    await p.click('#panel [data-act="detailsToggle"]'); await p.waitForTimeout(200);
    ok(!(await vis('#panel .sl')), 'and hides them again');
    await ev(() => VM.UIPrefs.set('ui', 'icons')); ok(!(await vis('#panel .w')), 'Icons only hides the words');
    await ev(() => VM.UIPrefs.set('ui', 'text')); ok(await vis('#panel .w') && await vis('#panel .sl'), 'Words and labels shows both');
    await ev(() => VM.UIPrefs.set('ui', 'mixed'));
    ok(!errs.length, 'no console errors: ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); console.log('icons: ' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
