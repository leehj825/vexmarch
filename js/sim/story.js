// The story rules: builds the fixed campaign world from js/data/story.js, tracks the ties between officers, fires the story beats from what happens in the game,
// and keeps the chronicle. Everything is plain data on state.story (JSON, saved with the game). Pure: no DOM.
var VM = globalThis.VM = globalThis.VM || {};

VM.Story = (function () {
  const D = () => VM.StoryData;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lang = () => (VM.I18N && VM.I18N.lang) || 'en';
  const tx = t => t ? (t[lang()] || t.en) : '';                 // a { en, ko } text in the language in use

  // ---- the fixed map: the grid of the random maps, with fixed jitter and the hand-chosen roads ----
  function jitter(i, k) { let h = Math.imul(i * 2 + k + 1, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000 - 0.5; }
  function buildMap() {
    const M = VM.CFG.MAP, cols = M.cols, cw = M.w / cols, ch = M.h / M.rows, places = D().PLACES, idOf = {};
    const nodes = places.map((p, i) => { idOf[p.col + ',' + p.row] = i; return { id: i, col: p.col, row: p.row, x: Math.round((p.col + 0.5) * cw + jitter(i, 0) * 0.34 * cw), y: Math.round((p.row + 0.5) * ch + jitter(i, 1) * 0.34 * ch), name: p.name, adj: [] }; });
    const cut = new Set(D().CUT.map(s => s.split('-').sort().join('-')));
    const edges = [], add = (a, b) => { if (!cut.has([a, b].sort().join('-'))) edges.push([a, b]); };
    for (const p of places) {
      const r = p.col + ',' + (p.row), right = (p.col + 1) + ',' + p.row, down = p.col + ',' + (p.row + 1);
      if (idOf[right] !== undefined) add(r, right); if (idOf[down] !== undefined) add(r, down);
    }
    for (const d of D().DIAG) edges.push(d.split('-'));
    const list = edges.map(([a, b]) => [idOf[a], idOf[b]]);
    for (const [a, b] of list) { nodes[a].adj.push(b); nodes[b].adj.push(a); }
    nodes.forEach(n => n.adj.sort((x, y) => x - y));
    return { w: M.w, h: M.h, nodes, edges: list.map(([a, b]) => [a, b, Math.round(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y))]) };
  }

  // ---- the campaign world ----
  function create(opts) {
    opts = opts || {};
    const C = VM.CFG, E = C.ECON, player = opts.player || 1;
    const s = VM.World.create({ seed: 1, factions: 6, player, ai: true, difficulty: opts.difficulty || 'normal' });
    s.map = buildMap();
    const places = D().PLACES, capital = {};
    places.forEach((p, i) => { if (p.spec === 'capital' && p.owner > 0) capital[p.owner] = i; });
    s.cities = places.map((p, i) => {
      const city = { id: i, owner: p.owner, spec: p.spec, pop: 0, tax: 'normal', governor: null, devastation: 0, contested: false,
        buildings: { farm: 0, market: 0, barracks: 0, wall: 0, temple: 0 }, build: null, garrison: { infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, wallHp: 0, depot: null, besieged: false, warn: false, policy: 'manual', nextThink: 0, stats: null };
      if (p.spec === 'capital') { city.buildings.farm = 1; city.buildings.market = 1; city.buildings.barracks = 1; }
      if (p.spec === 'farmland') city.buildings.farm = 1;
      if (p.spec === 'market') city.buildings.market = 1;
      if (p.spec === 'holy') city.buildings.temple = 1;
      if (p.name === 'Vexholm') { city.buildings.wall = 3; city.buildings.temple = 1; }
      city.pop = Math.round(VM.Eco.cap(city) * E.startPopFrac);
      city.garrison.infantry = Math.round(city.pop * (p.name === 'Vexholm' ? 0.07 : p.owner === 0 ? 0.05 : 0.04));
      if (city.buildings.wall) city.wallHp = VM.War.wallMax(city);
      return city;
    });
    s.factions.forEach(f => { if (!f.neutral) f.capital = capital[f.id]; });
    // the 24 officers, four to a house, at their capitals; the best Politics of each governs
    const officers = [];
    s.officers = officers;
    D().OFFICERS.forEach((o, i) => {
      officers.push({ id: i, key: o.key, name: o.name, command: o.stats[0], might: o.stats[1], politics: o.stats[2], intellect: o.stats[3], trait: o.trait, loyalty: 70, owner: o.house, loc: capital[o.house],
        role: 'idle', army: null, nextMove: 0, revealed: [], searching: null, travel: null, nextProposal: 0, gift: -1e9, warned: false, idleDays: 0 });
    });
    for (let h = 1; h <= 6; h++) {
      const mine = officers.filter(o => o.owner === h).sort((a, b) => b.politics - a.politics);
      mine[0].role = 'governor'; s.cities[capital[h]].governor = mine[0].id;
    }
    s.events = []; s.nextEvent = 0;
    s.story = { campaign: true, house: player, fired: {}, chronicle: [], queue: [], seen: 0, flags: {} };
    VM.Eco.refresh(s);
    return s;
  }

  // ---- the beats: what happens in the game fires a short text, once each ----
  const koOf = n => D().NAMES_KO[n] || n;
  const fill = (t, vals) => ({ en: t.en.replace(/\{(\w+)\}/g, (_, k) => vals[k] ? vals[k].en : ''), ko: t.ko.replace(/\{(\w+)\}/g, (_, k) => vals[k] ? vals[k].ko : '') });
  const nm = n => ({ en: n, ko: koOf(n) });
  const officer = (state, key) => state.officers.find(o => o.key === key) || null;
  const alive = o => !!o && o.owner >= 0;
  const house = (state, id) => state.factions[id] ? nm(state.factions[id].name) : nm('?');
  const dayOf = state => Math.floor(state.time);
  const stamp = state => { const d = VM.Sim.date(state); return { en: `Y${d.year} M${d.month} D${d.day}`, ko: `${d.year}년 ${d.month}월 ${d.day}일` }; };

  function note(state, en, ko) { const S = state.story; S.chronicle.push({ t: state.time, en, ko }); if (S.chronicle.length > 300) S.chronicle.shift(); }
  function fire(state, id, vals) {
    const S = state.story, B = D().BEATS[id]; if (S.fired[id]) return; S.fired[id] = state.time;
    const title = fill(B.title, vals || {}), text = fill(B.text, vals || {});
    S.queue.push({ id, t: state.time, title, text }); note(state, title.en + '.', title.ko + '.');
  }
  const armyOf = (state, key) => { const o = officer(state, key); return o && o.army !== null ? state.armies.find(a => a.id === o.army) : null; };
  const inContact = (state, ka, kb) => { const a = armyOf(state, ka), b = armyOf(state, kb); return !!(a && b && a.fighting.includes(b.id)); };

  function opening(state) {
    const S = state.story; if (S.opened) return; S.opened = true;
    S.queue.push({ id: 'history', t: 0, title: D().HISTORY.title, text: null, intro: true });
    S.queue.push({ id: 'opening', t: 0, title: { en: 'Year 1', ko: '1년' }, text: D().OPENINGS[S.house] });
  }

  function step(state) {
    const S = state.story; if (!S || !S.campaign) return;
    opening(state);
    const day = dayOf(state); if (S.lastDay === day) return; S.lastDay = day;
    const fresh = state.events.filter(e => e.n > S.seen); for (const e of fresh) S.seen = Math.max(S.seen, e.n);
    const me = state.player;
    for (const e of fresh) {
      if (e.type === 'battle' && (e.owner === me || e.enemy === me)) fire(state, 'first_blood');
      if (e.type === 'battle') {
        const pair = [e.owner, e.enemy].sort().join('-');
        if (pair === '1-4') fire(state, 'old_comrades'); if (pair === '3-5') fire(state, 'lantern_vow');
      }
      if (e.type === 'captured') {
        const c = state.cities[e.city], place = D().PLACES[e.city];
        fire(state, 'first_fall');
        note(state, `${place.name} fell to ${state.factions[e.owner].name}.`, `${place.ko}이(가) ${koOf(state.factions[e.owner].name)}에게 함락되었다.`);
        if (e.from > 0 && state.factions[e.from] && state.factions[e.from].capital === e.city) fire(state, 'capital_falls', { city: nm(place.name), house: house(state, e.from) });
        if (place.name === 'Vexholm') fire(state, 'vexholm', { house: house(state, e.owner) });
      }
      if (e.type === 'officerDied') {
        const o = state.officers[e.officer], d = D().OFFICERS.find(x => x.key === o.key);
        if (d) {
          fire(state, 'first_death', { name: nm(d.name), role: d.role, bio: d.bio });
          note(state, `${d.name} died.`, `${d.ko}이(가) 죽었다.`); grieve(state, o);
        }
      }
      if (e.type === 'officerCaptured') { const o = state.officers[e.officer], d = D().OFFICERS.find(x => x.key === o.key); if (d) note(state, `${d.name} was taken by ${state.factions[e.owner].name}.`, `${d.ko}이(가) ${koOf(state.factions[e.owner].name)}에게 사로잡혔다.`); }
      if (e.type === 'eliminated') fire(state, 'eliminated', { house: house(state, e.owner) });
    }
    // beats that wait for a time or for a pair of officers
    const sera = officer(state, 'sera'), tomas = officer(state, 'tomas'), varek = officer(state, 'varek'), isaure = officer(state, 'isaure'), cael = officer(state, 'cael'), ysolde = officer(state, 'ysolde');
    if (day >= 90 && alive(cael) && alive(ysolde) && cael.owner !== ysolde.owner) fire(state, 'letter');
    if (day >= 100 && alive(varek) && alive(isaure) && varek.owner !== isaure.owner) fire(state, 'ledger');
    if (day >= 150 && alive(sera) && alive(tomas) && sera.owner !== tomas.owner) fire(state, 'siblings');
    if (inContact(state, 'sera', 'tomas')) fire(state, 'siblings_clash');
    // the end
    if (state.over && !S.ended) {
      S.ended = true;
      const win = state.over.type === 'win' && state.over.winner === me;
      const text = win ? D().ENDINGS[S.house] : (state.over.type === 'win' ? { en: `${state.factions[state.over.winner].name} holds the whole realm. ` + D().DEFEAT.en, ko: `${koOf(state.factions[state.over.winner].name)}이(가) 온 나라를 차지했다. ` + D().DEFEAT.ko } : D().DEFEAT);
      S.queue.push({ id: win ? 'victory' : 'defeat', t: state.time, title: win ? D().FACTIONS[S.house - 1].title : { en: 'The End of the House', ko: '가문의 끝' }, text, ending: win ? 'win' : 'lose' });
      note(state, win ? 'The realm was won.' : 'The house fell.', win ? '나라를 얻었다.' : '가문이 무너졌다.');
    }
  }

  // ---- ties between officers: small effects on loyalty, on who joins whom when captured, and on a fight between rivals ----
  const tiesOf = key => D().TIES.filter(t => t[1] === key || t[2] === key);
  const isOfficer = key => D().OFFICERS.some(o => o.key === key);
  function loyaltyMod(state, o) {
    if (!state.story || !o.key) return 0;
    let m = 0;
    for (const t of tiesOf(o.key)) {
      const other = t[1] === o.key ? t[2] : t[1];
      if (t[0] === 'debt' && t[1] === o.key) { const c = officer(state, other); if (alive(c) && c.owner !== o.owner) m -= 10; }       // an unpaid debt to a rival house
      else if (!isOfficer(other) && (t[0] === 'oath' || t[0] === 'kin') && t[1] === o.key) m += t[0] === 'oath' ? 10 : 6;                  // sworn to, or kin of, the ruler
    }
    return m;
  }
  // a captured officer is likelier to join the captors when somebody there is a friend, kin, a teacher, a pupil or a love
  function tieBonus(state, o, victor) {
    if (!state.story || !o.key) return 0;
    for (const t of tiesOf(o.key)) { if (t[0] === 'rival' || t[0] === 'debt') continue; const other = officer(state, t[1] === o.key ? t[2] : t[1]); if (other && other.owner === victor) return 0.2; }
    return 0;
  }
  function rivalMult(state, a, b) {
    if (!state.story) return 1;
    const x = state.officers[a.officer], y = state.officers[b.officer]; if (!x || !y || !x.key || !y.key) return 1;
    return D().TIES.some(t => t[0] === 'rival' && ((t[1] === x.key && t[2] === y.key) || (t[1] === y.key && t[2] === x.key))) ? 1.1 : 1;
  }
  function grieve(state, dead) {                                               // kin of the dead lose heart
    for (const t of tiesOf(dead.key)) { if (t[0] !== 'kin') continue; const o = officer(state, t[1] === dead.key ? t[2] : t[1]); if (o && o.owner > 0) o.loyalty = clamp(o.loyalty - 15, 0, 100); }
  }

  return { create, buildMap, step, loyaltyMod, tieBonus, rivalMult, tiesOf, tx, lang, koOf, officerInfo: o => D().OFFICERS.find(x => x.key === o.key) || null };
})();
