// Browser test for the 3D strategy map: the ground is drawn, the buttons turn and tilt it, dragging pans, the wheel zooms, taps still pick nodes, and the flat map
// is still there as a setting. Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_map3d.js
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
    await p.click('#startBtn'); await p.waitForTimeout(500);
    await ev(() => { __vm.speed = 0; __vm.state.aiOn = false; });
    ok(await ev(() => VM.MapView.is3d() && document.body.classList.contains('map3d')), 'the map is in 3D');
    const cap = await ev(() => __vm.state.factions[__vm.state.player].capital), other = await ev(c => __vm.state.map.nodes[c].adj[0], cap);
    const at = id => ev(id => VM.MapView.screenOf(id), id), cam = () => ev(() => Object.assign({}, VM.MapTerrain.cam));
    const p0 = await at(other), c0 = await cam();
    ok(p0.x > 0 && p0.x < w && p0.y > 0 && p0.y < h, 'a neighbouring node is on screen: ' + JSON.stringify(p0));
    // the buttons
    await p.click('[data-mc="right"]'); const c1 = await cam(), p1 = await at(other); ok(c1.yaw < c0.yaw && (Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)) > 3, 'turning moves the picture');
    await p.click('[data-mc="up"]'); const c2 = await cam(); ok(c2.pitch > c1.pitch, 'tilting changes the angle');
    for (let i = 0; i < 12; i++) await p.click('[data-mc="down"]'); ok((await cam()).pitch >= 0.18 - 1e-9, 'the tilt stops at the horizon');
    await p.click('[data-mc="north"]'); const c3 = await cam(); ok(c3.yaw === 0 && Math.abs(c3.pitch - 0.95) < 1e-9, 'north up again');
    // wheel zoom (desktop) and dragging
    if (!touch) {
      const d0 = (await cam()).dist; await p.mouse.move(w / 2, h / 2); await p.mouse.wheel(0, -400); await p.waitForTimeout(100); ok((await cam()).dist < d0, 'the wheel zooms in');
      const t0 = await cam(); await p.mouse.move(w / 2, h / 2); await p.mouse.down(); await p.mouse.move(w / 2 + 120, h / 2 + 40, { steps: 6 }); await p.mouse.up();
      const t1 = await cam(); ok(Math.hypot(t1.tx - t0.tx, t1.tz - t0.tz) > 10, 'dragging pans the ground');
      const y0 = (await cam()).yaw; await p.mouse.move(w / 2, h / 2); await p.mouse.down({ button: 'right' }); await p.mouse.move(w / 2 + 150, h / 2, { steps: 6 }); await p.mouse.up({ button: 'right' });
      ok((await cam()).yaw !== y0, 'the right button turns the map');
    }
    // tapping a node still selects it
    await p.click('[data-mc="north"]'); await ev(c => VM.MapView.centerOn(c), cap); await p.waitForTimeout(200);
    const q = await at(cap); await p.mouse.click(q.x, q.y); await p.waitForTimeout(250);
    ok(await ev(() => __vm.selectedCity) === cap, 'tapping the capital selects it in 3D');
    // the ground is real: it has mountains and water, and every node stands on dry land
    const land = await ev(() => { const s = __vm.state; let hi = -1e9, lo = 1e9; for (let x = 0; x < s.map.w; x += 25) for (let y = 0; y < s.map.h; y += 25) { const h = VM.MapTerrain.heightAt(x, y); hi = Math.max(hi, h); lo = Math.min(lo, h); } return { hi, lo, dry: s.map.nodes.every(nd => VM.MapTerrain.heightAt(nd.x, nd.y) > 2) }; });
    ok(land.hi > 25 && land.lo < 0 && land.dry, 'mountains, water, and dry nodes: ' + JSON.stringify(land));
    ok(errs.length === 0, 'no console errors: ' + errs.join(' | '));
    await ctx.close();
  }
  // the flat map is still there
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('vexmarch.prefs', JSON.stringify({ map3d: 'off' })); } catch (e) { /* none */ } });
  await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(300); await p.click('#startBtn'); await p.waitForTimeout(500);
  const ev2 = fn => p.evaluate(fn); assert(!(await ev2(() => VM.MapView.is3d())), 'flat map when chosen'); n++;
  const cap = await ev2(() => __vm.state.factions[__vm.state.player].capital), q = await p.evaluate(c => VM.MapView.screenOf(c), cap); await p.mouse.click(q.x, q.y); await p.waitForTimeout(250);
  assert.strictEqual(await ev2(() => __vm.selectedCity), cap); n++; assert(errs.length === 0, errs.join('|')); n++;
  console.log(`3D map test: ${n} checks passed`);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
