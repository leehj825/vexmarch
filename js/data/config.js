// Vexmarch - every balance number lives here. Plain script (no modules) so the game also opens from file:// and loads in Node for tests.
var VM = globalThis.VM = globalThis.VM || {};

VM.CFG = {
  VERSION: 6,                // 6: people and soldiers are counted one by one (a tenth of the old numbers)

  // ---- Time ----
  DAY_SECONDS: 2,          // real seconds per in-game day at 1x
  STEP_DAYS: 0.25,         // fixed simulation step, in days
  SPEEDS: [0, 1, 2, 4],
  DAYS_PER_YEAR: 360,      // 12 months of 30 days

  // ---- World ----
  MAP: { w: 1000, h: 700, cols: 6, rows: 5, jitter: 0.26, diagonalP: 0.55, removeP: 0.22 },
  FACTION_COUNT: 5,        // 4 to 6
  START_NODES: 4,          // nodes each faction owns at the start
  START_GOLD: 600,
  START_FOOD: 3000,

  FACTIONS: [
    { name: 'Neutral',   color: '#7d7468' },
    { name: 'Kaldrath',  color: '#e0483a' },
    { name: 'Orsolyn',   color: '#5aa0d8' },
    { name: 'Tessarune', color: '#8fbf4a' },
    { name: 'Marrowgate', color: '#f2d27a' },
    { name: 'Wickfront', color: '#a070c8' },
    { name: 'Thornreach', color: '#e08a3a' }
  ],

  // Specialties: cap = population cap, gold/food = output multipliers, pros = prosperity bonus.
  // count = how many of this specialty are placed on the map (capitals are placed separately).
  SPEC: {
    capital:  { label: 'Capital',       cap: 1.6, gold: 1.2, food: 1.0, pros: 0.05, count: 0 },
    farmland: { label: 'Farmland',      cap: 1.0, gold: 1.0, food: 1.4, pros: 0.05, count: 5 },
    market:   { label: 'Market town',   cap: 1.0, gold: 1.4, food: 1.0, pros: 0,    count: 4 },
    pass:     { label: 'Mountain pass', cap: 0.6, gold: 0.9, food: 0.8, pros: -0.08, count: 3, defense: 1.5 },
    port:     { label: 'Port',          cap: 1.0, gold: 1.25, food: 1.0, pros: 0,   count: 3 },
    iron:     { label: 'Iron hills',    cap: 0.8, gold: 1.0, food: 0.9, pros: 0,    count: 3, troopCost: 0.85 },
    horse:    { label: 'Horse plains',  cap: 0.9, gold: 1.0, food: 1.1, pros: 0,    count: 3, cavalryCost: 0.8 },
    holy:     { label: 'Holy site',     cap: 0.9, gold: 1.0, food: 1.0, pros: 0.1,  count: 2 },
    town:     { label: 'Town',          cap: 1.0, gold: 1.0, food: 1.0, pros: 0,    count: 0 }   // fills the rest
  },

  // ---- Economy ----
  ECON: {
    baseCap: 600,          // population cap of a plain town, before specialty and buildings
    startPopFrac: 0.55,    // starting population as a fraction of cap
    popGrow: 0.02,         // per day, fraction of the gap to target closed while growing
    popShrink: 0.03,       // ... while shrinking
    starveLoss: 0.02,      // per day, extra population loss while the faction has no food
    tax: 0.04,             // gold per head per day at Normal tax (a head is about ten of the old ones: the game counts people, not crowds)
    foodPerHead: 0.1,      // food per head (population and troops) per day
    foodBase: 0.075,      // food produced per cap point per day with no farms
    foodFarm: 0.025,      // ... added per farm level
    prosBase: 0.35, prosFood: 0.25, prosSec: 0.15, prosGov: 0.15,
    garrisonRatio: 0.03,   // garrison / population needed for full security
    minPopFrac: 0.3,       // recruiting never takes a city below this fraction of its cap
    officerSalary: 2,      // gold per day per officer
    runwayDays: 30,        // food stock that counts as fully secure
    desertion: 0.01,       // per day, fraction of troops lost while broke
    devastationDecay: 1 / 60   // per day
  },

  TAX: {
    low:    { label: 'Low',    gold: 0.6, pros: 0.15 },
    normal: { label: 'Normal', gold: 1.0, pros: 0 },
    high:   { label: 'High',   gold: 1.5, pros: -0.35 }
  },

  // ---- Buildings (levels 1 to 3; houses are decorative and not listed here) ----
  BUILD: {
    farm:     { label: 'Farm',     cost: [200, 400, 800],  days: [20, 40, 70] },
    market:   { label: 'Market',   cost: [250, 500, 1000], days: [25, 45, 80] },
    barracks: { label: 'Barracks', cost: [250, 500, 1000], days: [25, 45, 80], troopDiscount: 0.1 },
    wall:     { label: 'Wall',     cost: [300, 700, 1500], days: [30, 60, 100] },
    temple:   { label: 'Temple',   cost: [300, 600, 1200], days: [30, 55, 90] }
  },
  MAX_BUILD_LEVEL: 3,
  GOVERNOR_BUILD_SPEED: 0.5,   // governor Politics 100 builds 50% faster

  // ---- Troops (speed = map units per day; an army moves at its slowest troop type) ----
  TROOPS: {
    infantry: { label: 'Infantry', cost: 200, upkeep: 0.5, speed: 45 },
    spear:    { label: 'Spearmen', cost: 220, upkeep: 0.5, speed: 45 },
    cavalry:  { label: 'Cavalry',  cost: 400, upkeep: 1.0, speed: 80 },
    archer:   { label: 'Archers',  cost: 300, upkeep: 0.7, speed: 45 },
    siege:    { label: 'Siege engines', cost: 90, upkeep: 0.25, speed: 30, siege: true }   // weak in the field, breaks walls
  },

  // ---- War (Phase 3) ----
  // Troop types beat each other in a cycle: spear > cavalry > archer > infantry > spear.
  WAR: {
    contact: 16,            // map units: armies this close are in battle
    k: 0.035,               // casualties per day = k x effective strength of the enemy
    strong: 1.4, weak: 0.7, // matchup multipliers
    siegeField: 0.25,       // siege engines fight at this strength against troops
    cmdBonus: 0.4,          // officer Command 100 = +40% strength
    home: 1.15,             // defender on its own land
    moraleRate: 8,          // morale lost per day at even odds (scaled by the odds, 0.3x to 3x)
    wallHp: [0, 600, 1500, 3000],
    wallBonus: 1.5,         // garrison strength behind an unbroken wall
    wallProtect: 0.35,      // share of normal damage the garrison takes while the wall stands
    siegeWall: 4,           // wall hit points per siege engine per day
    chip: 1.5,              // wall hit points per other soldier per day
    wallRepair: 0.01,       // fraction of max per day when nobody threatens the city
    captureMin: 0,          // garrison at or below this falls
    captureLoss: 0.15,      // population lost when a city is taken
    foreignFood: 3,         // food eaten per soldier in enemy or neutral land
    rationDays: 12,         // days of food an army carries
    refill: 4,              // rations refill speed when supplied (x consumption)
    cutDrain: 3, starveDrain: 8, recover: 1,   // morale per day: line cut / no food / recovery when safe
    desert: 0.02,           // troops lost per day while starving
    routSpeed: 1.25, routRecover: 30,
    depotCost: 300, depotRange: 230, depotRate: 40,
    abilityCooldown: 40, chargeDays: 6, chargeMult: 1.6,
    fateDead: 0.3, fateCaptured: 0.65      // officer of a destroyed army: dies below, captured below, else escapes
  },

  // ---- AI factions (Phase 5). Difficulty changes how fast and how boldly the AI acts, never its income: it plays by the same rules and commands. ----
  AI: {
    // odds = how many times stronger than a target's defence the AI wants to be before it attacks (it relaxes 10% a year without gains).
    // Measured over 80 games each against four 'normal' rivals: easy wins about 13% of games, normal 25%, hard 33% (fair share is 20%).
    easy:   { think: 20, odds: 2.75, armiesMax: 2, guards: 1, mil: 0.04, spend: 0.35, reach: 520, search: false, abilities: false, depots: false },
    normal: { think: 10, odds: 1.8,  armiesMax: 3, guards: 1, mil: 0.06, spend: 0.5,  reach: 700, search: true,  abilities: true,  depots: false },
    hard:   { think: 5,  odds: 2.1,  armiesMax: 5, guards: 1, mil: 0.06, spend: 0.5,  reach: 700, search: true,  abilities: true,  depots: false }
  },
  AI_RESERVE: 800,          // gold an AI keeps back when recruiting, so its governors can still afford to build
  AI_KEEP: 0.03,            // share of a city's people left as garrison when an army is formed there

  // ---- Officers, delegation and alerts (Phase 4) ----
  OFFICERS: {
    loyaltyBase: 55, loyaltyDrift: 0.01,       // loyalty moves this fraction per day toward its target
    traitLoyal: 25, traitGreedyBroke: -15, traitSchemer: -10, idleAfter: 60, idlePenalty: -10,
    defectBelow: 20, defectRate: 0.05, warnBelow: 35,
    giftCost: 100, giftGain: 15, giftCooldown: 30,
    speed: 70,                                 // map units per day when an officer travels between cities
    searchCost: 50, searchDays: 15, searchRange: 330,
    recruitBase: 100, recruitPerStat: 2,
    wanderMin: 25, wanderMax: 55, spawnEvery: 120, wanderersMax: 6,
    reserve: 250,                              // gold a governor keeps back when spending
    thinkBase: 14, thinkPol: 8,                // governor decides every (14 - 8 x Politics/100) days
    armyThink: 2,                              // army commanders look around every 2 days
    sense: 300,                                // map units: how far a defender watches from its station
    proposalEvery: 40, proposalExpires: 20, proposalMax: 5,
    // Attack odds (my strength / theirs) an officer wants before acting alone, by trait
    odds: { Rash: 0.8, Brave: 0.9, Cautious: 1.6, other: 1.15 },
    raidOdds: { Rash: 1.0, Brave: 1.2, Cautious: 2.2, other: 1.5 },
    garrisonTarget: { develop: 0.03, fortify: 0.06, recruit: 0.10 },
    recruitBatch: 6
  },

  // ---- Officers ----
  OFFICER_COUNT: 24,
  OFFICERS_PER_FACTION: 4,
  TRAITS: ['Rash', 'Cautious', 'Loyal', 'Greedy', 'Brave', 'Schemer']
};
