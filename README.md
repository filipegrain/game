# Castle Defense

A top-down 2D castle defense prototype built with Phaser 3. You control a hero (Warrior or Mage) MOBA-style, build towers, upgrade your Keep, buy items, and hold off endless waves that come down three connected lanes. The run ends when the Keep falls.

All visuals are drawn shapes and all sounds are synthesized. The game uses no image or audio assets.

## Play

There's nothing to install or build. Open `index.html` in a browser. An internet connection is needed because Phaser loads from a CDN.

If your browser refuses to run it from a local file, serve the folder instead:

```sh
python -m http.server
# then open http://localhost:8000
```

Pick a hero and a difficulty (Easy / Medium / Hard) in the menu, then press **Enter** or click to start.

## Controls

**Hero**
| Input | Action |
|---|---|
| Right-click | Move (hold to keep following the cursor) / attack a clicked enemy |
| A + left-click | Attack-move |
| S | Stop |
| Q / W / E / R | Aim a skill, then left-click to cast at the cursor (right-click / Esc / same key cancels). War Cry casts on key press. Mage Q toggles Fire Bolt autocast |

**Camera**
| Input | Action |
|---|---|
| (default) | Locked on the hero (on the Keep while the hero is dead) |
| Hold Space | Look around: screen edges, middle-drag, or left-click the minimap |
| Minimap | Right-click to move the hero |

**Base & economy**
| Input | Action |
|---|---|
| V | Toggle the build panel |
| 1–5 | Place Arrow Tower / Cannon / Frost Tower / Barracks / Gold Mine |
| Left-click a building | Select it (upgrade, sell) |
| U | Upgrade the Keep |
| B | Toggle the shop |
| F | Rally allies to a spot (press F twice to return them to auto mode) |
| N / Enter | Start the next wave early (bonus gold) |

**Other:** **P** or **Esc** pauses (Esc first cancels placing, aiming or menus), **M** mutes.

## How it plays

- **Waves:** a build-phase countdown comes before each wave. Starting early pays bonus gold. Every fifth wave includes a boss, and the waves scale forever.
- **Buildings** can't be damaged; enemies only fight the hero, allies and the Keep. Sappers ignore everything and rush the Keep.
- **Keep tiers (1–4):** each tier adds HP and more allies, unlocks new buildings, and later gives the Keep its own attack and auto-repair.
- **Leveling:** no level cap. All skills are available from the start, grow stronger every level, and unlock extra effects at milestone levels. There is no mana, only cooldowns.
- **Shop:** 6 item slots, one per item type. Buy an item again to level it up. You can buy anytime, anywhere, and items sell back for 50% of what you spent.
- **Score:** based on waves, kills, hero level and time. The best score for each difficulty is saved in your browser.

## Balance simulation

**Simulate** on the main menu opens a setup panel. Pick heroes, difficulties, strategies, seeds per combination and a wave cap, then **Run**. A bot plays each combination in the real game at high speed. You can watch it, or cancel and keep a report of the runs that finished.

The report screen shows waves cleared per hero, strategy and difficulty, plus automatic balance flags. **Download .md** gives the full tables: damage share by source, building damage per gold, skill usage, hero and Keep damage taken, economy, Keep HP over time, item timings and every run. **Download .json** gives the raw data for diffing two balance passes. **Last report** on the menu reopens the most recent one. Bot behavior, strategies and flag thresholds are in `CONFIG.sim`.

## Development

- Plain JavaScript, no modules or build step. Files load in order through `<script>` tags in `index.html`, so add new files there.
- All balance numbers (stats, costs, cooldowns, wave scaling, difficulty) live in `src/config.js`.
- `PLAN.md` holds the full design document and milestones.

```
src/
  config.js    tunable numbers
  main.js      Phaser boot
  scenes/      Menu, Game (simulation), UI (HUD), GameOver, SimScenes (balance sim setup/progress/report)
  sim/         balance simulation: runner, bot, recorder, report
  entities/    Unit base, Hero, Enemy, Ally, Building, Keep, Projectile
  heroes/      Warrior and Mage skill kits
  systems/     waves, pathing (flow field), combat, economy, building, shop, leveling, ally commands, game feel
```
