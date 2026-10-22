// Browser test for walk mode: Walk button in a city, the avatar moves with the keys, collisions and walls hold, officers can be talked to, Esc leaves and
// the clock only runs while not walking. Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_walk.js
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let n = 0;
  for (const [w, h] of [[1280, 760], [390, 780]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(300);
    const ev = (fn, a) => p.evaluate(({ f, a }) => (new Function('return ' + f))()(a), { f: fn.toString(), a });
    const ok = (c, m) => { assert(c, `[${w}px] ${m}`); n++; };
    await p.click('#startBtn'); await p.waitForTimeout(400);
    await ev(() => { __vm.state.aiOn = false; });
    const cap = await ev(() => __vm.state.factions[__vm.state.player].capital);
    await ev(c => { __vm.selectedCity = c; __vm.openCity(c); }, cap); await p.waitForTimeout(500);
    ok(await p.$('[data-act="walk"]') !== null, 'there is a Walk button in my city');
    await p.click('[data-act="walk"]'); await p.waitForTimeout(400);
    ok(await ev(() => VM.Walk.isOn() && __vm.walking && document.body.classList.contains('walk')), 'walk mode is on');
    const t0 = await ev(() => __vm.state.time); await p.waitForTimeout(800);
    ok(await ev(t => __vm.state.time === t, t0), 'the clock is paused while walking');
    const a = await ev(() => Object.assign({}, VM.Walk.state().pos));
    await p.keyboard.down('w'); await p.waitForTimeout(700); await p.keyboard.up('w');
    const a2 = await ev(() => Object.assign({}, VM.Walk.state().pos));
    ok(Math.hypot(a2.x - a.x, a2.z - a.z) > 1.5, 'W walks forward');
    await p.keyboard.down('Shift'); await p.keyboard.down('a'); await p.waitForTimeout(3000); await p.keyboard.up('a'); await p.keyboard.up('Shift');
    const R = await ev(() => VM.Walk.state().L.radius), a3 = await ev(() => Object.assign({}, VM.Walk.state().pos));
    ok(Math.hypot(a3.x, a3.z) <= R - 1.3 + 1e-6, 'the avatar stays inside the walls');
    // officers
    const nof = await ev(() => VM.Walk.state().npcs.length);
    if (nof) {
      await ev(() => { const S = VM.Walk.state(), n = S.npcs[0]; S.pos.x = n.x + 2; S.pos.z = n.z; });
      await p.waitForTimeout(300);
      ok(await ev(() => VM.Walk.state().near && VM.Walk.state().near.kind === 'officer'), 'an officer is within talking range');
      await p.keyboard.press('f'); await p.waitForTimeout(200);
      ok(await ev(() => document.getElementById('talk').classList.contains('on')), 'F opens the talk dialog');
      await p.keyboard.press('Escape'); await p.waitForTimeout(100);
      ok(await ev(() => !document.getElementById('talk').classList.contains('on') && VM.Walk.isOn()), 'Esc closes the dialog first');
    }
    await ev(() => { const S = VM.Walk.state(); S.pos.x = 0; S.pos.z = 0; });          // inside the keep: pushed out
    await p.waitForTimeout(200); await p.keyboard.down('w'); await p.waitForTimeout(100); await p.keyboard.up('w');
    ok(await ev(() => { const S = VM.Walk.state(); return Math.hypot(S.pos.x, S.pos.z) > 6; }), 'the keep is solid');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(await ev(() => !VM.Walk.isOn() && !__vm.walking && !document.body.classList.contains('walk')), 'Esc stops walking');
    await p.screenshot({ path: require('os').tmpdir() + `/walk-${w}.png` });
    ok(!errs.length, 'no console errors: ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); console.log('walk: ' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
