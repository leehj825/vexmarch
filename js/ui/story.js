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
    bodyEl.addEventListener('click', e => { const b = e.target.closest('[data-choice]'); if (b) choose(+b.dataset.choice); });
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

  // a decision: the text, then one button per choice; after the pick, what came of it
  function page(it) {
    let h = tx(it.text).split('\n').map(para).join('');
    if (it.chosen !== undefined) return h + `<p class="chr"><b>${esc(tx(it.choices[it.chosen].label))}</b></p>` + para(tx(it.choices[it.chosen].result));
    return h + '<div class="btns" id="storyChoices">' + it.choices.map((c, i) => `<button class="go" data-choice="${i}">${esc(tx(c.label))}</button>`).join('') + '</div>';
  }
  function choose(i) {
    const st = ui.state, it = showing; if (!it || !it.choices || it.chosen !== undefined) return;
    const r = VM.Commands.exec(st, { type: 'storyChoice', faction: st.player, choice: i }); if (!r.ok) return;
    bodyEl.innerHTML = page(it); btn.style.display = ''; bodyEl.scrollTop = 0;
    if (VM.I18N && VM.I18N.flush) VM.I18N.flush();
  }

  // called every frame: show the next page of the story, if there is one
  function update() {
    const st = ui.state; if (!st || !st.story || !ui.running || showing || mode) return;
    const q = st.story.queue; if (!q.length) return;
    showing = q[0]; prevSpeed = ui.speed || prevSpeed; ui.speed = 0; mode = 'beat';
    const it = showing;
    if (it.intro) open(tx(it.title), historyHTML(), 'Continue');
    else if (it.choices) { open(tx(it.title), page(it), 'Continue'); btn.style.display = it.chosen === undefined ? 'none' : ''; }
    else open(tx(it.title), tx(it.text).split('\n').map(para).join(''), it.ending ? 'Main menu' : 'Continue');
    box.classList.toggle('end', !!it.ending);
  }

  function close() {
    box.classList.remove('on'); box.classList.remove('end'); btn.style.display = '';
    if (mode === 'beat') {
      const st = ui.state, it = showing; st.story.queue.shift(); showing = null; mode = null;
      if (it && it.ending) { ui.exitToMenu(); return; }
      if (!st.story.queue.length) ui.speed = prevSpeed || 1;
    } else if (mode === 'chronicle') { mode = null; ui.speed = prevSpeed || 1; }
  }

  // the chronicle, as a history book: the year's summary, then the years in order; story notes (campaign) and every battle report, written as sentences
  function chronicle() {
    const st = ui.state; if (!st || mode) return;
    prevSpeed = ui.speed || prevSpeed; ui.speed = 0; mode = 'chronicle';
    const ko = VM.Story && VM.Story.lang() === 'ko', me = st.player, D = VM.StoryData;
    const fname = id => { const f = st.factions[id]; if (!f) return '?'; return ko && VM.Story ? VM.Story.koOf(f.name) : f.name; };
    const place = id => st.story && D && D.PLACES[id] ? (ko ? D.PLACES[id].ko : D.PLACES[id].name) : st.map.nodes[id].name;
    const side = s => `${fname(s.owner)} (${s.officer}, ${s.start})`;
    const reportText = r => {
      const [w, l] = r.sides, where = place(r.at);
      if (!w || !l) return ko ? `${where}에서 싸움이 있었다.` : `A fight at ${where}.`;
      const beaten = x => x.destroyed ? (ko ? '전멸했다' : 'was destroyed') : x.routed ? (ko ? '달아났다' : 'fled') : (ko ? '크게 꺾였다' : 'was broken');
      let res;
      if (r.outcome === 'won') { const win = r.sides.find(x => x.owner === r.winner), lose = r.sides.find(x => x.owner !== r.winner); res = ko ? `${fname(win.owner)}이(가) 벌판을 지켰고, ${fname(lose.owner)}의 군대는 ${beaten(lose)}.` : `${fname(win.owner)} held the field, and ${fname(lose.owner)}'s army ${beaten(lose)}.`; }
      else if (r.outcome === 'mutual') res = ko ? '양쪽 모두 무너졌다.' : 'Both sides were broken.';
      else res = ko ? '싸움은 양쪽이 아직 서 있는 채로 끝났다.' : 'The fight broke off with both sides still standing.';
      return ko ? `${where}에서 ${side(w)}과(와) ${side(l)}이(가) 맞붙었다. ${res}` : `At ${where}, ${side(w)} met ${side(l)}. ${res}`;
    };
    const ent = [];
    if (st.story) for (const c of st.story.chronicle) ent.push({ t: c.t, html: esc(tx(c)) });
    for (const r of st.reports || []) ent.push({ t: r.end !== undefined ? r.end : r.t, html: esc(reportText(r)), battle: true });
    ent.sort((x, y) => x.t - y.t);
    const yearOf = t => VM.Sim.date({ time: t }).year, dayOf = t => { const d = VM.Sim.date({ time: t }); return ko ? `${d.month}월 ${d.day}일` : `M${d.month} D${d.day}`; };
    const now = st.time, cy = yearOf(now), mine = st.cities.filter(c => c.owner === me).length, allies = st.diplo ? st.diplo.allies.filter(p => p.a === me || p.b === me).length : 0;
    const doct = st.factions[me] && st.factions[me].doctrine ? st.factions[me].doctrine.owned.map(id => tx(VM.Doctrine.LIST[id].name)).join(', ') : '';
    const battles = (st.reports || []).length;
    let h = `<div class="chr"><b>${ko ? `${cy}년 요약` : `Summary, year ${cy}`}</b><br>${ko ? '영토' : 'Places'}: ${mine} · ${ko ? '동맹' : 'Allies'}: ${allies} · ${ko ? '전투' : 'Battles'}: ${battles}${doct ? '<br>' + (ko ? '교리' : 'Doctrines') + ': ' + esc(doct) : ''}</div>`;
    if (st.story) {
      const T = D.TRAITS[me], V = D.VICTORIES[me], v = VM.Story.victoryView(st, me);
      const part = p => p.label ? `${tx(p.label)} ${p.done ? '✔' : '✘'}` : p.allies ? `${ko ? '동맹' : 'Allies'} ${p.have}/${p.of}` : p.spec ? `${p.spec} ${p.have}/${p.of}` : `${ko ? '지배 지역' : 'Places'} ${p.have}/${p.of}`;
      h += `<div class="chr"><b>${ko ? '명예' : 'Honor'}</b>: ${Math.round(VM.Story.honorOf(st.story))}/100</div>`;
      h += `<div class="chr"><b>${esc(tx(T.name))}</b>: ${esc(tx(T.text))}</div><div class="chr"><b>${esc(tx(V.name))}</b>: ${esc(tx(V.text))}<br>${esc(v.parts.map(part).join(' · '))} · ${ko ? '유지' : 'Held'} ${v.held}/${v.days}</div>`;
    }
    if (!ent.length) h += para(ko ? '아직 기록할 일이 없다.' : 'Nothing has happened yet.');
    let year = null;
    for (const e of ent) {
      const y = yearOf(e.t);
      if (y !== year) { year = y; h += `<div class="lbl">${ko ? y + '년' : 'Year ' + y}</div>`; }
      h += `<div class="chr${e.battle ? ' bat' : ''}"><span class="dim">${dayOf(e.t)}</span> ${e.html}</div>`;
    }
    open(ko ? '연대기' : 'The Chronicle', h, 'Close');
  }

  return { init, update, chronicle, isOpen: () => !!mode };
})();
