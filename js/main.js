// Boot and main loop. Owns the UI state shared by the map, panels and title screen.
(function () {
  const ui = {
    state: null, sheet: null, speed: 1, running: false, selectedCity: -1, selectedArmy: null, lastEvent: 0, lastSave: 0,
    draft: null,
    setState(s) { ui.draft = null; ui.overShown = false; document.getElementById('over').classList.remove('on'); ui.closeField(); ui.state = s; ui.selectedCity = -1; ui.selectedArmy = null; ui.lastEvent = s.nextEvent || 0; ui.sheet = null; if (VM.Alerts) VM.Alerts.reset(); ui.lastSave = Math.floor(s.time / 30); },
    start() { ui.sheet = null; document.body.classList.remove('titlemode'); document.getElementById('hud').style.visibility = 'visible'; ui.running = true; ui.speed = 1; VM.MapView.centerOn(ui.state.factions[ui.state.player].capital); },
    centerOn(id) { VM.MapView.centerOn(id); },
    cityView: null,
    openCity(id) {
      if (!VM.City3D.open(id)) { VM.Panels.toast('The 3D view is not available on this device'); VM.Audio.play('error'); return; }
      ui.cityView = id; ui.speed = 1; ui.panelMin = matchMedia('(max-width: 720px)').matches; document.body.classList.add('in3d'); VM.Audio.play('pick');      // the 2x and 4x speeds are for testing: inside a city time runs at normal speed; on a phone the details start folded away so the city is visible
    },
    fieldView: null,
    // the field battle view: only while the army is fighting at this moment; once in, it stays until the player leaves
    openField(armyId) {
      const an = VM.FieldLayout.start(ui.state, armyId);
      if (!an) { VM.Panels.toast('The battle is over'); return false; }
      if (ui.cityView !== null) ui.closeCity();
      if (!VM.Field3D.open(an)) { VM.Panels.toast('The 3D view is not available on this device'); VM.Audio.play('error'); return false; }
      ui.fieldView = an; ui.panelMin = false; document.body.classList.add('infield'); VM.Audio.play('pick'); return true;
    },
    closeField() { if (ui.fieldView === null) return; VM.Field3D.close(); ui.fieldView = null; document.body.classList.remove('infield'); if (VM.MapTerrain) VM.MapTerrain.markDirty(); },
    closeCity() { if (ui.cityView === null) return; VM.Walk.stop(); VM.City3D.close(); ui.cityView = null; document.body.classList.remove('in3d'); if (VM.MapTerrain) VM.MapTerrain.markDirty(); },
    onTap(h) {
      if (!ui.running) return;
      if (h && h.kind === 'battle') { ui.openField(h.id); return; }
      if (h && h.kind === 'army') { ui.selectedArmy = h.id; ui.selectedCity = -1; return; }
      if (h && h.kind === 'node') {
        if (ui.selectedArmy !== null) { ui.onOrder(h.id); return; }
        ui.selectedCity = h.id; return;
      }
      ui.selectedArmy = null; ui.selectedCity = -1;
    },
    onOrder(nodeId) {
      if (ui.selectedArmy === null) { ui.selectedCity = nodeId; return; }
      const r = VM.Commands.exec(ui.state, { type: 'moveArmy', faction: ui.state.player, army: ui.selectedArmy, to: nodeId });
      if (!r.ok) { VM.Panels.toast(r.reason.charAt(0).toUpperCase() + r.reason.slice(1)); VM.Audio.play('error'); } else VM.Audio.play('order');
    }
  };
  window.VMUI = ui;

  function save() { try { localStorage.setItem('vexmarch.save', VM.Sim.save(ui.state)); } catch (e) { /* saving is optional */ } }

  function overlay() {
    const st = ui.state, nm = id => st.factions[id].name;
    if (st.over && !ui.overShown) {
      ui.overShown = true;
      const o = document.getElementById('over'); o.classList.toggle('lose', st.over.type === 'lose'); o.classList.add('on');
      VM.Audio.play(st.over.type === 'win' ? 'win' : 'lose');
      if (st.over.type === 'merged') { document.getElementById('overT').textContent = 'Absorbed'; document.getElementById('overP').textContent = `You bent the knee to ${nm(st.over.winner)}. Your people and officers live on under their banner, and the war is over for you.`; return; }
      document.getElementById('overT').textContent = st.over.type === 'win' ? 'Victory' : 'Defeat';
      if (st.over.special) { const V = VM.StoryData.VICTORIES[st.over.winner]; document.getElementById('overP').textContent = (st.over.type === 'win' ? 'You achieved your house\'s aim: ' : `${nm(st.over.winner)} achieved their aim: `) + VM.Story.tx(V.name) + `. It took ${Math.round(st.over.t)} days.`; return; }
      document.getElementById('overP').textContent = st.over.type === 'win' ? `All of the realm marches under your banner. It took ${Math.round(st.over.t)} days.` : (st.over.winner ? `${nm(st.over.winner)} now holds every node` : `${nm(st.player)} holds no nodes`) + '. Start again and do better.';
    }
  }

  let moodT = 0;
  function moodTick(dt) {
    moodT += dt; if (moodT < 1) return; moodT = 0;
    const st = ui.state, me = st.player;
    const war = st.armies.some(a => a.owner === me && a.fighting.length) || st.cities.some(c => c.owner === me && (c.besieged || c.contested));
    VM.Audio.setMood(war ? 'war' : 'calm');
  }

  let last = performance.now();
  function step(now) {
    const dt = Math.min(1, (now - last) / 1000); last = now;
    if (ui.running) {
      VM.Sim.update(ui.state, dt, ui.walking ? 0 : ui.speed);
      VM.Alerts.process(); overlay(); VM.Tutorial.update(); moodTick(dt);
      const m = Math.floor(ui.state.time / 30); if (m !== ui.lastSave && !ui.state.over) { ui.lastSave = m; save(); }
    }
    const tb = document.getElementById('top').getBoundingClientRect().bottom; if (tb !== ui.topBottom) { ui.topBottom = tb; document.documentElement.style.setProperty('--topb', tb + 'px'); }      // things that sit under the top bar follow it, however many rows it wraps to
    if (ui.fieldView !== null) VM.Field3D.frame(dt);
    else if (ui.cityView !== null) VM.City3D.frame(dt);
    else VM.MapView.render();
    if (ui.running) { VM.Panels.update(); VM.Sheets.update(); VM.StoryUI.update(); VM.DoctrineUI.update(); } else if (ui.sheet || document.getElementById('sheet').classList.contains('open')) VM.Sheets.update();
  }
  // One broken frame must never stop the game: the next frame is always scheduled, and an error is reported once instead of freezing everything
  let errShown = false;
  function frame(now) {
    try { step(now); } catch (e) { if (!errShown) { errShown = true; console.error('frame error', e); } }
    requestAnimationFrame(frame);
  }

  document.getElementById('overBtn').addEventListener('click', () => { document.getElementById('over').classList.remove('on'); ui.closeField(); ui.closeCity(); ui.running = false; document.getElementById('hud').style.visibility = 'hidden'; document.body.classList.add('titlemode'); try { localStorage.removeItem('vexmarch.save'); } catch (e) { /* ignore */ } VM.Title.roll(false); VM.Title.show(); });
  document.querySelectorAll('#speed button[data-s]').forEach(b => b.addEventListener('click', () => { ui.speed = +b.dataset.s; VM.Audio.play('click'); }));
  const $menu = document.getElementById('menuBtn');
  const exitToMenu = () => { save(); ui.closeCity(); ui.running = false; ui.sheet = null; document.getElementById('sheet').classList.remove('open'); ui.selectedArmy = null; ui.selectedCity = -1; document.getElementById('panel').classList.remove('open'); document.getElementById('hud').style.visibility = 'hidden'; document.body.classList.add('titlemode'); VM.Tutorial.finish(false); VM.Title.show(); };
  // The menu button pauses the game and offers Resume, Settings and Save and exit (the exit used to be the button itself)
  ui.exitToMenu = exitToMenu;
  const $pm = document.getElementById('pauseMenu');
  const closePause = () => { if (!$pm.classList.contains('on')) return; $pm.classList.remove('on'); ui.speed = ui.prevSpeed === undefined ? 1 : ui.prevSpeed; };
  $menu.addEventListener('click', () => { if (!ui.running || $pm.classList.contains('on')) return; ui.prevSpeed = ui.speed; ui.speed = 0; $pm.classList.add('on'); document.getElementById('pmChron').style.display = ui.state.story ? '' : 'none'; });
  $pm.addEventListener('click', e => {
    const b = e.target.closest('[data-pm]'); if (!b) { if (e.target === $pm) closePause(); return; }
    if (b.dataset.pm === 'resume') closePause();
    else if (b.dataset.pm === 'settings') { closePause(); document.getElementById('setBtn').click(); }
    else if (b.dataset.pm === 'chronicle') { closePause(); VM.StoryUI.chronicle(); }
    else { $pm.classList.remove('on'); exitToMenu(); }
  });
  addEventListener('keydown', e => {
    if (!ui.running) return;
    if (e.key === ' ') { ui.speed = ui.speed === 0 ? 1 : 0; e.preventDefault(); }
    else if (e.key === '1') ui.speed = 1;
    else if (e.key === 'Escape') { if ($pm.classList.contains('on')) closePause(); else if (ui.fieldView !== null) ui.closeField(); else if (ui.cityView !== null) ui.closeCity(); else { ui.selectedArmy = null; ui.selectedCity = -1; } }
  });

  VM.MapView.init(document.getElementById('map'), ui, document.getElementById('map3d'));
  document.getElementById('mapctl').addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (b) VM.MapView.control(b.dataset.mc); });
  VM.City3D.init(document.getElementById('city3d'), ui); VM.Field3D.init(document.getElementById('field3d'), ui); document.getElementById('fbBack').addEventListener('click', () => ui.closeField());
  VM.UIPrefs.apply(); VM.I18N.start();
  VM.Panels.init(ui); VM.StoryUI.init(ui); VM.DoctrineUI.init(ui); VM.Walk.init(ui); VM.DiploUI.init(ui); VM.Tips.init(); VM.Alerts.init(ui); VM.Sheets.init(ui); VM.Tutorial.init(ui); VM.Title.init(ui);
  addEventListener('pointerdown', () => VM.Audio.init(), { once: true }); addEventListener('keydown', () => VM.Audio.init(), { once: true });
  document.getElementById('hud').style.visibility = 'hidden';
  VM.Title.roll(false); VM.Title.show();
  window.__vm = ui;     // test hook
  requestAnimationFrame(frame);
})();
