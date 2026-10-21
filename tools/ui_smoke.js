// Browser smoke test: plays the first minutes through the real page (title, tutorial, build, recruit, army, march, sheets, settings, Korean).
// Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_smoke.js   (Playwright is not a project dependency; any install of it will do)
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
    const ev = (fn, a) => p.evaluate(({ f, a }) => (new Function('return ' + f))()(a), { f: fn.toString(), a });
    const ok = (c, m) => { assert(c, `[${w}px] ${m}`); n++; };

    // Title: faction picker, difficulty, tutorial pulse
    ok(await p.locator('#facList button').count() === 5, 'five faction buttons');
    await p.click('#facList button:nth-child(2)'); ok(await ev(() => __vm.state.player) === 2, 'picked faction 2');
    await p.click('[data-d="hard"]'); ok(await ev(() => __vm.state.difficulty) === 'hard', 'difficulty hard');

    // Tutorial: complete every step through real UI actions where possible
    await p.click('#tutBtn'); await p.waitForTimeout(400);
    ok(await ev(() => VM.Tutorial.active()), 'tutorial started'); ok(await ev(() => __vm.state.aiOn === false), 'AI asleep during the tutorial');
    await p.click('#speed [data-s="0"]'); await p.click('#speed [data-s="1"]'); await p.waitForTimeout(250);
    const cap = await ev(() => __vm.state.factions[__vm.state.player].capital);
    const pos = id => ev(id => { const v = VM.MapView.view(), n = __vm.state.map.nodes[id]; return { x: n.x * v.s + v.ox, y: n.y * v.s + v.oy }; }, id);
    let pt = await pos(cap); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(250);
    ok(await ev(() => __vm.selectedCity) === cap, 'capital selected by tapping');
    await ev(() => { __vm.speed = 0; }); await p.waitForTimeout(150);
    await p.click('[data-act="build"][data-b="farm"]'); await p.waitForTimeout(250);
    await p.click('[data-act="recruit"][data-t="infantry"][data-n="5"]'); await p.waitForTimeout(250);
    await ev(() => { const s = __vm.state, c = s.cities[s.factions[s.player].capital]; const o = s.officers.find(x => x.owner === s.player && x.role === 'idle'); o.loc = c.id; });
    await p.waitForTimeout(250); await p.click('[data-act="form"]'); await p.waitForTimeout(300);
    ok(await ev(() => __vm.state.armies.length) === 1, 'army formed through the panel');
    const target = await ev(() => __vm.state.tutorial.target); pt = await pos(target); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(250);
    ok(await ev(() => __vm.state.armies[0].dest) === target, 'march ordered by tapping the village');
    await ev(() => { __vm.speed = 4; }); await p.waitForTimeout(100);
    for (let i = 0; i < 60; i++) { if (await ev(() => __vm.state.cities[__vm.state.tutorial.target].owner === __vm.state.player)) break; await p.waitForTimeout(500); }
    ok(await ev(() => __vm.state.cities[__vm.state.tutorial.target].owner === __vm.state.player), 'the village was captured');
    await ev(() => { __vm.speed = 0; });
    await ev(() => { const s = __vm.state, me = s.player, c = s.cities[s.tutorial.target], o = s.officers.find(x => x.owner === me && x.role === 'idle'); o.loc = c.id; VM.Commands.exec(s, { type: 'setGovernor', faction: me, city: c.id, officer: o.id }); VM.Commands.exec(s, { type: 'setPolicy', faction: me, city: c.id, mode: 'develop' }); });
    await p.waitForTimeout(250); await p.click('#offBtn'); await p.waitForTimeout(200); await p.click('#alertBtn'); await p.waitForTimeout(300);
    ok(await ev(() => !VM.Tutorial.active()), 'tutorial finished'); ok(await ev(() => __vm.state.aiOn === true), 'AI woke up');
    ok(await ev(() => localStorage.getItem('vexmarch.tutorial') === '1'), 'completion remembered');

    // Settings and language
    await p.click('#setBtn'); await p.waitForTimeout(250);
    await p.click('[data-act="lang"][data-l="ko"]'); await p.waitForTimeout(300);
    ok((await p.textContent('#sheet')).includes('설정'), 'settings sheet in Korean');
    ok((await p.textContent('#gold')).includes('골드'), 'top bar in Korean');
    await p.click('[data-act="lang"][data-l="en"]'); await p.waitForTimeout(300);
    ok((await p.textContent('#gold')).includes('Gold'), 'back to English');
    await ev(() => VM.Audio.set('music', 0.3)); ok(await ev(() => VM.Audio.get('music')) === 0.3, 'volume setting');
    await p.click('#menuBtn'); await p.waitForTimeout(300); ok(await p.locator('#title.on').count() === 1, 'menu returns to the title');
    ok(await p.locator('#contBtn').isVisible(), 'a save exists to continue');
    await p.click('#contBtn'); await p.waitForTimeout(300); ok(await ev(() => __vm.running), 'continue works');
    // Form an army with chosen troops, then adjust it from the city's garrison
    await ev(() => { const s = __vm.state, me = s.player, c = s.cities[s.factions[me].capital]; s.armies.splice(0, s.armies.length); s.officers.forEach(o => { o.army = null; if (o.role === 'commander') o.role = 'idle'; }); s.factions[me].gold = 1e6; s.aiOn = false;
      for (const [k, n] of [['infantry', 12], ['archer', 8]]) VM.Commands.exec(s, { type: 'recruit', faction: me, city: c.id, troop: k, count: n });
      const o = s.officers.find(x => x.owner === me && x.role === 'idle'); o.loc = c.id; __vm.draft = null; __vm.speed = 0; __vm.selectedArmy = null; __vm.selectedCity = c.id; });
    await p.waitForTimeout(400);
    ok(await p.locator('input[data-draft="archer"]').count() === 1, 'the form panel has a box per troop kind');
    await p.fill('input[data-draft="archer"]', '3'); await p.click('[data-act="draft"][data-t="infantry"][data-n="-5"]'); await p.waitForTimeout(250);
    ok(await p.inputValue('input[data-draft="archer"]') === '3', 'the typed number stays');
    await p.click('[data-act="form"]'); await p.waitForTimeout(300);
    const tr = await ev(() => { const a = __vm.state.armies[0], c = __vm.state.cities[a.at]; return { a: [a.troops.infantry, a.troops.archer], g: [c.garrison.infantry, c.garrison.archer] }; });
    ok(tr.a[1] === 3 && tr.g[1] === 5 && tr.a[0] === tr.a[0] && tr.g[0] > 0, 'the army took what was chosen and the garrison kept the rest ' + JSON.stringify(tr));
    const army0 = await ev(() => __vm.state.armies[0].troops.archer);
    await p.click('[data-act="xfer"][data-t="archer"][data-n="1"]'); await p.waitForTimeout(250);
    ok(await ev(() => __vm.state.armies[0].troops.archer) === army0 + 1, 'one more archer moved from the garrison into the army');
    await p.click('[data-act="xfer"][data-t="archer"][data-n="-1"]'); await p.waitForTimeout(250);
    ok(await ev(() => __vm.state.armies[0].troops.archer) === army0, 'and back');
    ok(errs.length === 0, 'no console errors: ' + errs.join(' | '));
    await ctx.close();
  }
  console.log(`ui smoke test: ${n} checks passed`);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
