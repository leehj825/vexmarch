// Vexmarch - every balance number lives here. Plain script (no modules) so the game also opens from file:// and loads in Node for tests.
var VM = globalThis.VM = globalThis.VM || {};

VM.CFG = {
  VERSION: 2,

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
    baseCap: 6000,         // population cap of a plain town, before specialty and buildings
    startPopFrac: 0.55,    // starting population as a fraction of cap
    popGrow: 0.02,         // per day, fraction of the gap to target closed while growing
    popShrink: 0.03,       // ... while shrinking
    starveLoss: 0.02,      // per day, extra population loss while the faction has no food
    tax: 0.004,            // gold per head per day at Normal tax
    foodPerHead: 0.01,     // food per head (population and troops) per day
    foodBase: 0.0075,      // food produced per cap point per day with no farms
    foodFarm: 0.0025,      // ... added per farm level
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
    infantry: { label: 'Infantry', cost: 20, upkeep: 0.05, speed: 45 },
    spear:    { label: 'Spearmen', cost: 22, upkeep: 0.05, speed: 45 },
    cavalry:  { label: 'Cavalry',  cost: 40, upkeep: 0.10, speed: 80 },
    archer:   { label: 'Archers',  cost: 30, upkeep: 0.07, speed: 45 }
  },

  // ---- Officers ----
  OFFICER_COUNT: 24,
  OFFICERS_PER_FACTION: 4,
  TRAITS: ['Rash', 'Cautious', 'Loyal', 'Greedy', 'Brave', 'Schemer']
};
