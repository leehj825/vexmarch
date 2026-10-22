# Vexmarch — Story Bible (first draft)

Status: the first slice is in the game (Campaign on the title screen): the common history, the six houses' openings and endings, the fixed 30-place map, the 24 officers with their bios and ties, twelve story beats, the chronicle, and all of it in English and Korean. Still to come: a playable ruler who can walk the cities and take command of an army, the small per-house gameplay traits, more beats per house, and special victory conditions. Data: `js/data/story.js`; rules: `js/sim/story.js`; screens: `js/ui/story.js`. Tone: **historical war**, grounded and political (think the Warring States, the Wars of the Roses, the Diadochi). No magic; the "supernatural" is only what people believe. Campaign mode uses a fixed, hand-made map; **Skirmish** keeps the random map and the random officers.

Scale for the first version: **6 factions, 24 officers (4 each), 30 hand-placed nodes, about a dozen story beats per faction campaign.**

---

## 1. The world in one page

**The Vex Dominion** was a federation of six river-lands (the *marches*) that a soldier-statesman, Marshal **Aurel Vex**, bound together four centuries ago. He gave each march to one of his captains; their houses became the margraves. For 380 years the marches paid tribute to a central throne at **Vexholm**, and the throne kept the roads open, the grain flowing and the passes unmolested. The name of the realm, *Vexmarch*, is the old word for "the marches of Vex".

**The Sundering.** In the year the story begins (**Year 1 of the Sundering**), Emperor **Aldric IV, called the Gentle**, died after a short illness that some say was not an illness. He left no adult heir. His grandson **Prince Edric**, nine years old, is in the keeping of his mother's house, **Tessarune**. His last words were heard by only three people, and they told three different stories. Within a season:

- the **Marshal-General** (Kaldrath) demanded the regency and the command of every imperial garrison;
- the **trading cities** (Orsolyn) stopped paying tribute to a court they never trusted;
- the **Lantern Church** (Wickfront) declared that the throne is not inherited but *chosen*, by a conclave, in the light;
- the **mountain wardens** (Marrowgate) shut the passes and brought back the old tolls;
- the **steppe riders** (Thornreach), whose famine-grain had been paid by the throne, found the storehouses empty and rode.

Everyone is the heir of the empire's fall, and each has a reasonable claim. **Vexholm** — the old capital in the middle of the realm — holds the crown, the archives and a ring of walls no one has breached. Whoever holds it can crown whom they like.

### Timeline

| Year | Event |
|---|---|
| −400 | Marshal Aurel Vex unites six river-lands after the Wars of the Fords. |
| −380 | The first Concord: the marches are given to the Marshal's six captains. |
| −210 | The Salt Famine; the Orsolyn cities buy their charters with grain loans. |
| −120 | The Lantern Church is founded at the Wickfront after the plague of the east. |
| −60 | The Pass War; the Marrowgate wardens are paid to hold the north gates, forever. |
| −31 | The Steppe Accord: Thornreach is given grain, not land, to keep the peace. |
| −9 | Edric's mother, Empress Liane of Tessarune, dies in childbed. |
| 0 | Emperor Aldric IV dies. The **Council of Candles** at Vexholm ends in shouting. |
| 1 | The Sundering. The game begins. |

---

## 2. The six factions

Colors are the ones in the game. Each faction gets a **creed** (what it believes it fights for), a **wound** (why it is angry), a **ruler**, and one or two **small mechanical traits** that fit the story (to be balanced with tournaments). The ruler is the player's voice, not one of the four officers.

### Kaldrath — red — *"The Iron Regency"*
- **Region:** the central plains and the river fords south of Vexholm. Closest to the capital.
- **Ruler:** **Margrave Ordan Kaldrath**, 58, Marshal-General of the Dominion. Honest, stubborn, tired. Has buried a wife and two sons in the empire's service.
- **Creed:** the realm must not be torn apart; someone must hold it together, and the army is the only part still working.
- **Wound:** loyal for forty years, now accused of poisoning the Emperor.
- **Flavor:** drilled infantry (cheaper foot soldiers, stronger barracks); weaker trade.
- **Danger:** to hold the realm together he has to become the thing he fears — a king.

### Orsolyn — blue — *"The Free Charter"*
- **Region:** the southern and western coast; harbors, canals, the richest markets.
- **Ruler:** **First Syndic Maren Voss**, 46, a former ship's accountant elected by the guild-council. Cold, charming, very well informed.
- **Creed:** nobody, noble or priest, should own another person's road, and nothing is so cheap as a war won by paying for it.
- **Wound:** for two centuries the throne taxed their ships and refused them a vote.
- **Flavor:** strong gold income and markets; hires mercenaries well; thin walls.
- **Danger:** a republic of merchants cannot ask people to die for it for long.

### Tessarune — green — *"The Gentle Regency"*
- **Region:** the grain basin of the north-west river; the empire's granary.
- **Ruler:** **Margravine Ilsa Tessar**, 64, the late Empress's mother, regent of Prince Edric. Kind to the poor, ruthless in the family's name.
- **Creed:** the child must live and be crowned; a realm that is fed forgives a great deal.
- **Wound:** they hold the heir, and every other house wants either to rescue or to remove him.
- **Flavor:** food and population growth; farms strong; weakest army to start.
- **Danger:** the child is both their shield and their chain.

### Marrowgate — yellow — *"The Gate Compact"*
- **Region:** the northern mountains, the three passes and the iron hills.
- **Ruler:** **Warden Brannoch Marrow**, 52, a hard man who keeps his word and expects the same.
- **Creed:** the mountains were never conquered, only paid; the toll is a debt, not an insult.
- **Wound:** the throne forgot to pay them last winter, and two border posts starved.
- **Flavor:** very strong walls and defenders; best siege crews; slow to expand.
- **Danger:** a fortress people win a war by making it too costly to fight, and lose it by never ending.

### Wickfront — purple — *"The Conclave of Light"*
- **Region:** the eastern hills and the holy sites, where the Lantern Church keeps its archives and its pilgrim roads.
- **Ruler:** **High Lector Sevrin Ash**, 60, gentle in speech and exact in memory. He may be the only person who knows what the Emperor really said.
- **Creed:** a crown that is simply inherited is a crown that cannot be taken back; the throne must be *chosen*, in the light, by the faithful.
- **Wound:** the church spent a century being tolerated, never trusted.
- **Flavor:** strong temples, morale and healing; the best at holding conquered cities.
- **Danger:** he knows the secret and cannot tell it without ending the faith's claim.

### Thornreach — orange — *"The Rider's Right"*
- **Region:** the eastern and southern plains, horse country and the open border.
- **Ruler:** **Chieftain Dagna Thorn**, 39, a rider-queen who took the saddle at sixteen. Direct, proud, tired of being a guest in the empire's house.
- **Creed:** the empire paid for peace with grain; when the grain stopped, the peace was over. What the plains need, the plains take.
- **Wound:** her people were called "allies" for thirty years and counted as beggars.
- **Flavor:** cheap, fast cavalry; raids and light supply; weak walls and slow siege.
- **Danger:** a people that wins by speed cannot hold what it takes.

---

## 3. The map (to be hand-placed in the next step)

Six regions around the capital, with the 30 nodes divided roughly five to a region. Sketch (north up):

```
 MARROWGATE (mountains, passes)         THORNREACH (steppe, north-east)
          \                                  /
 TESSARUNE (grain basin) ---- VEXHOLM ---- WICKFRONT (holy hills)
          /          (the crown, centre)     \
   KALDRATH (plains, fords) ------------- THORNREACH (south plains)
                  \
              ORSOLYN (coast, canals)
```

- **Vexholm** (central, walled, level-3 walls from the start, neutral): the crown. Holding it unlocks the faction's story ending beat.
- Each faction has its **capital** plus four towns; the three **passes** sit on Marrowgate's border, the **ports** on Orsolyn's coast, the **iron hills** inside Marrowgate, the **horse plains** on the Thornreach side, and the **holy sites** in Wickfront.
- Each node gets a name and one line of history ("the Ford where Marshal Vex made his stand"). A full node list is the next deliverable.

---

## 4. The first cast: 24 officers

Four officers per faction. **Traits** are the game's existing ones (Rash, Cautious, Loyal, Greedy, Brave, Schemer). **Ties** are the relationships that will drive rules (see section 5).

### Kaldrath
| Officer | Role | Trait | Bio | Ties |
|---|---|---|---|---|
| **Halric Vane** | veteran general | Loyal | Forty years at Ordan's side; wears the same grey cloak in every winter. | oath to Ordan; mentor of Cael; old rival of Teodor Bask; former comrade of Osric Thane |
| **Cael Dunmere** | young captain | Brave | A farmer's son raised in Halric's tent. Believes in the realm because he has never seen it fail. | student of Halric; in love with Ysolde Tessar |
| **Sera Halde** | cavalry scout | Rash | The border riders' best tracker; joined the empire's service after her mother died. | sister of Tomas Halde (Thornreach) |
| **Varek Sorn** | quartermaster & spymaster | Schemer | The one who keeps the books and the secrets. Owes a great deal of money. | debtor to Isaure Fenn |

### Orsolyn
| Officer | Role | Trait | Bio | Ties |
|---|---|---|---|---|
| **Alis Quaille** | captain of the guard | Cautious | Never lost a ship; never started a fight. Has no illusions about what the League can afford. | friend of Joren Pike |
| **Teodor Bask** | mercenary captain | Greedy | Left Kaldrath's army after a quarrel over pay and a lost battle he blames on Halric. | rival of Halric Vane |
| **Isaure Fenn** | banker and informant | Schemer | Holds half the realm's debts, including Varek Sorn's. | creditor of Varek Sorn |
| **Joren Pike** | harbor engineer | Loyal | Builds what the League needs: chains, canals, siege towers. | friend of Alis Quaille |

### Tessarune
| Officer | Role | Trait | Bio | Ties |
|---|---|---|---|---|
| **Ysolde Tessar** | the prince's cousin & guardian | Brave | 24, trained with a sword against her family's wishes. Swore never to let the boy be taken. | in love with Cael Dunmere; cousin of Prince Edric |
| **Gerrick Oats** | steward-general | Loyal | Fifty years in the family's service; keeps the granaries and the army fed. | father of Oswin Oats (Wickfront) |
| **Anselm Rook** | the prince's tutor | Cautious | A scholar who left the Lantern Church to teach a child. | former pupil of Sevrin Ash |
| **Dorran Pell** | herald and captain | Rash | Makes a speech before every battle; some of them have won it. | — |

### Marrowgate
| Officer | Role | Trait | Bio | Ties |
|---|---|---|---|---|
| **Kestrel Marrow** | wall-captain | Rash | The Warden's daughter, 22; wants a war and thinks her father is too patient. | daughter of Brannoch Marrow |
| **Ulf Dray** | master of the mines & siege | Greedy | Knows where every ore seam and every weakness in a wall lies. | — |
| **Hilde Ironvein** | pass commander | Loyal | Held the north gate through two winters on short rations. | oath to Brannoch |
| **Osric Thane** | exiled engineer | Schemer | Built the Dominion's greatest walls, then fell out with the court. | former comrade of Halric Vane |

### Wickfront
| Officer | Role | Trait | Bio | Ties |
|---|---|---|---|---|
| **Sister Mirabel Cole** | war-nun | Brave | Leads the Lantern's guard; has never lost a man she could carry out. | — |
| **Vorn Calder** | the Lector's inquisitor | Schemer | Hears confessions, and files them. | — |
| **Oswin Oats** | lantern-knight | Loyal | A Tessarune knight who took the Lantern's vow; his father does not speak of it. | son of Gerrick Oats |
| **Lysa Grane** | field healer & captain | Cautious | The only officer both sides call by her first name. | — |
| (teacher) **Sevrin Ash** | the ruler | — | Taught Anselm Rook. | teacher of Anselm Rook |

### Thornreach
| Officer | Role | Trait | Bio | Ties |
|---|---|---|---|---|
| **Rurik Skald** | horse-lord general | Rash | The finest rider on the plains; thinks a battle is a thing you finish before noon. | — |
| **Tomas Halde** | scout-chief | Brave | Rode for the empire until it forgot to feed his people. Never stopped writing to his sister. | brother of Sera Halde |
| **Yara Wen** | outrider and diplomat | Cautious | Reads three languages and the weather. Dagna's voice in other camps. | friend of Dagna Thorn |
| **Brask Odd** | raid-master | Greedy | Takes what he can carry; usually a little more. | — |

*(24 officers: 4 per faction. The Lector, like the other rulers, is a story character rather than an officer unit. Sevrin and Anselm's tie is the only ruler-officer tie in the first cast.)*

---

## 5. Relationships as rules (proposal)

A small set of tie types, stored as data pairs, each with simple effects:

| Tie | Effect (examples) |
|---|---|
| **Oath** | Loyalty never falls below a floor for the oath-giver's faction; the pair can be given joint commands. |
| **Kin** | Capturing one makes the other less loyal to their own side; a captured kinsman is more likely to join. An army commanded against kin loses a little morale the first time they face each other. |
| **Mentor / student** | Both fight better when in the same army; a student refuses to leave the mentor's side if offered a transfer. |
| **Rival** | Both gain a small attack bonus against the other; commanding side-by-side costs morale. |
| **Love** | A pair on opposite sides triggers a story beat (a letter, a truce, a rescue) and can make one of them defect. |
| **Debt** | The debtor's loyalty drops each season the debt is unpaid; the creditor can buy cooperation. |

These are the hooks for the "story that reacts to how you play."

---

## 6. Story delivery (campaign)

- **Beats, not cutscenes.** Short text pages (a paragraph or two, one portrait line, one choice at most), shown when a condition on the real game state fires, such as "first capture", "an oath-pair meets in battle", or "a capital falls". They use the game's existing alert and toast system and a new story panel.
- **Chronicle.** A list of everything that happened in the game's own words.
- **Each faction is its own campaign**, with its own opening, set of beats and ending. The six campaigns share the same world, map and officers, but each is told from a different side. The ending depends on the faction and on a few choices; the win condition for now is still the conquest of every node (a special condition per faction can come later).
- **Tutorial** becomes chapter one of Kaldrath's campaign.

### A first draft of the endings

- **Kaldrath — "The Marshal's Burden":** Ordan unifies the realm, and has to decide whether to crown the boy or himself.
- **Orsolyn — "The Charter":** the League turns the empire into a republic of cities; the last scene is the first vote.
- **Tessarune — "The Gentle Reign":** Edric is crowned; the question is who raised him.
- **Marrowgate — "The Gate Compact":** the mountains are finally paid, in full, and the passes open on terms.
- **Wickfront — "The Light Chosen":** the conclave meets; Sevrin tells what the Emperor said.
- **Thornreach — "The Rider King":** the steppe takes the throne, and has to learn how to sit still.

### Candidate story beats (shared across campaigns, shown by who is involved)

1. The Council of Candles (the opening).
2. First blood (first battle).
3. The first city falls.
4. Brother against sister (Sera and Tomas meet in battle, or in a truce).
5. The ledger (Varek's debt falls due).
6. The prince is moved (Edric's location changes; a rescue or a kidnapping).
7. Old comrades (Halric and Osric on opposite walls).
8. The Lantern vow (Oswin and Gerrick, at a gate).
9. A letter across the lines (Cael and Ysolde).
10. The toll is paid (Marrowgate's passes).
11. Vexholm (the siege of the capital).
12. The last words (Sevrin reveals what the Emperor said).

---

## 7. Next steps

1. **You react to this draft:** tone, faction identities, the cast, the endings.
2. **Fixed map:** the full list of 30 nodes (names, specialties, positions, one line of history each), and the terrain for it.
3. **Data format:** a story data file (factions, officers, ties, beats), with English and Korean text.
4. **Relationship rules** (section 5) in the sim, with tests.
5. **Story panel, chronicle and the first campaign** (Kaldrath, using the tutorial as chapter one).
6. The other five campaigns, balance for the faction traits, and endings.

### Open questions for you
- Are you comfortable with a **fantasy-free, political** tone, where the mystery is "what did the Emperor say?" rather than a villain?
- Should the **rulers** also be playable characters in the game (as leaders with stats), or stay as story voices?
- Should officers be able to **die permanently** in the campaign (and trigger story beats), or only be captured as now?
- How much text can you write or review per beat? I'd keep each beat under about 80 words, with one choice at most.
- Do you want the Korean version written by me, or reviewed by you before it goes in?
