# Castle Defense

A top-down 2D castle defense prototype built with Phaser 3. You control a hero (Warrior or Mage) MOBA-style, build walls and towers, upgrade your Keep, buy items, and hold off endless waves that come down three connected lanes. The run ends when the Keep falls.

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
| Q / W / E / R | Cast skill at the cursor (hold to see the aim indicator, release to cast) |
| Ctrl/Shift + Q/W/E/R | Spend a skill point |

**Camera**
| Input | Action |
|---|---|
| Mouse at screen edge / arrow keys / middle-drag | Pan |
| Space | Tap to jump to the hero, hold to follow |
| Y | Toggle camera lock on the hero |
| Minimap | Left-click to jump the camera, right-click to move the hero |

**Base & economy**
| Input | Action |
|---|---|
| V | Toggle the build panel |
| 1–6 | Place Wall / Arrow Tower / Cannon / Frost Tower / Barracks / Gold Mine |
| Left-click a building | Select it (upgrade, repair, sell) |
| U | Upgrade the Keep |
| B | Toggle the shop |
| F | Rally allies to a spot (press F twice to return them to auto mode) |
| N / Enter | Start the next wave early (bonus gold) |

**Other:** **P** or **Esc** pauses (Esc first cancels placing, aiming or menus), **M** mutes.

## How it plays

- **Waves:** a build-phase countdown comes before each wave. Starting early pays bonus gold. Every fifth wave includes a boss, and the waves scale forever.
- **Lanes:** walls fully block a lane. Enemies then reroute through the always-open connectors, or attack the wall if the detour is too long.
- **Keep tiers (1–4):** each tier adds HP and more allies, unlocks new buildings, and later gives the Keep its own attack and auto-repair.
- **Leveling:** the hero reaches level 12 at most. Q/W/E have 3 ranks each, and R ranks unlock at levels 4, 8 and 12.
- **Shop:** 6 item slots. You can buy anytime, anywhere, and items sell back for 50%.
- **Score:** based on waves, kills, hero level and time. The best score for each difficulty is saved in your browser.

## Development

- Plain JavaScript, no modules or build step. Files load in order through `<script>` tags in `index.html`, so add new files there.
- All balance numbers (stats, costs, cooldowns, wave scaling, difficulty) live in `src/config.js`.
- `PLAN.md` holds the full design document and milestones.

```
src/
  config.js    tunable numbers
  main.js      Phaser boot
  scenes/      Menu, Game (simulation), UI (HUD), GameOver
  entities/    Unit base, Hero, Enemy, Ally, Building, Keep, Projectile
  heroes/      Warrior and Mage skill kits
  systems/     waves, pathing (flow field), combat, economy, building, shop, leveling, ally commands, game feel
```
