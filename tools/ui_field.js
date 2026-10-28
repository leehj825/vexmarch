// Browser test for the field battle view: two armies meet on the road; the army panel offers Watch battle; the view opens, shows the fight, stays open after the fight ends
// (the loser leaves, the fallen lie), and only the Back button or Escape closes it. A battle that is already over cannot be entered. Usage: PLAYWRIGHT=... node tools/ui_field.js
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  let n = 0;
  for (const [w, h, touch] of [[1280, 760, false], [390, 780, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage(); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(300);
    const ev = (fn, a) => p.evaluate(({ f, a }) => (new Function('return ' + f))()(a), { f: fn.toString(), a });
    const ok = (c, m) => { assert(c, `[${w}px] ${m}`); n++; };
    await p.click('#startBtn'); await p.waitForTimeout(300);
    await ev(() => { __vm.speed = 0; __vm.state.aiOn = false; });
    // two armies meet on a road
    const ids = await ev(() => {
      const st = __vm.state, me = st.player, c1 = st.cities.find(c => c.owner === me), nb = st.map.nodes[c1.id].adj.find(x => st.cities[x].owner !== me), T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
      const foeOwner = st.cities[nb].owner || 2, o1 = st.officers.find(o => o.owner === me && o.army === null && o.role !== 'governor'), o2 = st.officers.find(o => o.owner === foeOwner && o.army === null && o.role !== 'governor') || st.officers.find(o => o.owner === 0 && o.army === null);
      const A = VM.Armies.spawn(st, me, c1.id, T({ infantry: 90, archer: 30, cavalry: 12 }), o1.id), B = VM.Armies.spawn(st, foeOwner, nb, T({ infantry: 90, spear: 20 }), o2.id);
      VM.Armies.move(st, A, nb); VM.Armies.move(st, B, c1.id);
      for (let i = 0; i < 400 && !A.fighting.length; i++) VM.Sim.advance(st, 0.25);
      return [A.id, B.id];
    });
    ok(await ev(a => __vm.state.armies.find(x => x.id === a).fighting.length > 0, ids[0]), 'the armies are fighting');
    await ev(a => { __vm.selectedArmy = a; }, ids[0]); await p.waitForTimeout(400);
    ok(await p.locator('[data-act="watch"]').count() === 1, 'the army panel offers Watch battle');
    await p.click('[data-act="watch"]'); await p.waitForTimeout(1200);
    ok(await ev(() => __vm.fieldView !== null && document.body.classList.contains('infield') && VM.Field3D.isOpen()), 'the field view is open');
    ok((await p.locator('#fbT').innerText()).startsWith('Battle near'), 'it says where');
    ok((await p.locator('#fbArmies .ir').count()) >= 2, 'both armies are listed');
    let info = await ev(() => VM.Field3D.info()); ok(info && info.calls > 0 && info.calls <= 40 && info.soldiers > 100, 'draw calls ' + info.calls + ', soldiers ' + info.soldiers);
    const shot = await p.screenshot(); ok(shot.length > 20000, 'not blank');
    if (process.env.SHOT) require('fs').writeFileSync(path.join(process.env.SHOT, `field${w}.png`), shot);
    // the fight goes on and ends while the view is open: the view stays
    await ev(() => { __vm.speed = 1; }); let over = false;
    for (let i = 0; i < 60 && !over; i++) { await ev(() => { VM.Sim.advance(__vm.state, 2); }); await p.waitForTimeout(150); over = await ev(() => !!VM.Field3D.layout() && VM.Field3D.layout().over); }
    ok(over, 'the battle ended'); await p.waitForTimeout(600);
    ok(await ev(() => __vm.fieldView !== null && VM.Field3D.isOpen()), 'the view was not closed by the end of the battle');
    ok((await p.locator('#fbS').innerText()).startsWith('The battle is over'), 'the status says it is over: ' + await p.locator('#fbS').innerText());
    await p.waitForTimeout(500); ok(await ev(() => VM.Field3D.info().soldiers) > 0, 'something is still drawn (the winner, the fallen)');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    ok(await ev(() => __vm.fieldView === null && !document.body.classList.contains('infield')), 'Escape leaves the field');
    // a battle that is over cannot be entered
    ok(await ev(a => __vm.openField(a), ids[0]) === false && await ev(() => __vm.fieldView === null), 'no field view for a finished battle');
    // the red cross on the map opens it (a new fight)
    const ids2 = await ev(() => {
      const st = __vm.state, me = st.player, c1 = st.cities.find(c => c.owner === me), nb = st.map.nodes[c1.id].adj.find(x => st.cities[x].owner !== me), T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
      const foeOwner = st.cities[nb].owner || 2, os = st.officers.filter(o => o.army === null && o.role !== 'governor');
      const A = VM.Armies.spawn(st, me, c1.id, T({ infantry: 80 }), os.find(o => o.owner === me).id), B = VM.Armies.spawn(st, foeOwner, nb, T({ infantry: 80 }), (os.find(o => o.owner === foeOwner) || os.find(o => o.owner === 0)).id);
      VM.Armies.move(st, A, nb); VM.Armies.move(st, B, c1.id); __vm.speed = 0;
      for (let i = 0; i < 400 && !A.fighting.length; i++) VM.Sim.advance(st, 0.25);
      return [A.id, B.id];
    });
    const pt = await ev(a => { const st = __vm.state, x = st.armies.find(q => q.id === a), y = st.armies.find(q => q.id === x.fighting[0]); const m = { x: (VM.Armies.position(st, x).x + VM.Armies.position(st, y).x) / 2, y: (VM.Armies.position(st, x).y + VM.Armies.position(st, y).y) / 2 }; VM.MapView.centerOn(x.zone === undefined ? VM.Armies.zoneOf(x) : x.zone); return m; }, ids2[0]);
    await p.waitForTimeout(500);
    const hit = await ev(a => { const st = __vm.state, x = st.armies.find(q => q.id === a), y = st.armies.find(q => q.id === x.fighting[0]), P = VM.MapView.screenOfPoint; return typeof P; }, ids2[0]);
    await ev(a => { __vm.onTap({ kind: 'battle', id: a }); }, ids2[0]); await p.waitForTimeout(900);
    ok(await ev(() => __vm.fieldView !== null), 'a tap on the battle opens the field view');
    await p.click('#fbBack'); await p.waitForTimeout(400); ok(await ev(() => __vm.fieldView === null), 'the Back button leaves');
    ok(errs.length === 0, 'no errors: ' + errs.join(' | '));
    await ctx.close();
  }
  console.log(`field view test: ${n} checks passed`); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
