// Boot and main loop. Owns the UI state shared by the map, panels and title screen.
(function () {
  const ui = {
    state: null, sheet: null, speed: 1, running: false, selectedCity: -1, selectedArmy: null, lastEvent: 0, lastSave: 0,
    draft: null,
    setState(s) { ui.draft = null; ui.overShown = false; document.getElementById('over').classList.remove('on'); ui.state = s; ui.selectedCity = -1; ui.selectedArmy = null; ui.lastEvent = s.nextEvent || 0; ui.sheet = null; if (VM.Alerts) VM.Alerts.reset(); ui.lastSave = Math.floor(s.time / 30); },
    start() { document.body.classList.remove('titlemode'); document.getElementById('hud').style.visibility = 'visible'; ui.running = true; ui.speed = 1; VM.MapView.centerOn(ui.state.factions[ui.state.player].capital); },
    centerOn(id) { VM.MapView.centerOn(id); },
    cityView: null,
    openCity(id) {
      if (!VM.City3D.open(id)) { VM.Panels.toast('The 3D view is not available on this device'); VM.Audio.play('error'); return; }
      ui.cityView = id; ui.speed = 1; document.body.classList.add('in3d'); VM.Audio.play('pick');      // the 2x and 4x speeds are for testing: inside a city time runs at normal speed
    },
    closeCity() { if (ui.cityView === null) return; VM.City3D.close(); ui.cityView = null; document.body.classList.remove('in3d'); if (VM.MapTerrain) VM.MapTerrain.markDirty(); },
    onTap(h) {
      if (!ui.running) return;
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
      document.getElementById('overT').textContent = st.over.type === 'win' ? 'Victory' : 'Defeat';
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
      VM.Sim.update(ui.state, dt, ui.speed);
      VM.Alerts.process(); overlay(); VM.Tutorial.update(); moodTick(dt);
      const m = Math.floor(ui.state.time / 30); if (m !== ui.lastSave && !ui.state.over) { ui.lastSave = m; save(); }
    }
    if (ui.cityView !== null) { VM.City3D.frame(dt); const tb = document.getElementById('top').getBoundingClientRect().bottom; if (tb !== ui.topBottom) { ui.topBottom = tb; document.documentElement.style.setProperty('--topb', tb + 'px'); } }      // the Back button sits under the top bar, however many rows it wraps to
    else VM.MapView.render();
    if (ui.running) { VM.Panels.update(); VM.Sheets.update(); }
  }
  // One broken frame must never stop the game: the next frame is always scheduled, and an error is reported once instead of freezing everything
  let errShown = false;
  function frame(now) {
    try { step(now); } catch (e) { if (!errShown) { errShown = true; console.error('frame error', e); } }
    requestAnimationFrame(frame);
  }

  document.getElementById('overBtn').addEventListener('click', () => { document.getElementById('over').classList.remove('on'); ui.closeCity(); ui.running = false; document.getElementById('hud').style.visibility = 'hidden'; document.body.classList.add('titlemode'); try { localStorage.removeItem('vexmarch.save'); } catch (e) { /* ignore */ } VM.Title.roll(false); VM.Title.show(); });
  document.querySelectorAll('#speed button[data-s]').forEach(b => b.addEventListener('click', () => { ui.speed = +b.dataset.s; VM.Audio.play('click'); }));
  const $menu = document.getElementById('menuBtn');
  const exitToMenu = () => { save(); ui.closeCity(); ui.running = false; ui.sheet = null; document.getElementById('sheet').classList.remove('open'); ui.selectedArmy = null; ui.selectedCity = -1; document.getElementById('panel').classList.remove('open'); document.getElementById('hud').style.visibility = 'hidden'; document.body.classList.add('titlemode'); VM.Tutorial.finish(false); VM.Title.show(); };
  // The menu button pauses the game and offers Resume, Settings and Save and exit (the exit used to be the button itself)
  const $pm = document.getElementById('pauseMenu');
  const closePause = () => { if (!$pm.classList.contains('on')) return; $pm.classList.remove('on'); ui.speed = ui.prevSpeed === undefined ? 1 : ui.prevSpeed; };
  $menu.addEventListener('click', () => { if (!ui.running || $pm.classList.contains('on')) return; ui.prevSpeed = ui.speed; ui.speed = 0; $pm.classList.add('on'); });
  $pm.addEventListener('click', e => {
    const b = e.target.closest('[data-pm]'); if (!b) { if (e.target === $pm) closePause(); return; }
    if (b.dataset.pm === 'resume') closePause();
    else if (b.dataset.pm === 'settings') { closePause(); document.getElementById('setBtn').click(); }
    else { $pm.classList.remove('on'); exitToMenu(); }
  });
  addEventListener('keydown', e => {
    if (!ui.running) return;
    if (e.key === ' ') { ui.speed = ui.speed === 0 ? 1 : 0; e.preventDefault(); }
    else if (e.key === '1') ui.speed = 1; else if (e.key === '2') ui.speed = 2; else if (e.key === '3') ui.speed = 4;
    else if (e.key === 'Escape') { if ($pm.classList.contains('on')) closePause(); else if (ui.cityView !== null) ui.closeCity(); else { ui.selectedArmy = null; ui.selectedCity = -1; } }
  });

  VM.MapView.init(document.getElementById('map'), ui, document.getElementById('map3d'));
  document.getElementById('mapctl').addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (b) VM.MapView.control(b.dataset.mc); });
  VM.City3D.init(document.getElementById('city3d'), ui);
  VM.UIPrefs.apply(); VM.I18N.start();
  VM.Panels.init(ui); VM.Alerts.init(ui); VM.Sheets.init(ui); VM.Tutorial.init(ui); VM.Title.init(ui);
  addEventListener('pointerdown', () => VM.Audio.init(), { once: true }); addEventListener('keydown', () => VM.Audio.init(), { once: true });
  document.getElementById('hud').style.visibility = 'hidden';
  VM.Title.roll(false); VM.Title.show();
  window.__vm = ui;     // test hook
  requestAnimationFrame(frame);
})();
