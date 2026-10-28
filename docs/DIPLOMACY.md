# Diplomacy

Status: **built** (Phase 11): sim (`js/sim/diplo.js`), commands, AI, Diplomacy sheet (`js/ui/diplo.js`), alerts, map rings, campaign hooks and Korean. This file is the spec. Differences from the first draft are listed under "As built" at the end.

## Principles
- **Two states only: enemy and ally.** Everybody starts as an enemy (as now). There is **no truce**: a forced pause would only let a losing faction heal. An AI that has a bigger target simply leaves you alone, which it already does by choosing targets.
- **Betray at the end.** The win condition stays "hold every node", so an ally always has to be dealt with in the end. Breaking an alliance is always possible, and always costly.
- **A weak faction can be offered terms (merge).** The strong one asks the weak one to withdraw and join it. For a player this is a loss, so the player can always refuse and fight to the last city. For the AI it is plain survival: nobody dies and nothing is lost.
- Everything is a command (`VM.Commands.exec`) and the sim stays deterministic, with no randomness in the AI's answers. State is plain JSON (`state.diplo`), created lazily so old saves still load.

## State (`state.diplo`)
| Field | Meaning |
|---|---|
| `allies` | list of `{ a, b, since }`. A faction has at most one ally (a pact is a pair). |
| `opinion` | `opinion[a][b]`, from -100 to +100: how faction a feels about b. Decays toward 0, rises for allies, falls when cities are captured. |
| `trust` | `trust[f]`, 0 to -100: a faction's reputation as an oath-breaker. Every AI weighs it when judging f. Recovers slowly. |
| `cool` | `cool["a-b"]` = time until a may propose to b again (after a refusal or a break). |
| `offers` | pending proposals to the player: `{ id, from, to, kind: 'alliance' \| 'merge', t, until }`. |
| `mergeCool` | `mergeCool[f]` = time until f may absorb another faction. |
| `start` | each faction's number of cities at the start (used to see who is collapsing). |
| `log` | the last events, for the sheet. |

## Alliance
- **Proposing:** `proposeAlliance { to }`. If `to` is an AI it answers at once (accept or refuse with a reason); if it is the player, the offer waits in `offers` until answered (`answerOffer`). Costs nothing, but a refusal starts a 30-day cool-down for that pair.
- **AI answer** (`Diplo.allianceScore`, accepts at 25 or more): 0.4 × its opinion of the proposer; +30 if a third faction is a bigger threat to both (shares the larger neighbour and is stronger than each); +10 if the two are of comparable strength; -40 if the proposer has broken a pact (`trust` below -30); -25 if the AI's own leader is Schemer-minded (trait Schemer: it keeps its hands free); +campaign story ties (friends or kin across the two houses +8 each, rivals -8 each). Refuses outright if either already has an ally.
- **Effects of an alliance:** allies are not hostile: their armies do not fight, besiege or capture each other, and armies may enter, stand in and pass through each other's cities and supply each other's territory (allied land is not "foreign" for the army's rations). AI target choice and threat counts skip allies. Allies' opinion drifts up (+0.1 a day, to 60).
- **Asking for help:** none is forced. The ally's AI naturally fights its own enemies, and a shared enemy raises its alliance score.
- **Breaking:** `breakAlliance` is instant. Cost: `trust` of the breaker -30, every faction's opinion of the breaker -30 (the former ally's -60), the pair cannot ally again for 90 days, and the breaker's own officers lose loyalty (-5, and -12 for Loyal ones). Armies of the two sides that are standing in each other's cities become hostile at once, so treachery inside the walls is a real battle.
- **The AI betrays too, at the end:** an AI ally breaks the pact only when the pact is at least 90 days old, its leader is not Loyal, and either the two of them hold all but at most two nodes, or it is at least 3× the ally's strength and holds 45% or more of the nodes. It then goes for you like any enemy, so keep your guard up.

## Merge (terms offered to a weak faction)
- **Eligibility** (`Diplo.canMerge(strong, weak)`): `power(strong) >= 3 × power(weak)` (`power` = soldiers + 0.1 × population), the strong faction is not in its 60-day merge cool-down, neither is the neutral faction. Allies may be asked too.
- **Who asks:** the player (`proposeMerge { to }`) to a weak AI; an AI to a weak AI; an AI to the player (an offer in the queue).
- **AI (weak side) answer** (`Diplo.survival`, accepts at 50 or more): +30 if its capital is besieged or contested; +25 if it has lost a third or more of its starting cities; +20 if it holds two cities or fewer; +20 for strength ratio of 5 or more (+10 for 3 to 5); +10 for each pair of leader traits: Cautious +20, Greedy +10, Schemer +10, Loyal 0, Rash -30, Brave -35 (its leader is its governor of the capital, else its best officer); +10 if it likes the proposer (opinion 20 or more); -40 if the proposer has broken a pact (`trust` below -30). A refusal starts a 60-day cool-down for that pair.
- **Result:** every city, army, officer, and the gold and food of the weak faction pass to the strong one at once. Nothing is lost: no pop loss, no deaths. Officers keep their post but their loyalty is set to 50 (less 10 for each story tie to an enemy of their new house, more for ties to friends). The weak faction is gone (`alive = false`), a `merged` event is pushed, and the strong faction cannot absorb another for 60 days.
- **Player as the weak side:** an offer appears in the Diplomacy sheet and as an alert. **Decline** = fight on (the same offer returns after 60 days at the earliest). **Accept** ends the game with a `merged` ending: "you survived under X's banner". In a campaign the ending page is part of the story (`MERGED` text per house), and the game returns to the menu.

## Interface
- A **Diplomacy** button in the top bar opens a sheet: each other faction with colour, a strength bar, number of cities, status (Enemy / Ally), the opinion of you and the buttons *Propose alliance*, *Gift 100g*, *Offer terms* (only when eligible), *Break alliance*. Offers to you sit at the top with *Accept* and *Decline*.
- Allies are shown on the map with a ring of the ally's colour round your cities and a small "ally" tag in the node panel; their armies are no longer drawn as enemies in the 3D city.
- Alerts: *offer received*, *alliance formed*, *alliance broken (by X)*, *X has merged into Y*; offers pause the game like proposals do (category `diplo`).
- Korean text for all of it.

## Opinion rules
- Decay 0.15 a day toward 0. Allies +0.1 a day.
- Gift: `giftFaction { to, gold }` (100 or 300): +4 or +12 opinion, no more than 100 gold per 10 days per target.
- A city captured from f by g: f's opinion of g -15. A captured faction leader's allies hold a grudge: opinion of the attacker -5 among the victim's ally.
- Breaking a pact: see above.

## Campaign hooks (story)
- Ties between officers across two houses move their opinion at the start (friend/kin +8, love +12, rival -8).
- Beats can read the diplomatic state (allied with X, or merged) and the endings have a *merged* variant for each house.
- Each house has a written preference (`FACTIONS[...].diplo`): a house that "does not bend the knee" refuses merges outright, a merchant house accepts alliances more easily. Used as a small bonus to the scores above.

## Balance and tests
- `tools/test_diplo.js`: allied armies do not fight, besiege or capture; pass-through and supply; breaking and costs; the 90-day pact limit; merge transfer (cities, armies, officers, resources); eligibility; the AI answers (deterministic); old saves load; a 5-year AI-vs-AI run in which alliances form, someone betrays and the game still ends or stays sane.
- `tools/ai_tournament.js` must show that the human can still win on hard after diplomacy is on.
- Browser: `tools/ui_diplo.js` (sheet, offers, accept and decline, game-over by merge).

## As built
- Files: `js/sim/diplo.js` (rules and AI), `js/ui/diplo.js` (sheet), settings in `VM.CFG.DIPLO` (`js/data/config.js`), commands `proposeAlliance`, `breakAlliance`, `giftFaction`, `proposeMerge`, `answerOffer`.
- Everywhere the war and army code asked "is this owner different from mine?" it now asks `VM.Diplo.hostile/friendly` (fights, sieges, capture, supply lines, passing through cities, AI targets and threats, officers' threat sense and sorties, the 3D city's "hostile" armies).
- The AI thinks about diplomacy every 12 days per faction (staggered). It offers terms to the weakest eligible faction first, then looks for the best-liked partner. Offers to the player wait 20 days.
- A proposal the AI answers returns `{ ok: true, accepted, why }`; a refusal is not an error. A faction that is not the player and not `aiAll` answers at once; an offer to the player is queued in `state.diplo.offers`.
- Gifts: 100 gold (+4 opinion) or 300 (+12); the sheet offers the 100 gold one. One gift per pair per 10 days.
- Campaign: `FACTIONS[i].diplo` (`ally`, `merge` bonuses; Kaldrath and Thornreach never bend the knee, Orsolyn allies and yields more easily), start opinions from ties between houses, chronicle notes for pacts, betrayals and merges, and a *merged* ending page ("Under Another Banner").
- Tests: `tools/test_diplo.js` (21), `tools/ui_diplo.js` (26 checks, desktop and phone); the 30-year AI-vs-AI tournament still finishes (8 of 8 games).
- Not done: marriage alliances, hostages, asking an ally for help, a per-house merged ending text (one shared page is used), alliance marks in the 3D city view.

## Added later: help, marriage, hostages
- **Ask for help** (`Diplo.askAid`, command `askAid`): an ally sends up to 2 of its idle armies (3 if married) to one of your besieged or contested cities, 40 days, 30-day cool-down per asker. AI allies do this on their own for a partner under threat (`Diplo.sendAid` from the daily step). Armies on help (`army.aid`) are not ordered around by the AI until it ends.
- **Marriage** (`marry`): 300 gold dowry to the ally, pact at least 60 days old, ally's opinion of you 30 or more. Married pact: AI never betrays it, +1 army when asked for help, breaking it costs double trust and opinion.
- **Hostages** (`exchangeHostages`): the weakest idle officer of each side goes to the other's capital with role `hostage` (cannot lead or govern). An AI ally does not betray while hostages are held. On a break the breaker's hostage joins the wronged house; in all other ends (a house falls, a merge) they go home.
- Only the player proposes marriages and hostages; the AI never does.
