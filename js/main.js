// Boot and main loop. Owns the UI state shared by the map, panels and title screen.
(function () {
  const ui = {
    state: null, sheet: null, speed: 1, running: false, selectedCity: -1, selectedArmy: null, lastEvent: 0, lastSave: 0,
    setState(s) { ui.overShown = false; document.getElementById('over').classList.remove('on'); ui.state = s; ui.selectedCity = -1; ui.selectedArmy = null; ui.lastEvent = s.nextEvent || 0; ui.sheet = null; if (VM.Alerts) VM.Alerts.reset(); ui.lastSave = Math.floor(s.time / 30); },
    start() { document.getElementById('hud').style.visibility = 'visible'; ui.running = true; ui.speed = 1; VM.MapView.centerOn(ui.state.factions[ui.state.player].capital); },
    centerOn(id) { VM.MapView.centerOn(id); },
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
      if (!r.ok) VM.Panels.toast(r.reason.charAt(0).toUpperCase() + r.reason.slice(1));
    }
  };
  window.VMUI = ui;

  function save() { try { localStorage.setItem('vexmarch.save', VM.Sim.save(ui.state)); } catch (e) { /* saving is optional */ } }

  function overlay() {
    const st = ui.state, nm = id => st.factions[id].name;
    if (st.over && !ui.overShown) {
      ui.overShown = true;
      const o = document.getElementById('over'); o.classList.toggle('lose', st.over.type === 'lose'); o.classList.add('on');
      document.getElementById('overT').textContent = st.over.type === 'win' ? 'Victory' : 'Defeat';
      document.getElementById('overP').textContent = st.over.type === 'win' ? `All of the realm marches under your banner. It took ${Math.round(st.over.t)} days.` : `${nm(st.player)} holds no nodes. Start again and do better.`;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000; last = now;
    if (ui.running) {
      VM.Sim.update(ui.state, dt, ui.speed);
      VM.Alerts.process(); overlay();
      const m = Math.floor(ui.state.time / 30); if (m !== ui.lastSave && !ui.state.over) { ui.lastSave = m; save(); }
    }
    VM.MapView.render();
    if (ui.running) { VM.Panels.update(); VM.Sheets.update(); }
    requestAnimationFrame(frame);
  }

  document.getElementById('overBtn').addEventListener('click', () => { document.getElementById('over').classList.remove('on'); ui.running = false; document.getElementById('hud').style.visibility = 'hidden'; try { localStorage.removeItem('vexmarch.save'); } catch (e) { /* ignore */ } VM.Title.roll(false); VM.Title.show(); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => { ui.speed = +b.dataset.s; }));
  const $menu = document.getElementById('menuBtn');
  $menu.addEventListener('click', () => { save(); ui.running = false; ui.sheet = null; document.getElementById('sheet').classList.remove('open'); ui.selectedArmy = null; ui.selectedCity = -1; document.getElementById('panel').classList.remove('open'); document.getElementById('hud').style.visibility = 'hidden'; VM.Title.show(); });
  addEventListener('keydown', e => {
    if (!ui.running) return;
    if (e.key === ' ') { ui.speed = ui.speed === 0 ? 1 : 0; e.preventDefault(); }
    else if (e.key === '1') ui.speed = 1; else if (e.key === '2') ui.speed = 2; else if (e.key === '3') ui.speed = 4;
    else if (e.key === 'Escape') { ui.selectedArmy = null; ui.selectedCity = -1; }
  });

  VM.MapView.init(document.getElementById('map'), ui);
  VM.Panels.init(ui); VM.Alerts.init(ui); VM.Sheets.init(ui); VM.Title.init(ui);
  document.getElementById('hud').style.visibility = 'hidden';
  VM.Title.roll(false); VM.Title.show();
  window.__vm = ui;     // test hook
  requestAnimationFrame(frame);
})();
