// Opens the game in a browser, drives it through every panel and message, and lists the texts it showed (numbers as {0}.., names as {a}..).
// Usage: PLAYWRIGHT=/path/to/playwright node tools/i18n_crawl.js [--ko] [--missing]
//   (default)  prints every English text seen, to translate into js/lang_ko.js
//   --ko       switches the page to Korean first; with --missing prints the texts that are still in English (the i18n test)
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const KO = process.argv.includes('--ko'), MISSING = process.argv.includes('--missing');
const seen = new Set();

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.stack || String(e)));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(300);
  if (KO) { await page.evaluate(() => VM.I18N.set('ko')); }

  async function collect() {
    const texts = await page.evaluate(() => {
      const st = window.__vm && window.__vm.state, names = [];
      if (st) { st.map.nodes.forEach(n => names.push(n.name)); st.officers.forEach(o => names.push(o.name)); st.factions.forEach(f => names.push(f.name)); }
      names.sort((a, b) => b.length - a.length);
      const out = [];
      const walk = n => {
        if (n.nodeType === 3) { if (n.data.trim()) out.push(n.data); }
        else if (n.nodeType === 1 && !['SCRIPT', 'STYLE', 'CANVAS'].includes(n.tagName) && n.getAttribute('translate') !== 'no') {
          for (const a of ['title']) if (n.getAttribute(a)) out.push(n.getAttribute(a));
          n.childNodes.forEach(walk);
        }
      };
      walk(document.body);
      const re = names.length ? new RegExp(names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
      return out.map(t => {                                   // names become {a}, {b}, {c} in order of appearance
        let s = t.trim(); if (!re) return s;
        const seenN = []; return s.replace(re, m => { let i = seenN.indexOf(m); if (i < 0) { seenN.push(m); i = seenN.length - 1; } return '{' + 'abc'[Math.min(i, 2)] + '}'; });
      });
    });
    for (let t of texts) {
      t = t.replace(/[-+−]?\d+(?:[.,]\d+)?/g, '\u0001'); let i = 0; t = t.replace(/\u0001/g, () => '{' + (i++) + '}');
      if (/[A-Za-z]/.test(t.replace(/\{[a-c0-9]\}/g, ''))) seen.add(t);
    }
  }
  const run = (fn, ...a) => page.evaluate(({ f, a }) => (new Function('return ' + f))()(...a), { f: fn.toString(), a });
  const step = async (ms = 150) => { await page.waitForTimeout(ms); await collect(); };

  // ---- title ----
  await collect(); await page.click('[data-d="hard"]'); await collect(); await page.click('[data-n="6"]'); await collect(); await page.click('[data-n="5"]'); await page.click('[data-d="normal"]');
  await page.click('#startBtn'); await step(300);

  // ---- a staged world ----
  await run(() => {
    const s = __vm.state, me = s.player, cap = s.factions[me].capital, T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
    window.__T = T; s.factions[me].gold = 20000; s.factions[me].food = 20000; s.aiOn = false;
    const own = s.cities.filter(c => c.owner === me), c2 = own.find(c => c.id !== cap);
    const nb = s.map.nodes[cap].adj.find(n => s.cities[n].owner !== me) ?? s.map.nodes[cap].adj.find(n => n !== c2.id);
    s.cities[nb].owner = 0; s.cities[nb].buildings.wall = 2; s.cities[nb].wallHp = VM.War.wallMax(s.cities[nb]);
    const o2 = s.officers.find(o => o.owner === me && o.role === 'idle'); o2.loc = c2.id; VM.Commands.exec(s, { type: 'setGovernor', faction: me, city: c2.id, officer: o2.id });
    window.__ids = { me, cap, c2: c2.id, nb, foe: s.cities.find(c => c.owner > 0 && c.owner !== me).id };
  });
  const ids = await run(() => window.__ids);
  const select = async (id) => { await run(id => { __vm.selectedArmy = null; __vm.selectedCity = id; }, id); await step(250); };
  await select(ids.cap); await select(ids.c2);
  await run(ids => { const s = __vm.state; for (const [i, t] of [['build', 'farm']]) VM.Commands.exec(s, { type: 'build', faction: ids.me, city: ids.c2, building: 'temple' }); VM.Commands.exec(s, { type: 'setPolicy', faction: ids.me, city: ids.c2, mode: 'fortify' }); VM.Commands.exec(s, { type: 'buildDepot', faction: ids.me, city: ids.c2 }); VM.Commands.exec(s, { type: 'setDepot', faction: ids.me, city: ids.c2, target: 800 }); VM.Commands.exec(s, { type: 'setTax', faction: ids.me, city: ids.c2, tax: 'high' }); }, ids);
  await select(ids.c2); await run(ids => { const s = __vm.state; for (const m of ['manual', 'develop', 'recruit']) VM.Commands.exec(s, { type: 'setPolicy', faction: ids.me, city: ids.c2, mode: m }); }, ids); await select(ids.c2);
  await select(ids.foe); await select(ids.nb);
  // buttons that fail (error toasts)
  for (const sel of ['[data-act="recruit"][data-n="200"]']) { await run(ids => { __vm.selectedCity = ids.cap; __vm.state.factions[ids.me].gold = 0; }, ids); await step(300); await run(sel => { const e = document.querySelector(sel); if (e) e.click(); }, sel); await step(300); }
  await run(ids => { __vm.state.factions[ids.me].gold = 20000; }, ids);
  // an army in every condition
  await run(ids => {
    const s = __vm.state, T = window.__T, me = ids.me;
    const off = s.officers.filter(o => o.owner === me && o.role === 'idle'), mk = (o, at, t) => VM.Armies.spawn(s, me, at, T(t), o.id);
    window.__a1 = mk(off[0], ids.cap, { infantry: 300, archer: 100 }).id;
    window.__off = off.map(o => o.id);
    __vm.selectedCity = -1; __vm.selectedArmy = window.__a1;
  }, ids);
  await step(300);
  for (const mode of ['defend', 'reinforce', 'raid', 'hold']) { await run((ids, mode) => VM.Commands.exec(__vm.state, { type: 'setOrder', faction: ids.me, army: window.__a1, mode }), ids, mode); await step(100); }
  await run(ids => { const a = __vm.state.armies.find(x => x.id === window.__a1); a.rest = true; VM.Commands.exec(__vm.state, { type: 'moveArmy', faction: ids.me, army: a.id, to: ids.nb }); }, ids); await step(900);
  await run(() => { const a = __vm.state.armies.find(x => x.id === window.__a1); a.morale = 20; a.supply = Object.assign({}, a.supply, { line: 'cut', starving: true, foreign: true, mult: 3 }); }); await step(200);
  await run(() => { const a = __vm.state.armies.find(x => x.id === window.__a1); a.routed = true; }); await step(200);
  await run(() => { const a = __vm.state.armies.find(x => x.id === window.__a1); a.routed = false; a.fighting = []; });
  // a battle and a siege
  await run(ids => { const s = __vm.state, T = window.__T; const foe = s.cities.find(c => c.owner > 0 && c.owner !== ids.me); const e = VM.Armies.spawn(s, foe.owner, ids.nb, T({ infantry: 400 }), s.officers.find(o => o.owner === foe.owner && o.army === null && o.role === 'idle').id); const a = s.armies.find(x => x.id === window.__a1); a.at = ids.nb; a.edge = null; a.path = []; a.dest = null; a.troops = T({ infantry: 500, siege: 10 }); a.morale = 100; a.supply = null; s.aiOn = false; __vm.speed = 1; }, ids);
  await step(1500); await run(() => { __vm.speed = 0; });
  await run(ids => { const s = __vm.state; s.armies = s.armies.filter(a => a.id === window.__a1); const a = s.armies[0]; a.fighting = []; a.abilityReady = 0; s.cities[ids.nb].garrison = window.__T({ infantry: 200 }); }, ids); await step(1200);
  await run(() => { __vm.selectedArmy = window.__a1; }); await step(300);

  // ---- sheets ----
  await run(() => { const s = __vm.state; const o = s.officers.find(x => x.owner === s.player && x.role === 'idle'); if (o) { o.loyalty = 20; o.travel = { to: s.factions[s.player].capital, arrive: s.time + 5 }; o.role = 'traveling'; } const o2 = s.officers.filter(x => x.owner === s.player && x.role === 'idle')[0]; if (o2) { o2.searching = { city: o2.loc, until: s.time + 9 }; o2.role = 'searching'; } const w = s.officers.find(x => x.owner === 0); w.loc = s.factions[s.player].capital; });
  await page.click('#offBtn'); await step(300);
  await run(() => { const s = __vm.state; for (const t of ['attacked', 'battle', 'rout', 'destroyed', 'cut', 'wanderer', 'found', 'searchFailed', 'recruited', 'arrived', 'loyaltyLow', 'built', 'starving', 'officerCaptured', 'officerDied', 'eliminated', 'defected', 'captured']) { const me = s.player, c = s.factions[me].capital, f2 = s.cities.find(x => x.owner > 0 && x.owner !== me).owner, off = s.officers.find(o => o.owner === me).id;
    VM.Eco.pushEvent(s, { type: t, owner: me, city: c, at: c, enemy: f2, army: 1, officer: off, building: 'farm', level: 2, besieged: true, to: f2, from: me });
    VM.Eco.pushEvent(s, { type: t, owner: f2, city: c, at: c, enemy: me, army: 1, officer: off, building: 'farm', level: 2, besieged: false, to: me, from: f2 }); } });
  await step(500);
  await page.click('#alertBtn'); await step(300);
  // proposals
  await run(() => { const s = __vm.state, me = s.player, cap = s.factions[me].capital; const o = s.officers.find(x => x.owner === me); s.proposals.push({ id: 90, type: 'attack', officer: o.id, army: window.__a1, target: s.cities.find(c => c.owner !== me).id, created: s.time, expires: s.time + 12 }, { id: 91, type: 'wall', officer: o.id, city: cap, cost: 300, created: s.time, expires: s.time + 5 }); VM.Eco.pushEvent(s, { type: 'proposal', owner: me, proposal: 90 }); VM.Eco.pushEvent(s, { type: 'proposal', owner: me, proposal: 91 }); });
  await step(500);
  await page.click('#setBtn'); await step(300);
  // an assortment of rule failures (toasts)
  const reasons = await run(() => { const s = __vm.state, me = s.player, out = [];
    const tries = [{ type: 'build', city: 99 }, { type: 'recruit', city: s.factions[me].capital, troop: 'infantry', count: 0 }, { type: 'recruit', city: s.factions[me].capital, troop: 'x', count: 1 }, { type: 'recruit', city: s.factions[me].capital, troop: 'infantry', count: 1e9 }, { type: 'setTax', city: s.factions[me].capital, tax: 'x' }, { type: 'setPolicy', city: s.factions[me].capital, mode: 'x' }, { type: 'formArmy', city: s.factions[me].capital, officer: 0 }, { type: 'moveArmy', army: 999, to: 1 }, { type: 'setDepot', city: s.factions[me].capital, target: 5 }, { type: 'answerProposal', proposal: 12345, accept: true }, { type: 'nothing' }];
    for (const c of tries) { c.faction = me; const r = VM.Commands.exec(s, c); if (!r.ok) out.push(r.reason); } return out; });
  for (const r of reasons) { await run(r => VM.Panels.toast(r.charAt(0).toUpperCase() + r.slice(1)), r); await step(60); }

  // ---- tutorial steps ----
  await run(() => { VM.Title.startTutorial(); }); await step(300);
  for (let i = 0; i < 10; i++) { await collect(); const had = await run(() => { const e = document.querySelector('[data-act="lessonSkip"]'); if (e) e.click(); return !!e; }); if (!had) break; await page.waitForTimeout(100); }
  await run(() => { VM.Tutorial.finish(true); }); await step(300);
  // ---- game over ----
  await run(() => { __vm.state.over = { type: 'win', t: 100, winner: __vm.state.player }; }); await step(500);
  await run(() => { document.getElementById('over').classList.remove('on'); __vm.overShown = false; __vm.state.over = { type: 'lose', t: 100, winner: 2 }; }); await step(500);

  const list = [...seen].sort();
  if (MISSING) { console.log(list.join('\n')); console.error(list.length + ' texts still in English' + (errs.length ? '; page errors: ' + errs.join(' | ') : '')); }
  else { console.log(list.join('\n')); console.error(list.length + ' texts' + (errs.length ? '; page errors: ' + errs.join(' | ') : '')); }
  await b.close();
})();
