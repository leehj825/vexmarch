// Browser test for the tips (js/ui/tips.js): hold shows, release hides, a tap still works, a held press is not also a click, hover on a desktop, Korean, on screen.
// Usage: PLAYWRIGHT=/path/to/playwright node tools/ui_tips.js
const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let n = 0;
  for (const [w, h, touch] of [[390, 780, true], [1280, 760, false]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file://' + path.join(__dirname, '..', 'index.html')); await p.waitForTimeout(300);
    const ev = (fn, a) => p.evaluate(({ f, a }) => (new Function('return ' + f))()(a), { f: fn.toString(), a });
    const ok = (c, m) => { assert(c, `[${w}px] ${m}`); n++; if (process.env.V) console.log('ok', m); };
    await p.click('#startBtn'); await p.waitForTimeout(400);
    await ev(() => { __vm.speed = 0; __vm.state.aiOn = false; const c = __vm.state.factions[__vm.state.player].capital; __vm.selectedCity = c; }); await p.waitForTimeout(300);
    const tipOn = () => ev(() => document.getElementById('tip').classList.contains('on'));
    const tipText = () => ev(() => document.getElementById('tip').textContent);
    const press = (sel, type) => ev(o => { const e = document.querySelector(o.sel), r = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent('pointerdown', { pointerType: o.type, bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); }, { sel, type });
    const release = (sel, type) => ev(o => { const e = document.querySelector(o.sel), r = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent('pointerup', { pointerType: o.type, bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); }, { sel, type });
    const sel = '#panel .st[data-tip]';
    ok(await ev(() => document.querySelectorAll('#panel [data-tip]').length) >= 8, 'the city panel carries tips');
    ok(await ev(() => !/Choose how many of the garrison|Stores food so armies/.test(document.getElementById('panel').textContent)), 'the long descriptions are gone from the panel');
    if (touch) {
      await press(sel, 'touch'); await p.waitForTimeout(120); ok(!(await tipOn()), 'a quick touch shows nothing yet');
      await p.waitForTimeout(300); ok(await tipOn(), 'holding shows the tip'); ok((await tipText()).length > 20, 'with a text');
      const box = await ev(() => { const r = document.getElementById('tip').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
      ok(box[0] >= 0 && box[1] >= 0 && box[2] <= w && box[3] <= h, 'the tip stays on screen');
      await release(sel, 'touch'); await p.waitForTimeout(80); ok(!(await tipOn()), 'letting go hides it');
      // a plain tap on a chip still acts
      const before = await ev(() => __vm.state.cities[__vm.selectedCity].tax);
      await p.tap('[data-act="tax"][data-tax="high"]'); await p.waitForTimeout(200);
      ok(await ev(() => __vm.state.cities[__vm.selectedCity].tax) === 'high' && before !== 'high', 'a short tap still presses the button');
      // a held press on a button with a tip is not a click
      const pol = await ev(() => { const c = __vm.state.cities[__vm.selectedCity]; return c.policy; });
      await ev(() => { const c = __vm.state.cities[__vm.selectedCity]; c.governor = __vm.state.officers.find(o => o.owner === __vm.state.player).id; }); await p.waitForTimeout(300);
      if (await p.$('[data-act="policy"][data-mode="fortify"]')) {
        await press('[data-act="policy"][data-mode="fortify"]', 'touch'); await p.waitForTimeout(450);
        ok(await tipOn(), 'a button can show its tip too'); await release('[data-act="policy"][data-mode="fortify"]', 'touch');
        await ev(() => document.querySelector('[data-act="policy"][data-mode="fortify"]').click()); await p.waitForTimeout(100);
        ok(await ev(() => __vm.state.cities[__vm.selectedCity].policy) === pol, 'the click that ends a hold is swallowed');
      }
    } else {
      await p.hover(sel); await p.waitForTimeout(150); ok(!(await tipOn()), 'the tip waits a moment on hover');
      await p.waitForTimeout(350); ok(await tipOn(), 'hovering shows the tip');
      await p.mouse.move(5, 5); await p.waitForTimeout(100); ok(!(await tipOn()), 'moving away hides it');
    }
    // Korean
    await ev(() => VM.I18N.set('ko')); await p.waitForTimeout(300);
    if (touch) { await press(sel, 'touch'); await p.waitForTimeout(450); } else { await p.hover(sel); await p.waitForTimeout(550); }
    ok(/[가-힣]/.test(await tipText()), 'the tip is in Korean: ' + await tipText());
    ok(!errs.length, 'no console errors: ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); console.log('tips: ' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
