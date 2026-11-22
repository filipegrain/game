# Castle Defense Prototype — Plan v2

## 1. Core Concept
Top-down, single-screen 2D defense game. The **castle is always on the left**. Enemies attack along **3 lanes (top, right, bottom)** that **connect to each other**. The player controls a **hero (Warrior or Mage)** MOBA-style, builds walls/towers, **upgrades the castle**, buys items, and survives **endless waves**. A typical run lasts **~10 minutes** before difficulty overwhelms the player. Game ends when the **Keep** is destroyed.

**Design priorities:** (1) hero movement feels great, (2) skills feel powerful and fun, (3) everything else supports that.

## 2. Tech
- Phaser 3 via CDN, plain JavaScript, `<script>` tags (no build step, double-click `index.html` to play).
- All tunable numbers in `src/config.js` (stats, costs, cooldowns, wave scaling, difficulty modifiers).
- Shapes and colors only, no image assets, no animations (tweens for feedback are OK: flash, scale pop, shake).

```
game/
  index.html
  src/
    config.js                 ← balance, heroes, skills, items, buildings, waves, difficulty
    main.js
    scenes/   MenuScene.js (hero + difficulty select), GameScene.js, UIScene.js, GameOverScene.js
    entities/ Hero.js, Enemy.js, Ally.js, Building.js, Keep.js, Projectile.js
    heroes/   Warrior.js, Mage.js   ← skill implementations
    systems/  WaveManager.js, Pathing.js, Economy.js, BuildSystem.js, Shop.js,
              Leveling.js, AllyCommand.js, Combat.js, Feel.js
```

## 3. Map & Lanes
```
 ┌───────────────────────────────────────────┐
 │        ══════ TOP LANE ══════════ [spawn]  │
 │      ╔═╝            ║ (connector)          │
 │ KEEP ═══════════ MID/RIGHT LANE ══ [spawn] │
 │      ╚═╗            ║ (connector)          │
 │        ══════ BOTTOM LANE ═══════ [spawn]  │
 └───────────────────────────────────────────┘
```
- The map is larger than the screen: a grid of about 80×45 tiles of 32px (2560×1440), viewed through a 1280×720 window. Tiles are either **path** (walkable) or **terrain** (blocked, buildable for towers next to lanes).
- Lanes are joined by connectors. **Connectors are always open:** you can't build on them. Walling a lane pushes enemies through a connector into another lane.

### Camera (free, not locked to the hero)
- **Edge pan:** move the mouse to the screen edge to scroll. **Arrow keys** also pan. **Middle-mouse drag** pans too.
- **Space:** hold to keep the camera centered on the hero, or tap to jump to the hero. **Y:** toggle camera lock on the hero.
- **Minimap** (bottom-left): shows lanes, units, buildings and pings. Click it to jump the camera. Right-click on it to move the hero there.
- Camera movement is smoothed, and it stops at the map edges.
- **Pathing:** a flow field toward the Keep, recomputed whenever a building is placed or destroyed.
  - Walls **fully block**. A wall counts as a high-cost tile in the pathing. If the detour is cheaper, enemies reroute through a connector. If not, they stop at the wall and attack it until it breaks.
  - The game never lets the Keep become fully unreachable. In that case enemies always break through the cheapest wall.
- Each wave picks 1–3 lanes to spawn from. A lane indicator on the screen edge shows where the next wave will come from.

## 4. Game Loop
1. **Menu:** choose hero (Warrior/Mage) and difficulty (Easy/Medium/Hard).
2. **Build phase:** countdown (e.g. 25s). **"Start Next Wave"** button = early start with bonus gold scaled by time remaining.
3. **Wave phase:** enemies spawn in groups. Everything (shop, building, upgrades) works at all times.
4. Wave cleared → reward → next build phase.
5. **Endless:** wave scaling ramps (HP, count, new types, bosses every 5 waves). Tuned so a good Medium run lasts ~10 minutes.
6. **Game over screen:** waves survived, time, kills, hero level → score. Best score saved in localStorage per difficulty.

### Difficulty
| | Easy | Medium | Hard |
|---|---|---|---|
| Enemy HP/damage | ×0.75 | ×1.0 | ×1.3 |
| Wave scaling speed | slow | normal | fast |
| Starting gold | high | normal | low |
| Build phase time | 30s | 25s | 20s |

## 5. Hero

### Movement (top priority)
- **Right-click** to move. **Hold right-click** to keep following the cursor.
- Movement responds instantly with snappy acceleration and turning, and the hero never feels "floaty". It paths around buildings and terrain.
- **Units don't block each other:** the hero, allies and enemies can walk through one another. There's only a light push-apart between units of the same team so groups don't stack into one blob. Only walls, buildings and terrain block movement.
- Click feedback: a small ring pulse at the target spot (green for move, red for attack when an enemy is clicked).
- Right-clicking an enemy makes the hero attack it. **A + left-click** = attack-move. **S** = stop.
- Attacks can be canceled by moving (no lockout once the attack has landed). Skill inputs are buffered, so a skill pressed mid-attack fires as soon as it's allowed.
- Both heroes have a mobility skill, because movement is the core of the feel.

### Skills — Q / W / E / R
- Aiming: **quick-cast** (fires at the mouse position when the key is pressed). Holding the key shows a range/area indicator and the skill fires on release.
- Mana + cooldowns. Mana regenerates over time.

**Warrior** (melee, tanky, close-range brawler)
| Key | Skill | Description |
|---|---|---|
| Q | **Cleave** | Wide arc slash in front, damage + knockback. Upgrades: damage, arc width, bleed. |
| W | **Charge** | Dash toward the cursor, damaging and pushing enemies along the path. Resets on kill (rank 3). |
| E | **War Cry** | AoE taunt + armor buff for the hero, attack speed buff for nearby allies. |
| R | **Earthshatter** | Leaps to a target spot, slams down: big AoE damage, stun, shockwave ring. |

**Mage** (ranged, fragile, area damage)
| Key | Skill | Description |
|---|---|---|
| Q | **Fire Bolt** | Fast projectile that explodes on hit, small AoE. Upgrades: pierce, more damage. |
| W | **Blink** | Short-range instant teleport toward the cursor. Leaves a small frost burst at the start point. |
| E | **Frost Nova** | Ring around the hero that slows and damages. Rank 3 freezes. |
| R | **Meteor Storm** | Several meteors fall over a target area over 3s, each one telegraphed. |

### Leveling
- XP comes from nearby kills and wave clears. **Max level 12**, 1 skill point per level.
- Q/W/E: **3 ranks each** (9 points). R: **3 ranks**, unlockable **only at levels 4, 8 and 12** (3 points). Total: 12 points = 12 levels.
- Level 1: choose one basic skill. Level-up gives a visual burst, a full heal, and a pulsing "+" on skill buttons that can be upgraded. Hotkey: Ctrl+Q/W/E/R or click.
- Each level also gives small base stat gains (HP, damage, mana).
- Death: respawn at the Keep after (5 + level) seconds.

## 6. Enemies
| Type | Shape | Role |
|---|---|---|
| Grunt | red circle | basic melee |
| Runner | red triangle | fast, low HP |
| Brute | dark red square | tanky, slow |
| Archer | red diamond | ranged, shoots allies/hero/buildings |
| Sapper | orange square | high damage to walls/buildings |
| Shaman | purple circle | heals/buffs nearby enemies (appears in later waves) |
| Boss | large red hexagon | every 5 waves, slam attack with telegraph |

**Target priority:** hero/allies in aggro range → blocking building/wall → Keep.

## 7. Castle (Keep) & Allies

### Keep upgrades (castle expansion)
| Tier | Effect |
|---|---|
| 1 (start) | Base HP, spawns 1 soldier every 8s (max 4), basic buildings |
| 2 | +HP, Keep shoots arrows, max 6 soldiers, unlock Cannon + Barracks |
| 3 | +HP, spawns Archers too, max 8 allies, unlock Frost Tower + Gold Mine |
| 4 | +HP, stronger Keep attack, max 10 allies, building upgrades level 3, Keep auto-repair |

The buildable area around the castle also grows with each tier.

### Allies
- Automatic by default: they guard the nearest threatened lane, engage enemies in range, and return to their post.
- **Commanding:** press **F** (or the rally button) and click a location → all allies attack-move there and hold that spot. Press **F twice** = return to automatic mode.
- Optional: set the default post per lane by clicking a rally flag.

## 8. Buildings
Placed on the grid. Ghost preview: green = valid spot, red = invalid. Walls can only go on path tiles. Towers can go on terrain next to lanes.

| Building | Shape/color | Notes |
|---|---|---|
| Wall | gray rectangle | cheap, high HP, fully blocks |
| Arrow Tower | square, white core | fast single target |
| Cannon | square, orange core | slow, AoE, shake on impact |
| Frost Tower | square, cyan core | slows enemies |
| Barracks | blue rectangle | +ally cap, faster spawns |
| Gold Mine | yellow square | income each wave |

- 3 levels per building (level 3 requires Keep tier 4). Sell = 50% refund. Repair costs gold.

## 9. Economy & Items
- Gold: kills, wave clear, early-start bonus, Gold Mines.
- **Shop: open anytime, anywhere** (hotkey B). Hero has **6 slots**, items sell for 50%.
- Item tiers: cheap basics → expensive items with special effects.

| Item | Effect |
|---|---|
| Iron Sword | +damage |
| Swift Gloves | +attack speed |
| Leather Boots | +move speed (supports movement focus) |
| Plate Armor | +armor, +HP |
| Mana Crystal | +mana, +mana regen |
| Hourglass | −cooldowns |
| Vampire Fang | lifesteal |
| Storm Blade | attacks chain to 2 more enemies |
| Thorn Mail | reflects melee damage |
| Phoenix Feather | auto-revive once (consumed) |
| Arcane Focus | +skill damage |
| Wind Cloak | after using W, +move speed for 2s |

## 10. UI
- **Top:** gold, wave #, next-wave lanes, countdown, **Start Next Wave** button, Keep HP bar.
- **Bottom:** hero portrait (colored shape), HP/mana bars, XP bar + level, Q/W/E/R buttons (cooldown sweep, ranks shown as dots, "+" when upgradable), 6 item slots.
- **Right:** build panel (B toggles the shop, V toggles build, U upgrades the Keep).
- Tooltips on hover for skills, items, buildings.

## 11. Game Feel
- **Hit feedback:** white flash on hit, knockback, damage numbers (crit = bigger and yellow).
- **Hitstop:** 40–80ms on ultimates, Charge impact, boss slams.
- **Screen shake** scaled by impact. A toggle in settings.
- **Particles:** small shape bursts on deaths, skill impacts, building hits.
- **Telegraphs:** skill indicators while aiming, warning circles before meteor/boss slam/Earthshatter.
- **Movement trails:** short afterimage/trail on Charge/Blink and while moving fast.
- **UI juice:** gold pop, skill-ready pulse, Keep flashes red and screen edges tint when the Keep is hit.
- **Sound:** generated with WebAudio (blips, thumps, swooshes), with a mute toggle.

## 12. Milestones (each one is playable)
1. **Skeleton:** large map with 3 connected lanes, free camera + minimap, Keep, enemies flow-field to the Keep and damage it, game over.
2. **Hero movement:** right-click movement, hold-to-follow, pathing around obstacles, click feedback, auto-attack, attack-move. *Tuned until it feels great.*
3. **Skills:** Warrior kit + Mage kit, mana, cooldowns, aiming indicators, hero select menu.
4. **Waves:** WaveManager, build/wave phases, early start, lane indicators, endless scaling, difficulty modes.
5. **Building:** grid placement, walls that block and reroute, towers, sell/repair.
6. **Keep & allies:** Keep tiers, ally spawning, auto behavior, F-command.
7. **Leveling:** XP, levels 1–12, skill ranks, R unlock at 4/8/12.
8. **Shop & items:** 6 slots, stats, special effects.
9. **Game feel pass:** everything from section 11.
10. **Balance pass:** ~10 minute run on Medium, score and best score.

## 13. Decisions Log
- Connectors are always open (no building on them).
- Units walk through each other. Only walls, buildings and terrain block.
- Warrior/Mage kits kept as drafted for now. Revisit after playtesting.
- Bigger map with a free camera (edge pan, arrows, drag, Space to center). Not locked to the hero.
