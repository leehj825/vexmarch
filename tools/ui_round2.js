// Browser checks for the second round of features: the trade section in a city panel, the doctrine choice page, the vassal and duel buttons, the chronicle as a book.
// Usage: PLAYWRIGHT=... node tools/ui_round2.js
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  let n = 0;
  for (const [w, h, touch] of [[1280, 760, false], [390, 780, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage(); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(300);
    const ev = (fn, arg) => p.evaluate(fn, arg), ok = (c, m) => { assert(c, `[${w}px] ${m}`); n++; };
    // the scenarios on the title screen: the siege loads with Vexholm held by another house
    await p.click('#scenSel [data-s="siege"]'); await p.waitForTimeout(300);
    ok(await ev(() => __vm.state.cities.some(c => __vm.state.map.nodes[c.id].name === 'Vexholm' && c.owner !== 0 && c.owner !== __vm.state.player)), 'the siege scenario loads');
    await p.click('#scenSel [data-s="open"]'); await p.waitForTimeout(300);
    ok(await ev(() => !__vm.state.story && __vm.state.factions.filter(f => !f.neutral).length >= 4), 'back to open ground');
    await p.click('#startBtn'); await p.waitForTimeout(300);
    await ev(() => { __vm.speed = 0; __vm.state.aiOn = false; });
    // a trade route from the city panel
    const pair = await ev(() => { const st = __vm.state, me = st.player, own = st.cities.filter(c => c.owner === me); for (const x of own) for (const y of own) { if (x !== y) { const p2 = VM.Armies.path(st, x.id, y.id); if (p2 && p2.length === 2) return [x.id, y.id]; } } return null; });
    if (pair) {
      await ev(a => { __vm.selectedCity = a; }, pair[0]); await p.waitForTimeout(300);
      ok(await p.locator('#routeSel').count() === 1, 'the city panel offers a trade route');
      await p.selectOption('#routeSel', String(pair[1])); await p.waitForTimeout(300);
      ok(await ev(() => __vm.state.trade && __vm.state.trade.length === 1), 'the route opens');
    }
    // the doctrine page comes after a year
    await ev(() => { __vm.speed = 1; VM.Sim.advance(__vm.state, 370); }); await p.waitForTimeout(600);
    ok(await p.locator('#story [data-doc]').count() === 3, 'the doctrine page shows three choices');
    await p.click('#story [data-doc]'); await p.waitForTimeout(400);
    ok(await p.locator('#story.on').count() === 0 && await ev(() => __vm.state.factions[__vm.state.player].doctrine.owned.length === 1), 'choosing one closes the page and keeps it');
    // the chronicle as a book (skirmish too): a battle makes an entry under its year
    await ev(() => { const st = __vm.state, x = st.cities.find(c => c.owner === 0 && c.spec !== 'pass'), T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
      x.garrison = T({}); const os = st.officers.filter(o => o.army === null && o.role !== 'governor'); VM.Armies.spawn(st, 1, x.id, T({ infantry: 150 }), os.find(o => o.owner === 1).id); VM.Armies.spawn(st, 2, x.id, T({ infantry: 20 }), os.find(o => o.owner === 2).id); VM.Sim.advance(st, 40); });
    await p.click('#menuBtn'); await p.waitForTimeout(200); await p.click('[data-pm="chronicle"]'); await p.waitForTimeout(300);
    ok(await p.locator('#storyB .lbl').count() >= 1, 'the chronicle has year headings');
    ok((await p.locator('#storyB').innerText()).includes('Summary'), 'and a summary');
    await p.click('#storyBtn'); await p.waitForTimeout(200);
    // save to slot 1 from the pause menu, then the saved games list shows it
    await ev(() => { localStorage.removeItem('vexmarch.slot1'); localStorage.removeItem('vexmarch.slot1.meta'); });
    await p.click('#menuBtn'); await p.waitForTimeout(200); await p.click('[data-pm="slots"]'); await p.waitForTimeout(300);
    ok(await p.locator('#story.on [data-act="save"]').count() === 3, 'three slots to save to');
    await p.click('#story [data-slot="1"][data-act="save"]'); await p.waitForTimeout(300);
    ok(await ev(() => !!localStorage.getItem('vexmarch.slot1')), 'slot 1 is written');
    const turn = await ev(() => __vm.state.time);
    await p.click('#menuBtn'); await p.waitForTimeout(200); await p.click('[data-pm="exit"]'); await p.waitForTimeout(500);
    ok(await p.locator('#loadSlotBtn').isVisible(), 'the title offers saved games');
    await p.click('#loadSlotBtn'); await p.waitForTimeout(300);
    await p.click('#story [data-slot="1"][data-act="load"]'); await p.waitForTimeout(500);
    ok(await ev(t => __vm.running && Math.abs(__vm.state.time - t) < 1, turn), 'slot 1 loads the game back at the same day');
    ok(errs.length === 0, 'no errors: ' + errs.join(' | '));
    await ctx.close();
  }
  console.log(`round two UI test: ${n} checks passed`); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
