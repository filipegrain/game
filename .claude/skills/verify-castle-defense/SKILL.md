---
name: verify-castle-defense
description: Drive the Castle Defense Phaser game in a real headless Chrome the way a player does (menu, hero movement, skills, building, waves, level-up picks) and capture screenshots and game-state proof. Use after any gameplay, UI, config or scene change to prove it works in the browser, or when asked to verify, playtest or reproduce a bug in this repo.
---

# Verify Castle Defense

The game is a canvas, so there is no DOM or ARIA to drive. The harness `scripts/cdg.mjs` starts its own static server and headless Chrome, sends real mouse and keyboard input through the DevTools protocol, and reads game state from the page's global `game` (the `Phaser.Game` from `src/main.js`). It needs only Node 22+ and Chrome or Edge (override with `CHROME_PATH`). There are no npm packages. Phaser loads from the jsDelivr CDN, so the machine needs network access.

All commands run from the repo root:

```sh
CDG=".claude/skills/verify-castle-defense/scripts/cdg.mjs"
node $CDG help
```

## Launch

```sh
node $CDG launch            # add --headed to watch it in a visible window
```

This picks two free ports, serves the repo root, starts Chrome with a throwaway profile, installs a console/exception logger before any game script runs, and loads the game. It returns only when it's **ready**, meaning Phaser has booted and `MenuScene` is active. It prints JSON with the URL and PIDs and writes them to `.verify/state.json`. Teardown is `node $CDG stop`.

You can run one instance per checkout. `launch` refuses to start if this checkout's instance is still alive. Separate worktrees get separate instances on separate ports. Never drive an instance this checkout didn't launch, and never drive the user's own browser tab.

## Doctor

```sh
node $CDG doctor
```

This is a read-only check. It exits 0 only when the server and Chrome PIDs are alive, the server serves this checkout's `index.html` byte for byte, Phaser is `3.80.1`, and `game` has booted. It also reports the active scenes, the renderer, the error count, and the commit at launch compared with the current commit. Run it first whenever something looks off. If `launchedCommit` differs from `currentCommit` there's no harm, because the server reads files live, but the page only picks up changed JS after a relaunch (`stop`, then `launch`).

## Drive

All coordinates are **game coordinates**: the 1280×720 canvas space that `CONFIG.VIEW_W/VIEW_H` and `UIScene` layout use. The harness converts them to screen pixels.

| Command | Use |
| --- | --- |
| `start <warrior\|mage> <normal\|hard>` | Clicks the hero card, the difficulty and START on `MenuScene`, then waits for `GameScene` and `UIScene` |
| `state` | Compact JSON with active scenes, hero (pos, hp, level, xp, cooldowns, aiming, order, items), keep, gold, wave/nextWaveIn, enemy/neutral/ally counts, lane towers, buildings, placing/selected, picks, paused/ended, stats, camera |
| `key <Code> [--down\|--up] [--hold ms]` | A real key event by `KeyboardEvent.code`: `KeyQ`…`KeyR`, `KeyA`, `KeyS`, `KeyV`, `KeyU`, `KeyP`, `KeyM`, `Digit1`…`Digit4`, `Enter`, `Escape`, `Space` |
| `move x y` / `click x y [left\|right]` | Mouse input at screen (HUD) coordinates |
| `wmove wx wy` / `wclick wx wy [left\|right]` | The same at **world** coordinates, converted through the `GameScene` camera. Fails if the point is off screen. The camera is free: left-click the minimap or hold Space (follows the hero) to bring the point on screen first |
| `wait '<js>' [ms]` | Polls a page expression until it's truthy (default 10 s). Use it instead of sleeping |
| `eval '<js>'` | Reads state and finds targets. Inside it, `gs = game.scene.getScene('GameScene')` gives you `hero`, `keep`, `economy`, `waves`, `build`, `picks`, `enemies` and the rest |
| `shot <file.png>` | Screenshot. Relative paths go under `.verify/artifacts/` |
| `logs [--clear]` | Console errors and warnings plus uncaught exceptions since launch |

Key HUD positions in game coordinates, from `MenuScene` and `UIScene`:
- Menu: Warrior card centre (480,300), Mage card centre (800,300), Normal/Hard (555,512)/(725,512), START (640,597).
- In game: pause (1254,16), minimap bottom-left (8..184, ~616..712; left-click moves the camera), BUILD (1240,78), KEEP upgrade (1240,143), Mage/Warrior skill icons Q/W/E/R at (638|704|770|836, 668), build panel column x=1164 with rows at y=79+62·i in `BUILD_TYPES` order, and item pick cards centred at (442|639|836, 271).

Skill input follows `CONFIG.skills[hero][key].cast`:
- `aim`: press the key with the mouse anywhere, then left-click (`wclick`) the target.
- `instant`: hover the target with `wmove`, then press the key.
- `auto`: the key toggles autocast.
- `passive`: the key does nothing.

The feature recipes live in [`features/README.md`](features/README.md). Read the index, then the matching feature file.

## Evidence

Write proof to `.verify/artifacts/<feature-id>/`, which git ignores. A proof contains:
- the **action**, as the exact `cdg` commands you ran;
- the **resulting state**, as `state` or `eval` output read *after* the action through a different handle than the one you drove (for example, a cooldown that started, gold that was deducted, a building that appears in `gs.buildings`, an item that appears in `hero.itemLevels`);
- a **screenshot** that shows the effect on screen;
- `logs`, which must be `[]`, or every entry explained.

Drive the real player path with keys and clicks. Use `eval` to read state and find targets, never to cause the behaviour under test. Calling `gs.waves.tick()`, `picks.pick()` or setting `hero.x` directly proves nothing about input, the HUD or `isOverUI`. If you must use a setter as setup to reach a precondition, such as dropping keep HP to reach game over, say so in the report and still drive the step under test through input.

The game runs in real time and can't be fast-forwarded through input. A wave-1 level-up takes about 35–40 s. For balance and long-run questions, use the in-game Menu → Simulate (`SimRunner`), not this harness.

## Cleanup

```sh
node $CDG stop
```

This kills only the server and Chrome PIDs recorded in `.verify/state.json` (as a tree on Windows), deletes the throwaway profile and the state file, and **keeps `.verify/artifacts/`**. Run it after every run, including failed ones. Never kill `chrome` or `node` by name, because the user may have their own running.
