// Browser test for the campaign screens: choose a house, read the history and the opening, play on, see the beats, officers' bios and the chronicle, in English and in Korean.
// Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_story.js
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  let n = 0;
  for (const [lang, w, h] of [['en', 1280, 760], ['ko', 390, 780]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, isMobile: w < 700 });
    const p = await ctx.newPage(); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
    await p.addInitScript(l => { try { localStorage.setItem('vexmarch.lang', l); } catch (e) { /* none */ } }, lang);
    await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(400);
    const ev = fn => p.evaluate(fn), ok = (c, m) => { assert(c, `[${lang}] ${m}`); n++; };
    await p.click('#campBtn'); await p.waitForTimeout(300);
    ok(await p.locator('#campaign.on').count() === 1, 'the campaign screen opens'); ok(await p.locator('#campList .fac').count() === 6, 'six houses');
    await p.click('#campList [data-h="4"]'); await p.waitForTimeout(300);
    ok(await ev(() => __vm.state.story && __vm.state.player === 4 && __vm.state.map.nodes.length === 30 && __vm.state.map.nodes.some(n => n.name === 'Vexholm')), 'the fixed map is the preview, with the chosen house');
    ok((await p.locator('#campInfo').innerText()).includes(lang === 'ko' ? '브라노크' : 'Brannoch'), 'the house is described in the language');
    await p.click('#campGo'); await p.waitForTimeout(600);
    ok(await p.locator('#story.on').count() === 1 && await ev(() => __vm.speed) === 0, 'the history page opens and the game waits');
    ok((await p.locator('#storyB').innerText()).includes(lang === 'ko' ? '벡스홀름' : 'Vexholm'), 'the history mentions the capital');
    await p.click('#storyBtn'); await p.waitForTimeout(250); ok(await p.locator('#story.on').count() === 1, 'then the opening scene');
    ok((await p.locator('#storyB').innerText()).includes(lang === 'ko' ? '브라노크' : 'Brannoch Marrow'), 'the scene is the house\'s own');
    await p.click('#storyBtn'); await p.waitForTimeout(300); ok(await p.locator('#story.on').count() === 0 && await ev(() => __vm.speed) > 0, 'the game goes on');
    // beats: a letter comes at day 90 and the page appears by itself
    await ev(() => { __vm.speed = 0; VM.Sim.advance(__vm.state, 95); __vm.speed = 1; }); await p.waitForTimeout(500);
    ok(await p.locator('#story.on').count() === 1, 'a story beat appears'); await p.click('#storyBtn'); await p.waitForTimeout(200);
    while (await p.locator('#story.on').count()) { await p.click('#storyBtn'); await p.waitForTimeout(200); }
    // officers' bios
    await p.click('#offBtn'); await p.waitForTimeout(300);
    const sheet = await p.locator('#sheet').innerText() + ' ' + await p.evaluate(() => [...document.querySelectorAll('#sheet [data-tip]')].map(e => e.getAttribute('data-tip')).join(' '));
    ok(sheet.includes(lang === 'ko' ? '케스트럴 마로' : 'Kestrel Marrow') && sheet.includes(lang === 'ko' ? '수비대장의 딸' : 'Warden'), 'officers show their names and biographies');
    ok(sheet.includes(lang === 'ko' ? '혈육' : 'Kin of'), 'and their ties'); await p.click('#sheet [data-act="sheetClose"]');
    // the chronicle, from the pause menu
    await p.click('#menuBtn'); await p.waitForTimeout(200); await p.click('[data-pm="chronicle"]'); await p.waitForTimeout(300);
    ok(await p.locator('#story.on').count() === 1 && (await p.locator('#storyB .chr').count()) >= 1, 'the chronicle lists what happened'); await p.click('#storyBtn'); await p.waitForTimeout(200);
    // a decision: two buttons, no Continue until one is picked, then the result
    await ev(() => { const st = __vm.state; st.story.queue.length = 0; st.story.lastDay = -1; st.time = Math.max(st.time, 205); st.story.lastDecision = 0; __vm.speed = 1; }); await p.waitForTimeout(700);
    ok(await p.locator('#story.on [data-choice]').count() === 2, 'a decision shows two choices'); ok(!(await p.locator('#storyBtn').isVisible()), 'no Continue before choosing');
    const gold0 = await ev(() => __vm.state.factions[__vm.state.player].honor === undefined && __vm.state.story.honor === undefined);
    await p.click('#story [data-choice="0"]'); await p.waitForTimeout(200);
    ok(await p.locator('#storyBtn').isVisible() && await ev(() => __vm.state.story.honor !== undefined), 'the choice is made and its result shown');
    await p.click('#storyBtn'); await p.waitForTimeout(200); while (await p.locator('#story.on').count()) { await p.click('#storyBtn'); await p.waitForTimeout(200); }
    // an ending
    await ev(() => { __vm.state.over = { type: 'win', winner: 4, t: __vm.state.time }; __vm.state.story.lastDay = -1; VM.Story.step(__vm.state); }); await p.waitForTimeout(500);
    ok(await p.locator('#story.end.on').count() === 1, 'the ending page'); await p.click('#storyBtn'); await p.waitForTimeout(500);
    ok(await p.locator('#title.on').count() === 1, 'the ending leads back to the main menu');
    ok(await ev(() => !__vm.state.story), 'and a skirmish starts a fresh world, not the campaign');
    ok(errs.length === 0, 'no errors: ' + errs.join(' | '));
    await ctx.close();
  }
  console.log(`story UI test: ${n} checks passed`); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
