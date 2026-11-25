---
name: verify-lane-reachability
description: Exhaustively checks, on the real game code, that enemies can always walk from every spawn and lane tile to the Keep and that no building the player can legally place, at any Keep tier, changes their route. Use whenever a change touches the map rectangles or lane spawns in src/config.js, building footprint or placement rules (BuildSystem.check, Building, Keep tiers / buildRadius), or Pathing's flow field.
---

# Verify lane reachability

**The promise.** Every enemy can always walk to the Keep, and nothing the player builds can change that. `CLAUDE.md` puts it as "Buildings only go on terrain next to lanes, so they never affect the flow field."

**The harm if it breaks.** Enemies stall or wander forever. A wave never meets `WaveManager`'s clear condition (`spawned >= toSpawn && no enemy alive`), so the run soft-locks. Alternatively, a player's build layout quietly reroutes or walls off a lane. Playtests reach almost none of the ~10,000 legal placements, so this check exists to cover them all.

## Run

```sh
node .claude/skills/verify-lane-reachability/scripts/check.mjs              # ~1 s
node .claude/skills/verify-lane-reachability/scripts/check.mjs --self-test  # ~9 s, also proves the check can fail
```

You need Node 22+. There are no npm packages and no browser. The script loads the real `src/config.js`, `src/systems/Pathing.js`, `src/entities/Building.js`, `src/entities/Keep.js` and `src/systems/BuildSystem.js` into a Node `vm` context in `index.html` order. Drawing (`scene.add`, `Feel`) and sound (`Sfx`) are no-op stubs. `Phaser.Math.Clamp` is the only Phaser function the code under test calls. Exit code 0 means every property holds and, with `--self-test`, every mutant was caught.

## Properties, all checked exhaustively over a finite domain

| ID | Plain statement | How it's checked |
| --- | --- | --- |
| P1 | From every lane tile (PATH or CONNECTOR), an enemy that follows `Pathing.flowNext` reaches a goal tile next to the Keep, and every step gets strictly closer | Walks `flowNext` from all ~1,437 lane tiles, requiring finite `dist` and a strictly decreasing distance with no loop |
| P2 | Every tile `WaveManager.update` can spawn an enemy on is a lane tile with a route | Covers the full random spawn box per lane: `spawn.x*T + [0,20)` px, with y clamped to `CONFIG.map.paths[lane]` exactly as `WaveManager.update` computes it |
| P3 | No placement `BuildSystem.check` accepts, at any Keep tier and for any building type, puts a building on a lane tile or changes the enemy flow field | For tiers 1..`CONFIG.keep.tiers.length` × every `CONFIG.buildings` type × every tile from −(fp+2) to map size +(fp+2), it builds a real `Building`, calls `occupyBuilding`, recomputes `computeFlowField`, and compares it to the empty-map field |

**Scope and assumptions.**
- Gold is treated as unlimited (`economy.canAfford → true`). That's a superset of real states, because the gold rule only rejects placements.
- **Placement order.** P3 checks single placements on an empty map, and that covers every build order. As buildings accumulate, `check` only adds rejections (`Occupied`), and a building affects pathing only through the tiles it occupies (`Pathing.isWalkable`). So the union of individually harmless footprints is harmless.
- **Caching.** Flow fields are cached by occupied-tile set. That's sound because `computeFlowField` reads buildings only through which tiles are occupied.

**Not covered.**
- Unit-level movement: `moveUnit` collision and sliding, radius-vs-corner wedging, knockback pushing enemies off lanes. P1 treats each lane tile as reachable, not each pixel.
- Hero and ally A* (`findPath`, including its 8000-iteration cap).
- Enemies that target the hero or allies instead of the Keep.
- `SimBot` placement.
- Selling or upgrading buildings. Those don't change footprints today.

## Reading a result

- **`FAIL P3 … occupies lane tile (x,y)`** means the build check accepted a footprint that covers a lane. Usually the placement rule changed (`blocked` / `forEachFootprint`), or `Building.fp` stopped matching `CONFIG.buildings.footprint` (the footprint that `check` validates).
- **`FAIL P3 … changes the enemy route`** means the footprint avoids lanes but pathing still changed. That means `computeFlowField` or `isWalkable` now reads something other than lane occupancy.
- **`FAIL P1 … no route`** means a map edit disconnected lanes from the plaza or the Keep. Check `CONFIG.map.paths` and `connectors` for a gap. **`… is not closer`** means `flowNext` and `computeFlowField` disagree, usually on the diagonal corner-cutting rule.
- **`FAIL P2`** means a lane spawn moved off its lane or off the map, or `paths[0..2]` no longer line up with `lanes[0..2]`.
- **Real bug or modelling error?** Open the tile named in the message in the game (the `verify-castle-defense` skill: `wclick` that world position = tile × 32 + 16). If the game agrees, it's a real bug. Report it in those words and don't change product code unless the user asks. If the game disagrees, the checker's domain or spawn formula has drifted from the code. Fix `check.mjs`, never by narrowing a property until it passes.
- **`mutant text not found`** under `--self-test` means the code moved. Update that entry in `MUTANTS` to an equivalent break in the new code, so the check stays proven able to fail.

## When the change is intended

If a design change legitimately alters the promise (for example, buildings that block lanes on purpose, or a new spawn rule), update the property and its row above together with the code. Re-run `--self-test`, then advance the sync commit.

## Coverage record

| Check | Code it covers |
| --- | --- |
| P1 | `src/config.js` `map.paths`, `map.connectors`, `map.keep`; `src/systems/Pathing.js` `buildMap`, `isLane`, `isWalkable`, `computeFlowField`, `flowNext`, `nearestWalkable` |
| P2 | `src/config.js` `map.lanes[].spawn`, `map.paths[0..2]`, `MAP_W/H`; `src/systems/WaveManager.js` `update` (spawn position), `spawnPoint` |
| P3 | `src/systems/BuildSystem.js` `check`, `inBuildRadius`; `src/entities/Building.js` constructor (`fp`, `tx/ty`); `src/entities/Keep.js` `tier`, `tierDef`, `buildRadius`; `src/config.js` `buildings` (types, `footprint`, `tier`), `keep.tiers[].buildRadius`, `map.towerAdjacency`; `src/systems/Pathing.js` `forEachFootprint`, `occupyBuilding`, `freeBuilding` |

**Sync commit: `4a5cb6e`.** The verification was last confirmed to describe the code at this commit. To see whether it needs another look:

```sh
git diff --stat 4a5cb6e -- src/config.js src/systems/Pathing.js src/systems/WaveManager.js src/systems/BuildSystem.js src/entities/Building.js src/entities/Keep.js
```

The P2 spawn formula in `check.mjs` mirrors `WaveManager.update`, so a change to that spawn code needs a matching edit in `check.mjs`. After any change to the covered code, read the diff against this table, run `--self-test`, and move the sync commit forward **only** after confirming the checker still describes the code at the new commit.

## Self-test mutants (proof that the check can fail)

| Mutant | Edit | Caught by |
| --- | --- | --- |
| `build-allows-lane-tiles` | drop the `blocked` rejection in `BuildSystem.check` | P3 |
| `building-footprint-bigger-than-checked` | `Building` uses `footprint + 1` | P3 |
| `plaza-detached-from-lanes` | plaza `w: 21 → 20`, leaving a terrain gap at x=27 | P1 |
| `spawn-past-the-map-edge` | MID spawn `x: 94.5 → 96.5` | P2 |
| `diagonal-corner-cut-loop` | flow field skips tile (60,8) | P1 |

Moving a spawn's **y** off its lane is *not* a bug: `WaveManager.update` clamps spawn y into `paths[lane]`. An early mutant that did this was correctly not flagged.
