// Tutorial: a guided first scenario. A box under the top bar gives one task at a time and ticks it off when the game state shows it is done.
// It starts from the title screen (Tutorial), runs on a fixed small world with the AI factions asleep, can be skipped step by step or left,
// and wakes the AI when it ends. Finishing it once is remembered.
var VM = globalThis.VM = globalThis.VM || {};

VM.Tutorial = (function () {
  const SEED = 7, FACTIONS = 4;
  let ui, on = false, i = 0, mem = {}, target = -1, box;
  const me = () => ui.state.player;
  const cap = () => ui.state.factions[me()].capital;
  const mine = () => ui.state.armies.filter(a => a.owner === me());

  const STEPS = [
    { id: 'pause', text: 'The game runs in real time. Pause it with the II button (or Space), then press 1x to carry on.',
      done: () => { if (ui.speed === 0) mem.paused = true; return mem.paused && ui.speed > 0; } },
    { id: 'capital', text: 'This is your realm. Tap your capital (the star inside the gold ring) to open it.', focus: () => cap(),
      done: () => ui.selectedCity === cap() },
    { id: 'farm', text: 'Food keeps people alive and lets cities grow. Build a Farm in your capital: press the Farm button in the Buildings list.',
      done: () => { const c = ui.state.cities[cap()]; return (c.build && c.build.type === 'farm') || c.buildings.farm > mem.farm; } },
    { id: 'recruit', text: 'Troops cost gold and come from the population. Press +50 next to Infantry.',
      done: () => VM.Eco.troopsOf(ui.state.cities[cap()].garrison) >= mem.troops + 50 || mine().length > 0 },
    { id: 'army', text: 'Form an army: choose how many troops go (all of them by default), pick a leader and press Form army.',
      done: () => mine().length > 0 },
    { id: 'march', text: 'Armies march along roads. With the army selected, tap the glowing grey village (a free node) to send it there. It lays siege on arrival.', focus: () => target,
      done: () => mine().some(a => a.dest === target || a.at === target) || ui.state.cities[target].owner === me() },
    { id: 'capture', text: 'Watch the siege: its garrison fights back and the red ring pulses. When the village falls it is yours and it feeds your treasury.', focus: () => target,
      done: () => ui.state.cities[target].owner === me() },
    { id: 'governor', text: 'Delegate: open your new village, choose a Governor from the list and set the policy to Develop. Officers keep the city growing without you.',
      done: () => ui.state.cities.some(c => c.owner === me() && c.id !== cap() && c.governor !== null && c.policy === 'develop') },
    { id: 'officers', text: 'Press Officers in the top bar. Loyalty matters: a gift keeps a restless officer from leaving.',
      done: () => ui.sheet === 'officers' },
    { id: 'alerts', text: 'Press Alerts. Urgent news (a city attacked, an army cut off) pauses the game for you; the boxes choose what pauses it.',
      done: () => ui.sheet === 'alerts' }
  ];

  function init(uiRef) {
    ui = uiRef; box = document.getElementById('lesson');
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'lessonSkip') next(true);
      if (b.dataset.act === 'lessonExit') finish(false);
    });
  }

  // A small fixed world: the free node nearest to the capital gets a weak garrison so the first army can take it.
  function createWorld() {
    const s = VM.Sim.create({ seed: SEED, factions: FACTIONS, player: 1, ai: false, difficulty: 'easy' });
    const capId = s.factions[1].capital;
    let best = -1, bd = Infinity;
    for (const c of s.cities) { if (c.owner !== 0) continue; const d = VM.Armies.distance(s, capId, c.id); if (d < bd) { bd = d; best = c.id; } }
    s.cities[best].garrison = { infantry: 40, spear: 0, cavalry: 0, archer: 0, siege: 0 }; s.cities[best].buildings.wall = 0; s.cities[best].wallHp = 0;
    s.tutorial = { target: best };
    return s;
  }

  function begin() {
    on = true; i = 0; mem = {};
    const s = ui.state; target = s.tutorial ? s.tutorial.target : -1;
    mem.farm = s.cities[cap()].buildings.farm; mem.troops = VM.Eco.troopsOf(s.cities[cap()].garrison);
    s.aiOn = false; show();
  }

  function show() {
    const st = STEPS[i];
    if (!st) return;
    box.innerHTML = `<div class="lt">Tutorial · step ${i + 1} of ${STEPS.length}</div><div class="lx">${st.text}</div><div class="lb"><button data-act="lessonSkip" class="btn sm">Skip step</button> <button data-act="lessonExit" class="btn sm">Leave tutorial</button></div>`;
    box.classList.add('on'); mem.shown = ui.state.time;
  }

  function next(skipped) {
    i++;
    if (i >= STEPS.length) return finish(true);
    if (!skipped) VM.Audio.play('pick');
    show();
  }

  function finish(completed) {
    on = false; box.classList.remove('on');
    if (ui.state) { ui.state.aiOn = true; ui.state.difficulty = 'easy'; }
    if (completed) { try { localStorage.setItem('vexmarch.tutorial', '1'); } catch (e) { /* optional */ } VM.Panels.toast('Tutorial finished. Now conquer all thirty nodes!'); VM.Audio.play('win'); }
  }

  function update() {
    if (!on || !STEPS[i]) return;
    if (STEPS[i].done()) next(false);
  }

  // The node the current step wants you to look at (the map draws a pulsing ring on it).
  const focus = () => (on && STEPS[i] && STEPS[i].focus) ? STEPS[i].focus() : -1;

  return { init, createWorld, begin, update, focus, active: () => on, finish, done: () => { try { return localStorage.getItem('vexmarch.tutorial') === '1'; } catch (e) { return false; } } };
})();
