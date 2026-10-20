// Boot and main loop. Owns the UI state shared by the map, panels and title screen.
(function () {
  const ui = {
    state: null, speed: 1, running: false, selectedCity: -1, selectedArmy: null, lastEvent: 0, lastSave: 0,
    setState(s) { ui.overShown = false; document.getElementById('over').classList.remove('on'); ui.state = s; ui.selectedCity = -1; ui.selectedArmy = null; ui.lastEvent = s.nextEvent || 0; ui.lastSave = Math.floor(s.time / 30); },
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

  function toasts() {
    const st = ui.state, me = st.player, N = st.map.nodes, nm = id => st.factions[id].name;
    for (const ev of st.events) {
      if (ev.n <= ui.lastEvent) continue;
      ui.lastEvent = ev.n;
      const mine = ev.owner === me;
      switch (ev.type) {
        case 'built': if (mine) VM.Panels.toast(`${VM.CFG.BUILD[ev.building].label} Lv${ev.level} finished in ${N[ev.city].name}`); break;
        case 'starving': if (mine) VM.Panels.toast('Your people are starving! Build farms or reduce your armies.'); break;
        case 'battle': if (mine || ev.enemy === me) VM.Panels.toast(`Battle near ${N[ev.at].name}: ${nm(ev.owner)} against ${nm(ev.enemy)}`); break;
        case 'rout': if (mine) VM.Panels.toast(`Your army broke near ${N[ev.at].name} and is fleeing!`); else if (st.armies.some(a => a.id === ev.army) && VM.War) VM.Panels.toast(`${nm(ev.owner)}'s army routed near ${N[ev.at].name}`); break;
        case 'destroyed': if (mine) VM.Panels.toast(`Your army was destroyed near ${N[ev.at].name}`); break;
        case 'captured':
          if (ev.from === me) VM.Panels.toast(`${N[ev.city].name} has fallen to ${nm(ev.owner)}!`);
          else if (ev.owner === me) VM.Panels.toast(`${N[ev.city].name} captured!`);
          break;
        case 'cut': if (mine) VM.Panels.toast('An army of yours has been cut off from supply!'); break;
        case 'officerCaptured': if (mine) VM.Panels.toast(`${st.officers[ev.officer].name} was captured and joins you`); else if (ev.from === me) VM.Panels.toast(`${st.officers[ev.officer].name} was captured by ${nm(ev.owner)}`); break;
        case 'officerDied': if (ev.owner === me) VM.Panels.toast(`${st.officers[ev.officer].name} fell in battle`); break;
        case 'eliminated': if (!mine) VM.Panels.toast(`${nm(ev.owner)} has been destroyed`); break;
      }
    }
    if (st.over && !ui.overShown) {
      ui.overShown = true;
      const o = document.getElementById('over'); o.classList.toggle('lose', st.over.type === 'lose'); o.classList.add('on');
      document.getElementById('overT').textContent = st.over.type === 'win' ? 'Victory' : 'Defeat';
      document.getElementById('overP').textContent = st.over.type === 'win' ? `All of the realm marches under your banner. It took ${Math.round(st.over.t)} days.` : `${nm(me)} holds no nodes. Start again and do better.`;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000; last = now;
    if (ui.running) {
      VM.Sim.update(ui.state, dt, ui.speed);
      toasts();
      const m = Math.floor(ui.state.time / 30); if (m !== ui.lastSave && !ui.state.over) { ui.lastSave = m; save(); }
    }
    VM.MapView.render();
    if (ui.running) VM.Panels.update();
    requestAnimationFrame(frame);
  }

  document.getElementById('overBtn').addEventListener('click', () => { document.getElementById('over').classList.remove('on'); ui.running = false; document.getElementById('hud').style.visibility = 'hidden'; try { localStorage.removeItem('vexmarch.save'); } catch (e) { /* ignore */ } VM.Title.roll(false); VM.Title.show(); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => { ui.speed = +b.dataset.s; }));
  const $menu = document.getElementById('menuBtn');
  $menu.addEventListener('click', () => { save(); ui.running = false; ui.selectedArmy = null; ui.selectedCity = -1; document.getElementById('panel').classList.remove('open'); document.getElementById('hud').style.visibility = 'hidden'; VM.Title.show(); });
  addEventListener('keydown', e => {
    if (!ui.running) return;
    if (e.key === ' ') { ui.speed = ui.speed === 0 ? 1 : 0; e.preventDefault(); }
    else if (e.key === '1') ui.speed = 1; else if (e.key === '2') ui.speed = 2; else if (e.key === '3') ui.speed = 4;
    else if (e.key === 'Escape') { ui.selectedArmy = null; ui.selectedCity = -1; }
  });

  VM.MapView.init(document.getElementById('map'), ui);
  VM.Panels.init(ui); VM.Title.init(ui);
  document.getElementById('hud').style.visibility = 'hidden';
  VM.Title.roll(false); VM.Title.show();
  window.__vm = ui;     // test hook
  requestAnimationFrame(frame);
})();
