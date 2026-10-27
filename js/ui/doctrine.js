// The doctrine choice: when the player's house is offered doctrines, the game pauses and a page shows the three; choosing one closes it and the game goes on.
// It uses the story page box (#story), and only when no story page is open.
var VM = globalThis.VM = globalThis.VM || {};

VM.DoctrineUI = (function () {
  let ui, showing = false, prev = 1;
  const $ = id => document.getElementById(id);
  const tx = t => VM.Story ? VM.Story.tx(t) : t.en;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const offer = st => { const r = st.factions[st.player] && st.factions[st.player].doctrine; return r && r.offer ? r.offer : null; };

  function init(uiRef) {
    ui = uiRef;
    $('storyB').addEventListener('click', e => {
      const b = e.target.closest('[data-doc]'); if (!b) return;
      const r = VM.Commands.exec(ui.state, { type: 'chooseDoctrine', faction: ui.state.player, id: b.dataset.doc });
      if (r.ok) { close(); VM.Panels.toast('Doctrine adopted: ' + tx(VM.Doctrine.LIST[b.dataset.doc].name)); }
    });
  }
  function open(list) {
    showing = true; prev = ui.speed || prev; ui.speed = 0;
    $('storyT').textContent = VM.Story && VM.Story.lang() === 'ko' ? '새 교리' : 'A new doctrine';
    $('storyB').innerHTML = `<p>${esc(VM.Story && VM.Story.lang() === 'ko' ? '이번 해의 교리를 고르세요. 하나를 고르면 평생 남습니다.' : 'Choose this year\'s doctrine. It stays with the house for good.')}</p>` +
      list.map(id => { const d = VM.Doctrine.LIST[id]; return `<button class="go" data-doc="${id}" style="display:block;width:100%;text-align:left;margin:6px 0">${esc(tx(d.name))}<br><small>${esc(tx(d.text))}</small></button>`; }).join('');
    $('storyBtn').style.display = 'none'; $('story').classList.add('on');
    if (VM.I18N && VM.I18N.flush) VM.I18N.flush();
  }
  function close() { showing = false; $('story').classList.remove('on'); $('storyBtn').style.display = ''; ui.speed = prev || 1; }
  // every frame: show the offer when it is there and nothing else is on the page
  function update() {
    const st = ui.state; if (!st || !ui.running || st.over) { if (showing) close(); return; }
    if (showing && (VM.StoryUI.isOpen() || !$('story').classList.contains('on'))) showing = false;      // a story page took the box: it goes first, the offer comes back after it
    const list = offer(st);
    if (list && !showing && !VM.StoryUI.isOpen() && !$('story').classList.contains('on')) open(list);
    if (!list && showing) close();
  }
  return { init, update, isOpen: () => showing };
})();
