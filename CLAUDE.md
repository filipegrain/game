# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Castle-defense prototype: top-down 2D, hero-controlled (Warrior/Mage, MOBA-style) lane defense with endless waves. `PLAN.md` is the design spec. It covers mechanics, controls, milestones and a decisions log, so check it before changing gameplay and add any new design decision to section 13.

Design priorities from the plan: (1) hero movement feels great, (2) skills feel powerful, (3) everything else supports those.

## Running

There is no build step, package manager, linter or test suite. Phaser 3.80.1 loads from a CDN in `index.html`.
- Play: open `index.html` in a browser. If the browser blocks `file://`, serve the folder instead (e.g. `python -m http.server`) and open `http://localhost:8000`.
- Verify changes by playing in the browser and watching the console. The Playwright MCP tools can drive the game.

## Constraints

- Plain JavaScript loaded with ordered `<script>` tags. There are no modules or imports: every class or object is a global. **A new file must be added to `index.html` in dependency order** (config → Feel/Pathing/Combat → entities → hero kits → systems → scenes → `main.js`).
- Visuals are Phaser `Graphics` shapes and colors only. No image assets and no sprite animations; tweens for feedback are fine. Sound is synthesized with WebAudio (`Sfx` in `Feel.js`).
- **All tunable numbers live in `src/config.js` (`CONFIG`).** Skill values are level-1 scalars scaled by hero level through `Hero.skillDamage/skillRadius/skillDuration/skillCooldown` (`heroCommon.skillScaling`); extra effects unlock via `milestones` (`hero.hasMilestone(key, id)`). Arrays inside buildings are indexed by `level - 1`. Map rectangles are in tiles (32px); convert with `CONFIG.px()`.

## Architecture

**Scenes** (`src/scenes/`): `MenuScene` (hero and difficulty select) → `GameScene` (the whole simulation, input and camera) plus `UIScene` (HUD, launched in parallel) → `GameOverScene`.

**GameScene owns all game state.** It keeps the entity arrays (`enemies`, `allies`, `buildings`, `projectiles`) and the system instances (`pathing`, `economy`, `leveling`, `shop`, `build`, `allyCommand`, `waves`). Entities and systems hold a `scene` reference and reach everything through it (e.g. `this.scene.economy`, `this.scene.enemies`).

**Manual update loop:** `GameScene.update` clamps dt to 0.05, returns early on pause, game over or hitstop, and then updates every system and entity explicitly. Dead entities get `alive = false` and are filtered out of their arrays at the end of the frame. Use `scene.timers` (`{t, fn}`) for delayed gameplay effects, not Phaser timers, so that pause and hitstop also stop them.

**UI ↔ game communication:** `GameScene` emits events on `this.events` (`waveStart`, `waveCleared`, `levelUp`, `goldChanged`, `keepHit`, `skillReady`, `inventoryChanged`, `selectionChanged`, `notice`, …). `UIScene` subscribes through its `on()` helper, which unsubscribes on shutdown. `UIScene` also polls `gs` state every frame for bars and cooldowns. `GameScene` asks `ui.isOverUI(x, y)` so that clicks on the HUD don't reach the world.

**Entities:** `Unit` is the base for `Hero`, `Enemy` and `Ally`. It holds position, velocity, knockback, the `status` effects object (slow/stun/taunt/bleed/haste/freeze…), drawing to its own `Graphics`, and `nav`. `Building` and `Keep` are structures (`isStructure`). Units don't collide with each other, only with terrain and buildings; `separateUnits` applies a soft push-apart within one team.

**Hero skills:** `Hero` delegates Q/W/E/R to a kit object (`WarriorKit` / `MageKit` in `src/heroes/`) via `kit.cast(key, x, y)`. Each skill has a `cast` mode: `aim` (key sets `hero.aiming`, left-click calls `hero.confirmAim`), `instant` (fires on key press) or `auto` (`kit.toggleAuto`; Mage Fire Bolt fires from `kit.onAttack`). No mana: cooldowns only. `kit.busy` (dash or leap in progress) blocks other actions, and a skill cast while busy is buffered (`heroCommon.skillBufferTime`). Skill numbers come from `CONFIG.skills[hero][key]`.

**Shared singletons** (global objects, initialized per GameScene):
- `Combat`: `dealDamage(target, amount, opts)` is the single damage path (armor, structure multiplier, crits, lifesteal, knockback, damage numbers, kill credit). Route all damage through it.
- `Feel` / `Sfx` / `Settings`: particles, damage numbers, shake, hitstop, click rings, trails, sound, and persisted settings (`localStorage` key `cd_settings`).

**Pathing** (`Pathing.js`): a tile grid with types (`TILE_T`: terrain/path/connector/keep) and a flow field toward the Keep. Buildings only go on terrain next to lanes, so they never affect the flow field. There are no walls.

**Buildings** are immune (`isBuilding`; `Combat.dealDamage` ignores them) and enemies never target them. Only the Keep, hero and allies take damage.

**Camera** is locked on the hero (on the Keep while dead); holding Space enables free look.

**Persistence:** best score per difficulty in `localStorage` under `cd_best_<difficulty>`.
