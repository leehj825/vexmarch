// AI-vs-AI games, headless. Usage: node tools/ai_tournament.js [seeds] [years] [levels e.g. easy,normal,normal,hard,hard]
// Prints who wins, how long games take and how the difficulty levels fare.
const VM = require('./load');
const seeds = +process.argv[2] || 6, years = +process.argv[3] || 30;
const base = (process.argv[4] || 'easy,normal,normal,hard,hard').split(',');
const Y = VM.CFG.DAYS_PER_YEAR;
const wins = {}, nodes = {}, played = {}; let finished = 0, daysTotal = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const levels = base.map((_, i) => base[(i + seed - 1) % base.length]);      // rotate the levels over the start positions
  const s = VM.Sim.create({ seed, aiAll: true, difficulty: 'normal', factions: levels.length });
  s.factions.forEach((f, i) => { if (!f.neutral) f.ai.level = levels[i - 1]; });
  if (process.env.FOG) VM.Fog.setOn(s, true);        // FOG=1 npm run tournament: the same games with fog of war
  for (let y = 0; y < years && !s.over; y++) VM.Sim.advance(s, Y);
  const counts = s.factions.filter(f => !f.neutral).map(f => s.cities.filter(c => c.owner === f.id).length);
  const top = counts.indexOf(Math.max(...counts));
  if (s.over) { finished++; daysTotal += s.time; }
  s.factions.filter(f => !f.neutral).forEach((f, i) => { const k = levels[i]; nodes[k] = (nodes[k] || 0) + counts[i]; played[k] = (played[k] || 0) + 1; });
  const w = s.over ? levels[s.over.winner - 1] : 'none'; wins[w] = (wins[w] || 0) + 1;
  console.log(`seed ${seed}: ${s.over ? 'won by faction ' + s.over.winner + ' (' + levels[s.over.winner - 1] + ') on day ' + Math.round(s.time) : 'unfinished after ' + years + ' years, leader ' + (top + 1) + ' (' + levels[top] + ') with ' + counts[top]} | nodes ${counts.join('/')}`);
}
for (const k in wins) if (k !== 'none') wins[k] = wins[k] + ' (' + Math.round(100 * wins[k] / played[k]) + '% per player)';
console.log(`\nfinished ${finished}/${seeds}${finished ? ', average ' + Math.round(daysTotal / finished / Y * 10) / 10 + ' years' : ''}; winners ${JSON.stringify(wins)}; nodes held at the end by level ${JSON.stringify(nodes)}`);
