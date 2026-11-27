# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Castle-defense prototype: top-down 2D, hero-controlled (Warrior/Mage, MOBA-style) lane defense with endless timed waves, allied lane towers and creeps, and neutral camps.

Design priorities: (1) hero movement feels great, (2) skills feel powerful, (3) everything else supports those.

## Running

There is no build step, package manager, linter or test suite. Phaser 3.80.1 loads from a CDN in `index.html`.
- Play: open `index.html` in a browser. If the browser blocks `file://`, serve the folder instead (e.g. `python -m http.server`) and open `http://localhost:8000`.
- Verify changes by playing in the browser and watching the console. The Playwright MCP tools can drive the game.

## Constraints

- Plain JavaScript loaded with ordered `<script>` tags. There are no modules or imports: every class or object is a global. **A new file must be added to `index.html` in dependency order** (config → Feel/Pathing/Combat → entities → hero kits → systems → scenes → `main.js`).
- Visuals are Phaser `Graphics` shapes and colors only. No image assets and no sprite animations; tweens for feedback are fine. Sound is synthesized with WebAudio (`Sfx` in `Feel.js`).
- **All tunable numbers live in `src/config.js` (`CONFIG`).** Skill values are level-1 scalars scaled by hero level through `Hero.skillDamage/skillRadius/skillDuration/skillCooldown` (`heroCommon.skillScaling`); extra effects unlock via `milestones` (`hero.hasMilestone(key, id)`). Arrays inside buildings are indexed by `level - 1`. The map (ASCII tile grid plus Keep, spawn, tower and camp markers) lives in `src/map.js` (`MAP`, spread into `CONFIG.map`) and is edited in-game with the map editor (Menu → Map Editor, `MapEditorScene`), which rewrites that file through the browser's File System Access API. Marker positions are in tiles (32px); convert with `CONFIG.px()`.

## Architecture

**Scenes** (`src/scenes/`): `MenuScene` (hero select) → `GameScene` (the whole simulation, input and camera) plus `UIScene` (HUD, launched in parallel) → `GameOverScene`.

**GameScene owns all game state.** It keeps the entity arrays (`enemies` — neutral camp monsters included, flagged `neutral` —, `allies`, `buildings`, `towers`, `projectiles`) and the system instances (`pathing`, `economy`, `leveling`, `picks`, `build`, `waves`). Entities and systems hold a `scene` reference and reach everything through it (e.g. `this.scene.economy`, `this.scene.enemies`).

**Manual update loop:** `GameScene.update` clamps dt to 0.05, returns early on pause, game over or hitstop, and then updates every system and entity explicitly. Dead entities get `alive = false` and are filtered out of their arrays at the end of the frame. Use `scene.timers` (`{t, fn}`) for delayed gameplay effects, not Phaser timers, so that pause and hitstop also stop them.

**UI ↔ game communication:** `GameScene` emits events on `this.events` (`waveStart`, `levelUp`, `towerLost`, `buildingLost`, `goldChanged`, `keepHit`, `skillReady`, `inventoryChanged`, `selectionChanged`, `notice`, …). `UIScene` subscribes through its `on()` helper, which unsubscribes on shutdown. `UIScene` also polls `gs` state every frame for bars and cooldowns. `GameScene` asks `ui.isOverUI(x, y)` so that clicks on the HUD don't reach the world.

**Entities:** `Unit` is the base for `Hero`, `Enemy` and `Ally`. It holds position, velocity, knockback, the `status` effects object (slow/stun/taunt/bleed/haste/freeze…), drawing to its own `Graphics`, and `nav`. `Building`, `Tower` (allied lane towers from `CONFIG.map.towers`) and `Keep` are structures (`isStructure`); all take damage. `Ally` is a lane creep: spawned at its lane's first tower each wave tick, it walks to the lane's bridge, then down `pathing.spawnDist[lane]` toward the enemy spawn. Neutral camp monsters are `Enemy` with `camp` set: only the hero can damage them (`Combat.dealDamage`), `Combat.nearestEnemy`/`enemiesByDistance` skip them by default, and they fight back only once the hero hits them. Units don't collide with each other, only with terrain and buildings; `separateUnits` applies a soft push-apart within one team.

**Hero skills:** `Hero` delegates Q/W/E/R to a kit object (`WarriorKit` / `MageKit` in `src/heroes/`) via `kit.cast(key, x, y)`. Each skill has a `cast` mode: `aim` (key sets `hero.aiming`, left-click calls `hero.confirmAim`), `instant` (fires on key press), `auto` (`kit.toggleAuto`; Mage Fire Bolt fires from `kit.onAttack`) or `passive` (the key does nothing; the kit triggers it from hooks: `onAttack`, `onHurt`, `onKill`, `modifyStats`). Warrior Q/W/E are passive. No mana: cooldowns only. `kit.busy` (dash in progress) blocks other actions, and a skill cast while busy is buffered (`heroCommon.skillBufferTime`). Skill numbers come from `CONFIG.skills[hero][key]`.

**Shared singletons** (global objects, initialized per GameScene):
- `Combat`: `dealDamage(target, amount, opts)` is the single damage path (armor, structure multiplier, crits, lifesteal, knockback, damage numbers, kill credit). Route all damage through it.
- `Feel` / `Sfx` / `Settings`: particles, damage numbers, shake, hitstop, click rings, trails, sound, and persisted settings (`localStorage` key `cd_settings`).

**Pathing** (`Pathing.js`): a tile grid (`TILE_T`: grass/dirt/bridge are walkable; water/rock/tree/keep block) and cost-weighted flow fields (grass costs `map.grassCost`, so units keep to dirt lanes): `dist` toward the Keep, `spawnDist[i]` toward each enemy spawn, `bridgeDist[i]` toward each lane's bridge. `laneNext(unit, field)` routes a unit via its lane's bridge first, so every lane keeps its own crossing. Buildings block movement and every placement recomputes the fields; `BuildSystem.checkPlace` refuses a spot that would cut a spawn off from the Keep (`wouldDisconnect`), and an enemy that stops making flow progress attacks the nearest building.

**Items** come only from level-ups: `ItemPicks` (`scene.picks`) offers `CONFIG.itemPickCount` items, weighted toward owned ones, and `GameScene` pauses while `picks.choices` is set. Items have no slot limit; `hero.itemLevels` holds everything owned. Gold only buys buildings and Keep tiers.

**Waves** (`WaveManager`) are timed: every `CONFIG.waves.interval` s a tick spawns the wave at all three spawns, creeps at each lane whose first tower stands, refills cleared camps and pays tick gold. No build phase. **Enemy targeting:** nearest hero, creep or lane tower within aggro, buildings right next to them, the Keep in range; Sappers (`structureBreaker`) go for towers and buildings.

**Camera** is free (screen-edge pan, middle-drag, minimap left-click) and starts on the Keep; holding Space follows the hero.

**Balance simulation** (`src/sim/`, headless only: `node tools/simpar.mjs [windows] [settings JSON]` after `cdg launch`): `tools/simpar.mjs` splits the job list across Chrome windows (`SimRunner` `shard`) and merges the runs with `SimReport` into `.verify/artifacts/`. `SimRunner` restarts `GameScene` with `data.sim`, where `SimBot` replaces input and `SimRecorder` collects stats, and steps it in fixed ticks with `Feel`/`Sfx` off and `Math.random` seeded. Keep it working when changing gameplay: tag skill damage with its key (`skill: 'Q'`), keep gameplay timing on `scene.timers`/`update(dt)` rather than tweens or Phaser timers, add new spending options to `SimBot.resolve` and `CONFIG.sim.strategies`, and add new items to `CONFIG.sim.itemBuilds` (the bot's pick priority).

**Persistence:** best score in `localStorage` under `CONFIG.score.bestKey`.
