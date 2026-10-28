// Save slots (browser storage, so it lives with the UI): three named places besides the autosave ("Continue"). A slot holds the same save as the autosave, and a short label (the house, the
// day, the scenario) kept beside it so the list can be shown without loading anything. Plain localStorage; every access is guarded (a blocked store just means no slots).
var VM = globalThis.VM = globalThis.VM || {};

VM.Slots = (function () {
  const N = 3, key = n => 'vexmarch.slot' + n, metaKey = n => 'vexmarch.slot' + n + '.meta';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const drop = k => { try { localStorage.removeItem(k); } catch (e) { /* none */ } };
  function meta(n) { const m = get(metaKey(n)); if (!m) return null; try { return JSON.parse(m); } catch (e) { return null; } }
  function label(state) {
    const f = state.factions[state.player];
    return { house: f ? f.name : '?', day: Math.floor(state.time), year: VM.Sim.date(state).year, campaign: !!state.story, saved: Date.now() };
  }
  function save(state, n) {
    if (n < 1 || n > N) return { ok: false, reason: 'no such slot' };
    if (!put(key(n), VM.Sim.save(state))) return { ok: false, reason: 'the device would not store it' };
    put(metaKey(n), JSON.stringify(label(state)));
    return { ok: true };
  }
  function load(n) {
    const s = get(key(n)); if (!s) return { ok: false, reason: 'the slot is empty' };
    try { const st = VM.Sim.load(s); if (st.version !== VM.CFG.VERSION) return { ok: false, reason: 'an older game' }; if (st.over) return { ok: false, reason: 'a finished game' }; return { ok: true, state: st }; }
    catch (e) { return { ok: false, reason: 'the slot could not be read' }; }
  }
  function remove(n) { drop(key(n)); drop(metaKey(n)); return { ok: true }; }
  const list = () => { const out = []; for (let n = 1; n <= N; n++) out.push({ n, meta: meta(n), has: !!get(key(n)) }); return out; };
  return { N, save, load, remove, list, meta };
})();

// The slot page: in 'save' mode it saves the game to a slot (asks before overwriting); in 'load' mode it loads one or deletes it. It uses the story page box.
VM.SlotsUI = (function () {
  let ui, mode = null, confirm = null, prevSpeed = 1;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const when = t => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  function init(uiRef) {
    ui = uiRef;
    $('storyBtn').addEventListener('click', () => { if (mode) close(); });
    $('storyB').addEventListener('click', e => {
      const b = e.target.closest('[data-slot]'); if (!b) return;
      const n = +b.dataset.slot, act = b.dataset.act;
      if (act === 'save') {
        const occupied = VM.Slots.meta(n) || VM.Slots.load(n).ok;
        if (occupied && confirm !== n) { confirm = n; render(); return; }
        confirm = null; const r = VM.Slots.save(ui.state, n);
        VM.Panels.toast(r.ok ? 'Game saved to slot ' + n : 'Could not save: ' + r.reason); close();
      } else if (act === 'load') {
        const r = VM.Slots.load(n); if (!r.ok) { VM.Panels.toast('Slot ' + n + ': ' + r.reason); return; }
        close(); $('title').classList.remove('on'); ui.setState(r.state); VM.MapView.fit(); VM.Audio.init(); ui.start();
      } else if (act === 'delete') {
        if (confirm !== n) { confirm = n; render(); return; }
        confirm = null; VM.Slots.remove(n); VM.Panels.toast('Slot ' + n + ' deleted'); render();
      }
    });
  }
  function rows() {
    return VM.Slots.list().map(x => {
      const m = x.meta, info = m ? `${esc(m.house)} · ${m.campaign ? 'campaign' : 'skirmish'} · year ${m.year}, day ${m.day} · <span class="dim">${when(m.saved)}</span>` : (x.has ? 'Saved game' : '<span class="dim">Empty</span>');
      const ask = confirm === x.n;
      const btns = mode === 'save'
        ? `<button class="go" data-slot="${x.n}" data-act="save">${ask ? 'Really overwrite?' : (x.has ? 'Overwrite' : 'Save here')}</button>`
        : `${x.has ? `<button class="go" data-slot="${x.n}" data-act="load">Load</button><button data-slot="${x.n}" data-act="delete">${ask ? 'Really delete?' : 'Delete'}</button>` : ''}`;
      return `<div class="card2"><div class="ir"><b>Slot ${x.n}</b></div><div class="ir">${info}</div><div class="btns" style="justify-content:flex-start">${btns}</div></div>`;
    }).join('');
  }
  function render() { $('storyB').innerHTML = rows(); if (VM.I18N && VM.I18N.flush) VM.I18N.flush(); }
  function open(m) {
    if (VM.StoryUI && VM.StoryUI.isOpen()) return;
    mode = m; confirm = null; prevSpeed = ui.speed || prevSpeed; if (ui.running) ui.speed = 0;
    $('storyT').textContent = m === 'save' ? 'Save to a slot' : 'Saved games';
    $('storyBtn').textContent = 'Close'; $('storyBtn').style.display = ''; render(); $('story').classList.add('on');
  }
  function close() { mode = null; confirm = null; $('story').classList.remove('on'); if (ui.running && !(VM.StoryUI && VM.StoryUI.isOpen())) ui.speed = prevSpeed || 1; }
  return { init, open, close, isOpen: () => !!mode };
})();
