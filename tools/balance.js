// Prints economy curves from a headless run. Usage: node tools/balance.js [seed] [years]
const VM = require('./load');
const bot = require('./econ_bot');
const seed = +process.argv[2] || 1, years = +process.argv[3] || 5;
const Y = VM.CFG.DAYS_PER_YEAR;

function table(label, opts) {
  const s = VM.Sim.create({ seed });
  console.log(`\n== ${label} (seed ${seed}) ==`);
  console.log('year  faction       nodes   pop    gold    food   gold/d  food/d  prosp');
  for (let y = 1; y <= years; y++) {
    bot.run(s, Y, opts);
    for (const f of s.factions) {
      if (f.neutral) continue;
      const cs = s.cities.filter(c => c.owner === f.id);
      const pop = cs.reduce((a, c) => a + c.pop, 0), pr = cs.reduce((a, c) => a + c.stats.prosperity, 0) / cs.length;
      console.log(`${String(y).padStart(3)}   ${f.name.padEnd(12)}  ${String(cs.length).padStart(4)} ${String(Math.round(pop)).padStart(7)} ${String(Math.round(f.gold)).padStart(7)} ${String(Math.round(f.food)).padStart(7)} ${f.income.gold.toFixed(0).padStart(7)} ${f.income.food.toFixed(0).padStart(7)}  ${pr.toFixed(2)}${f.starving ? ' STARVING' : ''}${f.broke ? ' BROKE' : ''}`);
    }
  }
}

table('Normal tax', { tax: 'normal' });
table('Low tax', { tax: 'low' });
table('High tax', { tax: 'high' });
