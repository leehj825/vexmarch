// Scenarios: starts other than the random map. "open" is the random map (the skirmish as it was); "realm" is the fixed 30-place map of the campaign with no story;
// "siege" is the realm with Vexholm held by another house and your army already at its gates. Each is built from the same parts, so saves and tests work the same.
var VM = globalThis.VM = globalThis.VM || {};

VM.Scenario = (function () {
  const LIST = [
    { id: 'open', name: { en: 'Open ground', ko: '열린 땅' }, text: { en: 'A random map: the skirmish as it was.', ko: '무작위 지도: 전과 같은 교전.' } },
    { id: 'realm', name: { en: 'The fixed realm', ko: '고정된 나라' }, text: { en: 'The campaign\'s 30 places and six houses, with no story.', ko: '캠페인의 30개 거점과 여섯 가문, 이야기는 없음.' } },
    { id: 'siege', name: { en: 'Siege of Vexholm', ko: '벡스홀름 포위' }, text: { en: 'Vexholm is held by another house with a walled garrison, and your army is already at its gates.', ko: '벡스홀름은 다른 가문이 성벽과 수비대로 지키고, 당신의 군대는 이미 성문 앞에 있습니다.' } }
  ];
  const find = id => LIST.find(x => x.id === id) || LIST[0];
  function create(id, opts) {
    opts = opts || {};
    const player = opts.player || 1, difficulty = opts.difficulty || 'normal';
    if (id === 'open') return VM.Sim.create({ seed: opts.seed || 1, factions: opts.factions || VM.CFG.FACTION_COUNT, player, ai: true, difficulty });
    const s = VM.Story.create({ player, difficulty, noStory: true });
    s.aiOn = true;
    if (id === 'siege') {
      const vex = s.cities.findIndex(c => s.map.nodes[c.id].name === 'Vexholm');
      const holder = player === 2 ? 4 : 2, city = s.cities[vex];
      city.owner = holder; city.buildings.wall = Math.max(2, city.buildings.wall); city.wallHp = VM.War.wallMax(city);
      city.garrison = { infantry: 150, spear: 40, cavalry: 0, archer: 30, siege: 0 }; city.governor = null;
      const near = s.map.nodes[vex].adj[0], o = s.officers.find(x => x.owner === player && x.army === null && x.role !== 'governor');
      if (o && near !== undefined) {
        const a = VM.Armies.spawn(s, player, near, { infantry: 120, spear: 30, cavalry: 0, archer: 20, siege: 0 }, o.id);
        VM.Armies.move(s, a, vex);
      }
    }
    return s;
  }
  return { LIST, find, create };
})();
