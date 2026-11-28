# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Castle-defense prototype: top-down 2D, hero-controlled (Warrior/Mage/Archer, MOBA-style) lane defense with endless waves, allied lane towers and creeps, and neutral camps.

Design priorities: (1) hero movement feels great, (2) skills feel powerful, (3) everything else supports those.

## Running

There is no build step, package manager, linter or test suite. Phaser 3.80.1 loads from a CDN in `index.html`.
- Play: open `index.html` in a browser. If the browser blocks `file://`, serve the folder instead (e.g. `python -m http.server`) and open `http://localhost:8000`.
- Verify changes by playing in the browser and watching the console. The Playwright MCP tools can drive the game.

## Constraints

- Plain JavaScript loaded with ordered `<script>` tags. There are no modules or imports: every class or object is a global. **A new file must be added to `index.html` in dependency order** (config → Feel/Pathing/Combat → entities → hero kits → systems → scenes → `main.js`).
- Visuals are Phaser `Graphics` shapes and colors only. No image assets and no sprite animations; tweens for feedback are fine. Sound is synthesized with WebAudio (`Sfx` in `Feel.js`).
- **All tunable numbers live in `src/config.js` (`CONFIG`).** Skill values are level-1 scalars scaled by hero level through `Hero.skillDamage/skillRadius/skillDuration/skillCooldown` (`heroCommon.skillScaling`); `HeroKit.dmg(def)` adds `adMul` × attack damage. Hero stats grow per level from `heroes[key].perLevel` (flat hp/hpRegen/damage, attackSpeed and speed as fractions; armor does not grow). Arrays inside buildings are indexed by `level - 1`. The map (ASCII tile grid plus Keep, spawn, tower and camp markers) lives in `src/map.js` (`MAP`, spread into `CONFIG.map`) and is edited in-game with the map editor (Menu → Map Editor, `MapEditorScene`), which rewrites that file through the browser's File System Access API. Marker positions are in tiles (32px); convert with `CONFIG.px()`.

## Architecture

**Scenes** (`src/scenes/`): `MenuScene` (hero select) → `GameScene` (the whole simulation, input and camera) plus `UIScene` (HUD, launched in parallel) → `GameOverScene`.

**GameScene owns all game state.** It keeps the entity arrays (`enemies` — neutral camp monsters included, flagged `neutral` —, `allies`, `buildings`, `towers`, `projectiles`) and the system instances (`pathing`, `economy`, `leveling`, `picks`, `build`, `waves`). Entities and systems hold a `scene` reference and reach everything through it (e.g. `this.scene.economy`, `this.scene.enemies`).

**Manual update loop:** `GameScene.update` clamps dt to 0.05, returns early on pause, game over or hitstop, and then updates every system and entity explicitly. Dead entities get `alive = false` and are filtered out of their arrays at the end of the frame. Use `scene.timers` (`{t, fn}`) for delayed gameplay effects, not Phaser timers, so that pause and hitstop also stop them.

**UI ↔ game communication:** `GameScene` emits events on `this.events` (`waveStart`, `levelUp`, `towerLost`, `buildingLost`, `goldChanged`, `keepHit`, `skillReady`, `inventoryChanged`, `selectionChanged`, `notice`, …). `UIScene` subscribes through its `on()` helper, which unsubscribes on shutdown. `UIScene` also polls `gs` state every frame for bars and cooldowns. `GameScene` asks `ui.isOverUI(x, y)` so that clicks on the HUD don't reach the world.

**Entities:** `Unit` is the base for `Hero`, `Enemy` and `Ally`. It holds position, velocity, knockback, the `status` effects object (slow/stun/taunt/haste/freeze/vulnerability/polymorph…), drawing to its own `Graphics`, and `nav`. `Building`, `Tower` (allied lane towers from `CONFIG.map.towers`) and `Keep` are structures (`isStructure`); all take damage. `Ally` is a lane creep: spawned at its lane's first tower each wave tick, it walks to the lane's bridge, then down `pathing.spawnDist[lane]` toward the enemy spawn. Neutral camp monsters are `Enemy` with `camp` set: only the hero can damage them (`Combat.dealDamage`), `Combat.nearestEnemy`/`enemiesByDistance` skip them by default, and they fight back only once the hero hits them. Units don't collide with each other, only with terrain and buildings; `separateUnits` applies a soft push-apart within one team.

**Hero skills:** each hero has nine active skills in `CONFIG.skills[hero]` (keyed by skill id; `def.id` is filled in at load). Before the run the player picks `heroCommon.skillPicks` (3) on `MenuScene`'s skill card; `GameScene` gets them as `data.skills` and `Hero` binds them to `SKILL_KEYS` (Q/W/E) in pick order (`hero.skillIds[key]`, `hero.skillDefs[key]`). `Hero` delegates to a kit (`WarriorKit` / `MageKit` / `ArcherKit`, all extending `HeroKit` in `src/heroes/`): `kit.cast(key, x, y)` calls the kit method named after the skill id; returning `false` (e.g. no enemy near the cursor for a `target` skill) costs no cooldown. `cast` is `aim` (key sets `hero.aiming`, left-click calls `hero.confirmAim`; `def.aim` picks the indicator) or `instant` (fires on key press toward the cursor). `HeroKit` provides the building blocks: one `motion` at a time (dashes, leaps; `kit.busy` blocks other actions and buffers casts for `heroCommon.skillBufferTime`), a `channel` (Snipe), and `effects` (zones, traps, shockwaves) updated every frame, plus hero hooks `moveMul`, `moveShoot`, `forceCrit`, `onIncoming` (damage about to hit the hero) and `recast`. No mana: cooldowns only. Basic attacks come from `heroes[key].attack`: `cleave` (half circle), `splash` (exploding fireball) or `arrow`; cleave and splash spare neutral camps unless the main target is one.

**Shared singletons** (global objects, initialized per GameScene):
- `Combat`: `dealDamage(target, amount, opts)` is the single damage path (armor, structure multiplier, crits, lifesteal, knockback, damage numbers, kill credit). Route all damage through it.
- `Feel` / `Sfx` / `Settings`: particles, damage numbers, shake, hitstop, click rings, trails, sound, and persisted settings (`localStorage` key `cd_settings`).

**Pathing** (`Pathing.js`): a tile grid (`TILE_T`: grass/dirt/bridge are walkable; water/rock/tree/keep block) and cost-weighted flow fields (grass costs `map.grassCost`, so units keep to dirt lanes): `dist` toward the Keep, `spawnDist[i]` toward each enemy spawn, `bridgeDist[i]` toward each lane's bridge. `laneNext(unit, field)` routes a unit via its lane's bridge first, so every lane keeps its own crossing. Buildings block movement and every placement recomputes the fields; `BuildSystem.checkPlace` refuses a spot that would cut a spawn off from the Keep (`wouldDisconnect`), and an enemy that stops making flow progress attacks the nearest building.

**Items** come only from level-ups: `ItemPicks` (`scene.picks`) offers `CONFIG.itemPickCount` items, weighted toward owned ones, and `GameScene` pauses while `picks.choices` is set. Items have no slot limit; `hero.itemLevels` holds everything owned. Gold only buys buildings and Keep tiers.

**Waves** (`WaveManager`): wave 1 starts after `CONFIG.waves.firstDelay` s; a wave is cleared once all of it has spawned and died, which pays the hero the XP of every enemy in it (`waveCleared` event) and starts the next wave `clearDelay` s later. Kills give gold; only neutral camp kills give XP directly. Separately, a tick every `tickInterval` s (the first at `firstDelay`) spawns creeps at each lane whose first tower stands, refills cleared camps and pays tick gold and Gold Mine income. No build phase. **Enemy targeting:** nearest hero, creep or lane tower within aggro, buildings right next to them, the Keep in range; Sappers (`structureBreaker`) go for towers and buildings; taunt (`status.tauntBy`) overrides.

**Camera** is free (screen-edge pan, middle-drag, minimap left-click) and starts on the Keep; holding Space follows the hero.

**Balance simulation** (`src/sim/`, headless only: `node tools/simpar.mjs [windows] [settings JSON]` after `cdg launch`): `tools/simpar.mjs` splits the job list across Chrome windows (`SimRunner` `shard`) and merges the runs with `SimReport` into `.verify/artifacts/`. `SimRunner` restarts `GameScene` with `data.sim`, where `SimBot` replaces input and `SimRecorder` collects stats, and steps it in fixed ticks with `Feel`/`Sfx` off and `Math.random` seeded. Every job runs once per loadout in `CONFIG.sim.loadouts[hero]` (skill ids), and `SimBot.SKILL_AI[id]` decides when and where the bot casts each skill. Keep it working when changing gameplay: tag skill damage with its skill id (`HeroKit.hit` does), give a new skill a `SimBot.SKILL_AI` rule, keep gameplay timing on `scene.timers`/`update(dt)` rather than tweens or Phaser timers, add new spending options to `SimBot.resolve` and `CONFIG.sim.strategies`, and add new items to `CONFIG.sim.itemBuilds` (the bot's pick priority).

**Persistence:** best score in `localStorage` under `CONFIG.score.bestKey`.
