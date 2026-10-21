// Browser test for the 3D city view. Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_3d.js
// Opens cities (by the panel button and by double tap), checks the scene against the draw-call and triangle budget in the worst cases,
// watches the scene follow the game (a building finishing, a siege starting), and checks the way back to the map.
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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
    const cap = await ev(() => __vm.state.factions[__vm.state.player].capital);

    // Into the city from the panel button, and back out
    await ev(c => { __vm.selectedCity = c; __vm.speed = 4; }, cap); await p.waitForTimeout(300);
    await p.click('[data-act="view3d"]'); await p.waitForTimeout(900);
    ok(await ev(() => __vm.cityView) === cap, 'the view button opens the city'); ok(await ev(() => __vm.speed) === 1, 'entering a city slows 4x down to normal speed'); ok(await ev(() => document.body.classList.contains('in3d')), 'in3d class');
    let info = await ev(() => VM.City3D.info()); ok(info && info.calls > 0 && info.calls <= 40, 'draw calls ' + info.calls); ok(info.triangles < 150000, 'triangles ' + info.triangles);
    const shot = await p.screenshot(); ok(shot.length > 20000, 'the canvas is not blank (' + shot.length + ' bytes)');
    await p.click('[data-act="backmap"]'); await p.waitForTimeout(500);
    ok(await ev(() => __vm.cityView === null), 'back to the map'); ok(await ev(() => !document.body.classList.contains('in3d')), 'in3d cleared');
    await ev(c => { __vm.speed = 0; __vm.selectedCity = c; __vm.openCity(c); }, cap); ok(await ev(() => __vm.speed) === 1, 'entering a city from pause runs time at normal speed'); await ev(() => { __vm.speed = 0; }); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    ok(await ev(() => __vm.cityView === null), 'Escape leaves the city');

    // Double tap on a node on the map
    const pos = await ev(c => VM.MapView.screenOf(c), cap);
    await ev(() => { __vm.selectedCity = -1; __vm.selectedArmy = null; });
    await p.mouse.click(pos.x, pos.y); await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(700);
    ok(await ev(() => __vm.cityView) === cap, 'a double tap on a node opens the city'); await ev(() => __vm.closeCity());

    // The scene follows the game: a building finishing changes it
    await ev(c => { const s = __vm.state; s.factions[s.player].gold = 1e5; VM.Commands.exec(s, { type: 'build', faction: s.player, city: c, building: 'temple' }); __vm.openCity(c); }, cap);
    await p.waitForTimeout(600); const sig0 = await ev(() => VM.City3D.layout().sig); ok(await ev(() => VM.City3D.layout().construction !== null), 'scaffolding while building');
    await ev(() => { __vm.speed = 4; }); await p.waitForTimeout(5000); await ev(() => { __vm.speed = 0; }); await p.waitForTimeout(800);
    ok(await ev(() => VM.City3D.layout().sig) !== sig0, 'the scene changed as the game went on');

    // The worst case: a capital with everything at level 3, a full garrison, a besieging army with engines, a defending army
    await ev(c => {
      const s = __vm.state, me = s.player, T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o), city = s.cities[c];
      city.buildings = { farm: 3, market: 3, barracks: 3, wall: 3, temple: 3 }; city.wallHp = VM.War.wallMax(city) * 0.3; city.pop = 1e5; city.garrison = T({ infantry: 30, archer: 20 }); city.depot = { food: 5000, target: 5000 };
      const foe = s.factions.find(f => !f.neutral && f.id !== me).id;
      VM.Armies.spawn(s, foe, c, T({ infantry: 40, spear: 15, siege: 6 }), s.officers.find(o => o.owner === foe && o.role === 'idle').id);
      const o2 = s.officers.find(o => o.owner === me && o.role === 'idle' && o.army === null); VM.Armies.spawn(s, me, c, T({ infantry: 40 }), o2.id);
      VM.War.updateZones(s);
    }, cap);
    await p.waitForTimeout(1200);
    info = await ev(() => VM.City3D.info()); ok(info.calls <= 40, 'worst-case draw calls ' + info.calls); ok(info.triangles < 150000, 'worst-case triangles ' + info.triangles); ok(info.soldiers <= 200, 'soldiers ' + info.soldiers);
    ok((await ev(() => VM.City3D.layout().armies.length)) === 2, 'both armies are in the scene');
    // Opening the city again does not rearrange it: fields, houses and scenery stay where they were while the game goes on
    const pic = () => ev(() => { const L = VM.City3D.layout(); return JSON.stringify({ f: L.fields.map(x => [x.x, x.z]), h: L.houses.map(x => [x.x, x.z]), s: L.features.map(x => [x.kind, x.x, x.z]) }); });
    await ev(c => { __vm.closeCity(); __vm.openCity(c); __vm.speed = 0; }, cap); await p.waitForTimeout(400);
    await ev(c => { __vm.state.cities[c].pop = 200; __vm.closeCity(); __vm.openCity(c); }, cap); await p.waitForTimeout(300);
    const pic0 = JSON.parse(await pic());
    await ev(c => { const s = __vm.state, city = s.cities[c]; city.buildings.farm = Math.min(3, city.buildings.farm + 1); city.pop = Math.min(VM.Eco.cap(city), city.pop + 250); }, cap);
    for (let i = 0; i < 3; i++) { await ev(c => { __vm.closeCity(); __vm.openCity(c); __vm.speed = 0; }, cap); await p.waitForTimeout(300); }
    const pic1 = JSON.parse(await pic());
    ok(JSON.stringify(pic1.s) === JSON.stringify(pic0.s), 'scenery did not move when the city was opened again');
    ok(pic0.f.every((f, i) => pic1.f[i] && pic1.f[i][0] === f[0] && pic1.f[i][1] === f[1]), 'the old fields did not move');
    ok(pic0.h.every((h, i) => pic1.h[i] && pic1.h[i][0] === h[0] && pic1.h[i][1] === h[1]), 'the old houses did not move');

    // A column marching in on the road, a battle at the gate, soldiers of every kind
    await ev(c => { const s = __vm.state, T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o), foe = s.factions.find(f => !f.neutral && f.id !== s.player).id;
      s.armies.splice(0, s.armies.length); s.officers.forEach(o => { o.army = null; if (o.role === 'commander') o.role = 'idle'; });
      const nb = s.map.nodes[c].adj[0], mk = (own, at, t) => VM.Armies.spawn(s, own, at, T(t), s.officers.find(o => o.owner === own && o.role === 'idle' && o.army === null).id);
      const d = mk(s.player, c, { infantry: 30, spear: 12, archer: 12, cavalry: 6 }), e = mk(foe, c, { infantry: 30, spear: 12, archer: 12, cavalry: 6, siege: 3 }), m = mk(foe, nb, { infantry: 40, cavalry: 10 }); d.order = e.order = m.order = 'hold';
      VM.Armies.move(s, m, c); VM.Sim.advance(s, 1); m.edge.prog = Math.max(m.edge.prog, m.edge.len - 100); VM.War.updateZones(s); }, cap);
    await p.waitForTimeout(1500);
    const lay = await ev(() => VM.City3D.layout().armies.map(a => ({ mode: a.mode, moving: a.moving, clash: !!a.clash, mix: a.mix })));
    ok(lay.some(a => a.moving === 'in'), 'a column is marching in'); ok(lay.filter(a => a.mode === 'fighting' && a.clash).length === 2, 'the two armies meet at the gate');
    ok(lay.some(a => a.mix.cavalry > 0 && a.mix.archer > 0 && a.mix.spear > 0), 'every kind of soldier is in the picture');
    { const f1 = await ev(() => JSON.stringify(VM.City3D.info().frames)); await p.waitForTimeout(450); const f2 = await ev(() => JSON.stringify(VM.City3D.info().frames)); ok(f1 !== f2 && f1.length > 4, 'the soldiers are animated: ' + f1 + ' then ' + f2); }
    info = await ev(() => VM.City3D.info()); ok(info.calls <= 40, 'battle draw calls ' + info.calls); ok(info.triangles < 150000, 'battle triangles ' + info.triangles);
    await ev(() => { __vm.speed = 1; }); await p.waitForTimeout(2500); await ev(() => { __vm.speed = 0; });
    ok(errs.length === 0, 'no errors while the battle plays: ' + errs.join(' | '));
    // An assault: the attackers run at the wall and back; when the city falls the scene changes hands with a conquest
    await ev(c => { const s = __vm.state, me = s.player, T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o), foe = s.factions.find(f => !f.neutral && f.id !== me).id;
      s.armies.splice(0, s.armies.length); s.officers.forEach(o => { o.army = null; if (o.role === 'commander') o.role = 'idle'; });
      const city = s.cities[c]; city.owner = me; city.buildings.wall = 2; city.wallHp = VM.War.wallMax(city); city.garrison = T({ infantry: 15, archer: 6 });
      const a = VM.Armies.spawn(s, foe, c, T({ infantry: 45, spear: 15, archer: 12, cavalry: 6, siege: 4 }), s.officers.find(o => o.owner === foe && o.role === 'idle').id); a.order = 'hold';
      VM.War.updateZones(s); __vm.closeCity(); __vm.openCity(c); __vm.speed = 1; }, cap);
    const R = await ev(() => VM.City3D.layout().radius); let nearest = 99, farthest = 0;
    for (let i = 0; i < 24; i++) { await p.waitForTimeout(500); const r = await ev(() => VM.City3D.info().assaultRadii); if (r.length) { nearest = Math.min(nearest, ...r); farthest = Math.max(farthest, ...r); } }
    ok(nearest < R + 2.2, 'attackers reach the wall (closest ' + nearest.toFixed(1) + ' vs wall ' + R + ')'); ok(farthest > R + 10, 'and fall back again (farthest ' + farthest.toFixed(1) + ')');
    ok(await ev(() => VM.City3D.layout().assault), 'the layout says the city is being stormed');
    await ev(c => { const city = __vm.state.cities[c]; city.garrison = { infantry: 2, spear: 0, cavalry: 0, archer: 0, siege: 0 }; city.wallHp = 0; __vm.speed = 4; }, cap);
    let fell = false, conquest = false; for (let i = 0; i < 40 && !conquest; i++) { await p.waitForTimeout(400); fell = fell || await ev(c => __vm.state.cities[c].owner !== __vm.state.player, cap); conquest = await ev(() => VM.City3D.info().conquest); }
    await ev(() => { __vm.speed = 0; }); ok(fell, 'the city fell'); ok(conquest, 'the conquest scene played');
    await p.waitForTimeout(500);
    // Other places: every kind of city opens
    const kinds = await ev(() => { const s = __vm.state, seen = {}; for (const c of s.cities) if (!seen[c.spec]) seen[c.spec] = c.id; return seen; });
    for (const k in kinds) { await ev(id => { __vm.closeCity(); __vm.openCity(id); }, kinds[k]); await p.waitForTimeout(250); ok(await ev(() => VM.City3D.info().calls) > 0, k + ' city draws'); }
    ok(errs.length === 0, 'no console errors: ' + errs.join(' | '));
    await ctx.close();
  }
  console.log(`3D view test: ${n} checks passed`);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
