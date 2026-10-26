// The story pages: the history and the opening scene of a campaign, the beats as they fire, the ending, and the chronicle. The game waits while a page is open.
var VM = globalThis.VM = globalThis.VM || {};

VM.StoryUI = (function () {
  let ui, box, titleEl, bodyEl, btn, showing = null, mode = null, prevSpeed = 1;
  const $ = id => document.getElementById(id);
  const tx = t => VM.Story.tx(t);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const para = s => `<p>${esc(s)}</p>`;

  function init(uiRef) {
    ui = uiRef; box = $('story'); titleEl = $('storyT'); bodyEl = $('storyB'); btn = $('storyBtn');
    btn.addEventListener('click', close);
  }

  function historyHTML() {
    const D = VM.StoryData; let h = D.HISTORY.intro.map(t => para(tx(t))).join('');
    h += '<div class="lbl">' + esc(VM.Story.lang() === 'ko' ? '연표' : 'Timeline') + '</div><ul class="tl">' + D.HISTORY.timeline.map(([y, t]) => `<li><b>${y > 0 ? (VM.Story.lang() === 'ko' ? y + '년' : 'Year ' + y) : (VM.Story.lang() === 'ko' ? (y === 0 ? '0년' : '기원전 ' + (-y) + '년') : (y === 0 ? 'Year 0' : (-y) + ' years before'))}</b> ${esc(tx(t))}</li>`).join('') + '</ul>';
    return h;
  }

  function open(title, html, label) {
    titleEl.textContent = title; bodyEl.innerHTML = html; btn.textContent = label || 'Continue'; box.classList.add('on'); bodyEl.scrollTop = 0;
    if (VM.I18N && VM.I18N.flush) VM.I18N.flush();
  }

  // called every frame: show the next page of the story, if there is one
  function update() {
    const st = ui.state; if (!st || !st.story || !ui.running || showing || mode) return;
    const q = st.story.queue; if (!q.length) return;
    showing = q[0]; prevSpeed = ui.speed || prevSpeed; ui.speed = 0; mode = 'beat';
    const it = showing;
    if (it.intro) open(tx(it.title), historyHTML(), 'Continue');
    else open(tx(it.title), tx(it.text).split('\n').map(para).join(''), it.ending ? 'Main menu' : 'Continue');
    box.classList.toggle('end', !!it.ending);
  }

  function close() {
    box.classList.remove('on'); box.classList.remove('end');
    if (mode === 'beat') {
      const st = ui.state, it = showing; st.story.queue.shift(); showing = null; mode = null;
      if (it && it.ending) { ui.exitToMenu(); return; }
      if (!st.story.queue.length) ui.speed = prevSpeed || 1;
    } else if (mode === 'chronicle') { mode = null; ui.speed = prevSpeed || 1; }
  }

  // the chronicle: everything that happened, newest first
  function chronicle() {
    const st = ui.state; if (!st || !st.story || mode) return;
    prevSpeed = ui.speed || prevSpeed; ui.speed = 0; mode = 'chronicle';
    const ko = VM.Story.lang() === 'ko', rows = st.story.chronicle.slice().reverse().map(c => {
      const d = VM.Sim.date({ time: c.t }); return `<div class="chr"><span class="dim">${ko ? d.year + '년 ' + d.month + '월 ' + d.day + '일' : 'Y' + d.year + ' M' + d.month + ' D' + d.day}</span> ${esc(tx(c))}</div>`;
    });
    const D = VM.StoryData, me = st.player, V = D.VICTORIES[me], v = VM.Story.victoryView(st, me), T = D.TRAITS[me];
    const part = p => p.label ? `${tx(p.label)} ${p.done ? '✔' : '✘'}` : p.allies ? `${ko ? '동맹' : 'Allies'} ${p.have}/${p.of}` : p.spec ? `${p.spec} ${p.have}/${p.of}` : `${ko ? '지배 지역' : 'Places'} ${p.have}/${p.of}`;
    const goal = `<div class="chr"><b>${esc(tx(T.name))}</b>: ${esc(tx(T.text))}</div><div class="chr"><b>${esc(tx(V.name))}</b>: ${esc(tx(V.text))}<br>${esc(v.parts.map(part).join(' · '))} · ${ko ? '유지' : 'Held'} ${v.held}/${v.days}</div>`;
    open(ko ? '연대기' : 'Chronicle', goal + (rows.length ? rows.join('') : para(ko ? '아직 기록할 일이 없다.' : 'Nothing has happened yet.')), 'Close');
  }

  return { init, update, chronicle, isOpen: () => !!mode };
})();
