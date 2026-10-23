// Browser test for the Diplomacy sheet: opens, lists the houses, gifts work, a pact can be broken (with a confirmation), offers can be answered, and a merge
// offer accepted ends the game. Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_diplo.js   (V=1 prints each check)
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let n = 0;
  for (const [w, h] of [[1280, 760], [390, 780]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(300);
    const ev = (fn, a) => p.evaluate(({ f, a }) => (new Function('return ' + f))()(a), { f: fn.toString(), a });
    const ok = (c, m) => { assert(c, `[${w}px] ${m}`); n++; if (process.env.V) console.log('ok', m); };
    await p.click('#startBtn'); await p.waitForTimeout(400);
    await ev(() => { __vm.speed = 0; __vm.state.aiOn = false; });
    ok(await ev(() => { const r = document.getElementById('dipBtn').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth; }), 'the Diplomacy button is on screen');
    await p.click('#dipBtn'); await p.waitForTimeout(200);
    ok(await ev(() => document.getElementById('sheet').classList.contains('open') && /Diplomacy/.test(document.getElementById('sheet').textContent)), 'the sheet opens');
    const houses = await ev(() => __vm.state.factions.filter(f => !f.neutral && f.id !== __vm.state.player && f.alive).length);
    ok(await ev(() => document.querySelectorAll('#sheet .card2').length) === houses, 'one card per other house');
    await p.click('[data-act="dGift"]'); await p.waitForTimeout(200);
    ok(await ev(() => Object.values(__vm.state.diplo.opinion).some(o => o[1] > 0)), 'a gift raises opinion');
    // an alliance the AI wants: a common threat and goodwill
    await ev(() => { const s = __vm.state; for (const c of s.cities) if (c.owner === 3) c.pop *= 5; VM.Diplo.addOp(s, 2, 1, 50); VM.Diplo.ensure(s).cool = {}; });
    await p.waitForTimeout(150);
    await p.click('[data-act="dAlly"][data-f="2"]'); await p.waitForTimeout(250);
    ok(await ev(() => VM.Diplo.allyOf(__vm.state, 1) === 2), 'the AI accepts an alliance it wants');
    ok(await ev(() => /Ally/.test(document.getElementById('sheet').textContent) && !!document.querySelector('[data-act="dBreak"]')), 'the ally shows a break button');
    await p.click('[data-act="dBreak"]'); await p.waitForTimeout(150);
    ok(await ev(() => !!document.querySelector('[data-act="dBreakYes"]')), 'breaking asks to confirm');
    await p.click('[data-act="dBreakNo"]'); await p.waitForTimeout(150);
    ok(await ev(() => VM.Diplo.allyOf(__vm.state, 1) === 2), 'saying no keeps the pact');
    await p.click('[data-act="dBreak"]'); await p.waitForTimeout(100); await p.click('[data-act="dBreakYes"]'); await p.waitForTimeout(200);
    ok(await ev(() => VM.Diplo.allyOf(__vm.state, 1) === 0 && VM.Diplo.trust(__vm.state, 1) < 0), 'the pact is broken and trust falls');
    // a merge offer to me
    await ev(() => { const s = __vm.state; for (const c of s.cities) if (c.owner === 1) { c.pop = 20; for (const k in c.garrison) c.garrison[k] = 0; } VM.Diplo.ensure(s).cool = {}; VM.Diplo.proposeMerge(s, 4, 1); });
    await p.waitForTimeout(300);
    ok(await ev(() => /Bend the knee/.test(document.getElementById('sheet').textContent) && /Diplomacy 1/.test(document.getElementById('dipBtn').textContent)), 'the offer shows and the button counts it');
    await p.click('[data-act="dAnswer"][data-yes="0"]'); await p.waitForTimeout(200);
    ok(await ev(() => !__vm.state.over && __vm.state.diplo.offers.length === 0), 'declining fights on');
    await ev(() => { VM.Diplo.ensure(__vm.state).cool = {}; VM.Diplo.proposeMerge(__vm.state, 4, 1); }); await p.waitForTimeout(300);
    await p.click('[data-act="dAnswer"][data-yes="1"]'); await p.waitForTimeout(600);
    ok(await ev(() => __vm.state.over && __vm.state.over.type === 'merged' && document.getElementById('over').classList.contains('on') && /Absorbed/.test(document.getElementById('overT').textContent)), 'accepting ends the game with a merged ending');
    ok(!errs.length, 'no console errors: ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); console.log('diplo ui: ' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
