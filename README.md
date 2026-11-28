# Castle Defense

A top-down 2D castle defense prototype built with Phaser 3. You control a hero (Warrior, Mage or Archer) MOBA-style, with three skills you pick from nine, build towers, upgrade your Keep, pick items as you level up, and hold off endless waves that come down three lanes across a river. Allied creeps march out of your lane towers, neutral camps wait in the forest, and the run ends when the Keep falls.

All visuals are drawn shapes and all sounds are synthesized. The game uses no image or audio assets.

## Play

There's nothing to install or build. Open `index.html` in a browser. An internet connection is needed because Phaser loads from a CDN.

If your browser refuses to run it from a local file, serve the folder instead:

```sh
python -m http.server
# then open http://localhost:8000
```

Pick a hero in the menu, press **Enter** (or click **SKILLS**), pick 3 of the hero's 9 skills, then press **Enter** or click **START**.

## Controls

**Hero**
| Input | Action |
|---|---|
| Right-click | Move (hold to keep following the cursor) / attack a clicked enemy |
| A + left-click | Attack-move |
| S | Stop |
| Q / W / E | Your three skills, in the order you picked them. Aimed skills: press the key, then left-click (right-click / Esc / same key cancels). Instant skills fire on the key toward the cursor. Arcane Orb: press again to burst it |

**Camera**
| Input | Action |
|---|---|
| (default) | Free: push the mouse to a screen edge, middle-drag, or left-click the minimap |
| Hold Space | Follow the hero (the Keep while the hero is dead) |
| Minimap | Right-click to move the hero |

**Base & economy**
| Input | Action |
|---|---|
| V | Toggle the build panel |
| 1–4 | Place Arrow Tower / Cannon / Frost Tower / Gold Mine |
| Left-click a building | Select it (upgrade, sell) |
| U | Upgrade the Keep |

**Other:** **P** or **Esc** pauses (Esc first cancels placing, aiming or menus), **M** mutes.

## How it plays

- **Map:** the Keep sits west of a river. Three lanes cross it on bridges and branch through a forest to three enemy spawns in the east. Rocks, trees and the river block movement. The map is drawn from `docs/map-sketch.png`; `node tools/sketch2map.mjs docs/map-sketch.png` regenerates the grid in `CONFIG.map`.
- **Waves:** the first wave comes after 10 s; each next one 5 s after the last is wiped out. Clearing a wave pays the XP of every enemy in it, whoever killed them. Wave 1 has 15 enemies and each wave adds 5; every fifth wave brings a boss in place of 10 of them. Enemy stats scale forever.
- **Lane towers and creeps:** each lane has 2–3 allied towers. Every minute, 5 creeps march from the lane's first tower (the one nearest the Keep) toward the enemy spawn. Lose that tower and the lane gets no more creeps. Towers are never rebuilt.
- **Neutral camps:** monsters in the corners and the forest fight back only when the hero hits them. They give gold and XP, and a cleared camp refills on the next minute tick.
- **Buildings** go on any grass or dirt tile (not rocks, trees, the river or bridges). They block movement, so enemies attack the ones in their way. Sappers go straight for towers and buildings. A spot that would wall off every route to the Keep is refused.
- **Keep tiers (1–4):** each tier adds Keep HP, makes lane towers and creeps 15% stronger, unlocks buildings, and later gives the Keep its own attack and nearby structure repair.
- **Heroes:** the Warrior has the most HP and regen and cleaves everything in a half circle; the Mage is the fastest and most fragile and throws exploding fireballs; the Archer shoots fast single-target arrows. Each level adds HP, HP regen, attack speed, move speed and damage, at a rate that depends on the class. No level cap, and skills grow stronger every level. There is no mana, only cooldowns.
- **Items:** every level-up offers a choice of items. Picking one you own levels it up, and owned items show up more often. There is no slot limit. Gold (from kills and a payout every minute) only buys buildings and Keep tiers.
- **Score:** based on waves, kills, hero level and time. The best score is saved in your browser.

## Balance simulation

The simulation runs headless, in several Chrome windows at once. A bot plays each hero, skill loadout (`CONFIG.sim.loadouts`), strategy and seed in the real game at high speed:

```
node .claude/skills/verify-castle-defense/scripts/cdg.mjs launch
node tools/simpar.mjs                                  # full sweep, one window per two logical cores
node tools/simpar.mjs 6 '{"heroes":["mage"],"seeds":5,"waveCap":20}'
node .claude/skills/verify-castle-defense/scripts/cdg.mjs stop
```

It writes a report to `.verify/artifacts/` as `.md` and `.json`. The Markdown report shows waves cleared per class, per hero loadout and strategy, plus automatic balance flags and the full tables: damage share by source, building damage per gold, skill usage, hero and Keep damage taken, economy, Keep HP over time, item timings and every run. The JSON holds the raw data for diffing two balance passes. Bot behavior, strategies and flag thresholds are in `CONFIG.sim`.

## Development

- Plain JavaScript, no modules or build step. Files load in order through `<script>` tags in `index.html`, so add new files there.
- All balance numbers (stats, costs, cooldowns, wave scaling) live in `src/config.js`.

```
src/
  config.js    tunable numbers
  main.js      Phaser boot
  scenes/      Menu, Game (simulation), UI (HUD), GameOver, MapEditor
  sim/         balance simulation: runner, bot, recorder, report
  entities/    Unit base, Hero, Enemy (also neutral camps), Ally (lane creeps), Building, Tower (lane towers), Keep, Projectile
  heroes/      HeroKit base and the Warrior, Mage and Archer skill kits
  systems/     waves, pathing (flow fields), combat, economy, building, item picks, leveling, game feel
tools/         sketch2map.mjs (map sketch PNG → CONFIG.map grid), png.mjs
docs/          map-sketch.png
```
