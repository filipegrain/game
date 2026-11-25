---
name: verify-lane-reachability
description: Exhaustively checks, on the real game code, that enemies can always walk from every spawn to the Keep along their own lane (past that lane's towers), that creeps reach their lane's enemy spawn, and that no building the player can legally place, alone or piled up on the route, walls a spawn off. Use whenever a change touches the map grid, spawns, lane towers or camps in src/map.js (including saves from the map editor), building placement rules (BuildSystem.check/checkPlace, Building, Keep tiers), or Pathing's flow fields and lane routing.
---

# Verify lane reachability

**The promise.** Every enemy can always reach the Keep, each wave keeps to its own lane and bridge, creeps can always march to their lane's spawn, and nothing the player builds can wall a spawn off. Buildings *do* block movement and change routes on purpose. `BuildSystem.checkPlace` refuses the placement that would cut a spawn off (`Pathing.wouldDisconnect`).

**The harm if it breaks.** Enemies stall or wander and a lane goes quiet. A wave can bypass a lane's towers. Or a player walls off the Keep and the run becomes unlosable. Playtests reach almost none of the ~3,800 legal placements and build orders, so this check covers them.

## Run

```sh
node .claude/skills/verify-lane-reachability/scripts/check.mjs              # ~35 s
node .claude/skills/verify-lane-reachability/scripts/check.mjs --self-test  # ~3.5 min, also proves the check can fail
```

You need Node 22+. There are no npm packages and no browser. The script loads the real `src/config.js`, `src/systems/Pathing.js`, `src/entities/Building.js`, `src/entities/Tower.js`, `src/entities/Keep.js` and `src/systems/BuildSystem.js` into a Node `vm` context in `index.html` order. Drawing (`scene.add`, `Feel`) and sound (`Sfx`) are no-op stubs. `Phaser.Math.Clamp` is the only Phaser function the code under test calls. Exit code 0 means every property holds and, with `--self-test`, every mutant was caught.

## Properties

| ID | Plain statement | How it's checked |
| --- | --- | --- |
| P1 | Every spawn, lane tower and camp stands on walkable ground with a route to the Keep. Every tile connected to the Keep has a flow route, and following `Pathing.flowNext` from any tile strictly descends to a goal next to the Keep | All ~5,000 walkable tiles: a 4-neighbour BFS from the Keep goals must find no tile with `dist = Infinity`, and each `flowNext` walk must strictly decrease with no loop |
| P2 | Enemies from spawn *i*, routed by `Pathing.laneNext` (to lane *i*'s bridge, then the Keep field), reach the Keep and pass within 200 px of every tower of lane *i*. Creeps from lane *i*'s first tower reach spawn *i* the same way, past the same towers | One walk per spawn and one per lane |
| P3 | At max Keep tier, for every building type and every tile (including off-map offsets), `checkPlace` accepts only grass/dirt footprints, and an accepted footprint leaves every spawn with a route to the Keep | Exhaustive: each accepted footprint is occupied and the Keep field is recomputed |
| P4 | Buildings piling up on the route never wall a spawn off | An adversarial builder places up to 400 buildings, each on the current enemy route of some spawn (`checkPlace` then `occupyBuilding`, as the game does). After each one, every spawn must still reach the Keep |

**Scope and assumptions.**
- Gold is treated as unlimited (`economy.canAfford → true`), which is a superset of real states.
- P4 is one deterministic build order: the strongest attempt to wall off a route, not every order. Soundness of the route rule for *any* order follows from `checkPlace` running `wouldDisconnect` against the current occupancy before every placement, which P4 exercises.

**Not covered.**
- Unit-level movement: `moveUnit` collision and sliding, big units (Boss radius 30) squeezing through 1-tile gaps between buildings. An enemy that stops making flow progress attacks the nearest building (`Enemy.trackProgress`), which is the runtime fallback.
- Hero and creep A* (`findPath`, 12,000-iteration cap).
- Enemies that target units or structures instead of walking.
- `SimBot` placement and selling (selling only frees tiles).

## Reading a result

- **`FAIL P3 … on rock, trees, water or a bridge`** means `check` stopped rejecting non-buildable terrain (`isBuildable`), or `Building.fp` drifted from `CONFIG.buildings.footprint`.
- **`FAIL P3 … cuts X off` / `FAIL P4`** means the route rule (`checkPlace` → `wouldDisconnect`) is skipped or disagrees with the flow field, for example if one uses different walkability or goal tiles than `fillField`.
- **`FAIL P1 … no route` / `not walkable`** means a map edit (regenerated grid, moved marker) isolated a spawn, tower or camp. **`connected … but has no flow route`** or **`is not closer`** means `fillField` and `flowNext` disagree, usually on the diagonal corner-cutting rule.
- **`FAIL P2`** means a lane now crosses another lane's bridge or skips one of its towers. Check `CONFIG.map.towers` order (outermost = bridge waypoint) and `Pathing.laneNext`.
- **Real bug or modelling error?** Open the tile named in the message in the game (the `verify-castle-defense` skill: world position = tile × 32 + 16). If the game agrees, it's a real bug. Report it in those words and don't change product code unless the user asks. If the game disagrees, the checker has drifted from the code. Fix `check.mjs`, never by narrowing a property until it passes.
- **`mutant text not found`** under `--self-test` means the code moved. Update that entry in `MUTANTS` to an equivalent break in the new code.

## When the change is intended

If a design change legitimately alters the promise (for example, a lane without a bridge or a new spawn rule), update the property and its row above together with the code. Re-run `--self-test`, then advance the sync commit.

## Coverage record

| Check | Code it covers |
| --- | --- |
| P1 | `src/map.js` `grid`, `keep`, `spawns`, `towers`, `camps`; `src/config.js` `map.grassCost`; `src/systems/Pathing.js` `buildMap`, `isWalkable`, `fillField`, `computeFlowField`, `flowNext`, `nearestWalkable` |
| P2 | `src/systems/Pathing.js` `laneNext`, `bridgeDist`, `spawnDist`; `src/entities/Tower.js` position; `src/map.js` `towers` order |
| P3 | `src/systems/BuildSystem.js` `check`, `checkPlace`; `src/entities/Building.js` (`fp`); `src/entities/Keep.js` tiers; `src/config.js` `buildings`, `map.spawnClear`, `map.campClear`; `src/systems/Pathing.js` `isBuildable`, `forEachFootprint`, `wouldDisconnect` |
| P4 | as P3, plus `src/systems/Pathing.js` `occupyBuilding` |

**Sync commit: the commit that introduced the sketch map (see `git log -- docs/map-sketch.png`).** To see whether the check needs another look:

```sh
git diff --stat $(git log -1 --format=%h -- docs/map-sketch.png) -- src/config.js src/systems/Pathing.js src/systems/BuildSystem.js src/entities/Building.js src/entities/Tower.js src/entities/Keep.js
```

After any change to the covered code, read the diff against this table, run `--self-test`, and update the sync note **only** after confirming the checker still describes the code.

## Self-test mutants (proof that the check can fail)

| Mutant | Edit | Caught by |
| --- | --- | --- |
| `build-allows-trees-and-rocks` | drop the `isBuildable` rejection in `BuildSystem.check` | P3 |
| `route-rule-skipped` | `checkPlace` never calls `wouldDisconnect` | P4 |
| `spawn-inside-rock` | MID spawn moved to the rock corner (119.5, 67) | P1 |
| `flow-field-hole` | `fillField` never relaxes tile (60,60) | P1 |
| `bridge-waypoint-skipped` | `laneNext` ignores `viaBridge` | P2 |
