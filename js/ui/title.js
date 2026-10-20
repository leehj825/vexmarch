// Title screen: pick your faction (the map behind it previews where they start), re-roll the world, or continue a saved game.
var VM = globalThis.VM = globalThis.VM || {};

VM.Title = (function () {
  let ui, box, count = 5, seed = 1;
  const $ = id => document.getElementById(id);
  const hasSave = () => { try { return !!localStorage.getItem('vexmarch.save'); } catch (e) { return false; } };

  function roll(keepSeed) {
    if (!keepSeed) seed = (Math.random() * 65535 | 0) + 1;
    const player = ui.state ? ui.state.player : 1;
    ui.setState(VM.Sim.create({ seed, factions: count, player: Math.min(player, count) }));
    VM.MapView.fit(); render();
  }

  function render() {
    const st = ui.state;
    $('facList').innerHTML = st.factions.filter(f => !f.neutral).map(f => {
      const cap = st.map.nodes[f.capital].name, n = st.cities.filter(c => c.owner === f.id).length;
      return `<button class="fac${f.id === st.player ? ' on' : ''}" data-f="${f.id}"><span class="dot" style="background:${f.color}"></span><b>${f.name}</b><small>capital ${cap} · ${n} nodes</small></button>`;
    }).join('');
    document.querySelectorAll('#countSel button').forEach(b => b.classList.toggle('on', +b.dataset.n === count));
    $('contBtn').style.display = hasSave() ? '' : 'none';
  }

  function init(uiRef) {
    ui = uiRef; box = $('title');
    $('facList').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { ui.state.player = +b.dataset.f; render(); } });
    $('countSel').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) { count = +b.dataset.n; roll(false); } });
    $('rerollBtn').addEventListener('click', () => roll(false));
    $('startBtn').addEventListener('click', () => { box.classList.remove('on'); ui.start(); });
    $('contBtn').addEventListener('click', () => {
      try { const saved = VM.Sim.load(localStorage.getItem('vexmarch.save')); if (saved.version !== VM.CFG.VERSION || saved.over) throw new Error('old or finished save'); ui.setState(saved); VM.MapView.fit(); box.classList.remove('on'); ui.start(); }
      catch (e) { VM.Panels.toast('Saved game could not be loaded'); }
    });
  }

  function show() { box.classList.add('on'); render(); }

  return { init, show, roll };
})();
