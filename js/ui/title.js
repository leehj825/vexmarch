// Title screen: pick your faction (the map behind it previews where they start), re-roll the world, or continue a saved game.
var VM = globalThis.VM = globalThis.VM || {};

VM.Title = (function () {
  let ui, box, count = 5, seed = 1, difficulty = 'normal', fog = false;
  const $ = id => document.getElementById(id);
  const hasSave = () => { try { return !!localStorage.getItem('vexmarch.save'); } catch (e) { return false; } };

  function roll(keepSeed) {
    if (!keepSeed) seed = (Math.random() * 65535 | 0) + 1;
    const player = ui.state ? ui.state.player : 1;
    ui.setState(VM.Sim.create({ seed, factions: count, player: Math.min(player, count), ai: true, difficulty }));
    VM.Fog.setOn(ui.state, fog);
    VM.MapView.fit(); render();
  }

  function render() {
    const st = ui.state;
    $('facList').innerHTML = st.factions.filter(f => !f.neutral).map(f => {
      const cap = st.map.nodes[f.capital].name, n = st.cities.filter(c => c.owner === f.id).length;
      return `<button class="fac${f.id === st.player ? ' on' : ''}" data-f="${f.id}"><span class="dot" style="background:${f.color}"></span><b>${f.name}</b><small>capital ${cap} · ${n} nodes</small></button>`;
    }).join('');
    document.querySelectorAll('#countSel button').forEach(b => b.classList.toggle('on', +b.dataset.n === count));
    $('fogBtn').classList.toggle('on', fog); $('fogBtn').textContent = fog ? 'Fog of war: on' : 'Fog of war: off';
    document.querySelectorAll('#diffSel button').forEach(b => b.classList.toggle('on', b.dataset.d === difficulty));
    $('contBtn').style.display = hasSave() ? '' : 'none';
  }

  function init(uiRef) {
    ui = uiRef; box = $('title');
    $('facList').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { ui.state.player = +b.dataset.f; render(); } });
    $('countSel').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) { count = +b.dataset.n; roll(false); } });
    $('diffSel').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { difficulty = b.dataset.d; ui.state.difficulty = difficulty; render(); } });
    $('fogBtn').addEventListener('click', () => { fog = !fog; VM.Fog.setOn(ui.state, fog); render(); });
    $('rerollBtn').addEventListener('click', () => roll(false));
    $('setTitleBtn').addEventListener('click', () => { ui.sheet = ui.sheet === 'settings' ? null : 'settings'; VM.Sheets.update(); });
    $('campBtn').addEventListener('click', showCampaign);
    $('campBack').addEventListener('click', () => { $('campaign').classList.remove('on'); box.classList.add('on'); });
    $('campList').addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) { house = +b.dataset.h; preview(); campRender(); } });
    $('campGo').addEventListener('click', beginCampaign);
    $('startBtn').addEventListener('click', () => { if (ui.state.story) roll(true); VM.Audio.init(); VM.Audio.play('horn'); box.classList.remove('on'); ui.state.aiOn = true; ui.start(); });
    $('tutBtn').addEventListener('click', () => { VM.Audio.init(); startTutorial(); });
    $('contBtn').addEventListener('click', () => {
      try { const saved = VM.Sim.load(localStorage.getItem('vexmarch.save')); if (saved.version !== VM.CFG.VERSION || saved.over) throw new Error('old or finished save'); if (saved.tutorial) saved.aiOn = true; ui.setState(saved); VM.MapView.fit(); box.classList.remove('on'); VM.Audio.init(); ui.start(); }
      catch (e) { VM.Panels.toast('Saved game could not be loaded'); }
    });
  }

  function startTutorial() {
    VM.Tutorial.finish(false);
    ui.setState(VM.Tutorial.createWorld()); VM.MapView.fit(); box.classList.remove('on'); ui.start(); VM.Tutorial.begin();
  }

  // ---- the campaign: choose a house, read who they are, begin ----
  let house = 1;
  function showCampaign() {
    box.classList.remove('on'); $('campaign').classList.add('on'); preview(); campRender();
  }
  function preview() { ui.setState(VM.Story.create({ player: house, difficulty })); VM.MapView.fit(); }
  function campRender() {
    const D = VM.StoryData, tx = VM.Story.tx, ko = VM.Story.lang() === 'ko', nm = id => tx({ en: VM.CFG.FACTIONS[id].name, ko: VM.Story.koOf(VM.CFG.FACTIONS[id].name) });
    $('campTag').textContent = tx(D.HISTORY.intro[2]);
    $('campList').innerHTML = D.FACTIONS.map(f => `<button class="fac${f.id === house ? ' on' : ''}" data-h="${f.id}"><span class="dot" style="background:${VM.CFG.FACTIONS[f.id].color}"></span><b>${nm(f.id)}</b><small>${tx(f.title)}</small></button>`).join('');
    const f = D.FACTIONS[house - 1], cast = D.OFFICERS.filter(o => o.house === house);
    $('campInfo').innerHTML = `<p><b>${tx(f.ruler)}</b> · ${tx(f.title)}</p><p>${tx(f.creed)}</p><p class="dim">${ko ? '상처' : 'The wound'}: ${tx(f.wound)}</p><p class="dim">${ko ? '위험' : 'The danger'}: ${tx(f.danger)}</p>` +
      `<p><b>${ko ? '특성' : 'Gift'}: ${tx(D.TRAITS[house].name)}</b> · ${tx(D.TRAITS[house].text)}</p><p><b>${ko ? '고유 승리' : 'Own victory'}: ${tx(D.VICTORIES[house].name)}</b> · ${tx(D.VICTORIES[house].text)}</p>` +
      `<p class="dim">${ko ? '장수' : 'Officers'}: ${cast.map(o => (ko ? o.ko : o.name) + ' (' + tx(o.role) + ')').join(' · ')}</p>`;
    if (VM.I18N && VM.I18N.flush) VM.I18N.flush();
  }
  function beginCampaign() {
    VM.Audio.init(); VM.Audio.play('horn');
    ui.setState(VM.Story.create({ player: house, difficulty })); VM.Fog.setOn(ui.state, fog); VM.MapView.fit(); $('campaign').classList.remove('on'); ui.start();
  }

  function show() { if (ui.state && ui.state.story) roll(false); box.classList.add('on'); render(); $('tutBtn').classList.toggle('pulse', !VM.Tutorial.done()); }

  return { init, show, roll, startTutorial };
})();
