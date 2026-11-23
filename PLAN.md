# Castle Defense — Plan

The original design spec was not in the repository when this file was created. Sections 1–12 are placeholders to fill in. Section 13 is the decisions log that `CLAUDE.md` points to.

Design priorities: (1) hero movement feels great, (2) skills feel powerful, (3) everything else supports those.

## 1–12. (to be restored)

## 13. Decisions log

### 2026-11-22 — Balance simulation (Menu → Simulate)

- **What it does:** a bot plays every selected hero × difficulty × strategy × seed in the real `GameScene` at high speed, then writes a balance report. The report has an on-screen summary, Markdown and JSON downloads, and the last report is kept in `localStorage` (`cd_sim_last`) and reopened from the menu with "Last report".
- **Real game, not a model:** the sim runs the actual `GameScene` code in fixed steps (`CONFIG.sim.step` = 1/30 s, below the game's 0.05 s clamp so Charge and skillshots don't tunnel). Each frame runs as many steps as fit in `frameBudgetMs`. Hitstop doesn't apply, `Feel` effects and sound are off (`Feel.enabled`, `Sfx.suppressed`), and the world isn't rendered unless "Watch" is on.
- **Reproducible:** `Math.random` is replaced with a seeded generator (`mulberry32`) for each run and restored afterwards. Seed index *i* uses `baseSeed + i`, so every combination sees the same seeds.
- **Strategies** (`CONFIG.sim.strategies`) are spending policies: an `opening` that runs once, then a repeating `loop` of steps (`item`, `keep`, `arrow`/`cannon`/`frost` (upgrade an existing tower first, else build), `barracks`/`mine` (build first, else upgrade)). The bot saves up for each step and skips steps that are locked. Presets:
  - Hero carry
  - Turtle
  - Economy
  - Keep rush
  - Balanced
  - Idle hero: the hero stays at the Keep with basic attacks only and Fire Bolt autocast off. It is the baseline for "how much do buildings carry".
- **Hero bot** (`CONFIG.sim.bot`):
  - Targets the enemy closest to the Keep by flow distance.
  - Travels to that threat, then attack-moves. It only leaves a local fight if the threat is more than 12 tiles closer to the Keep.
  - Retreats below 30% HP and resumes at 65%.
  - Skills fire by thresholds: cluster sizes, distance to the Keep or hero, and bosses.
  - Item builds per hero are in `CONFIG.sim.itemBuilds`.
- **Tower placement:** tiles are scored by lane coverage near the Keep, weighted toward the lane that has leaked the most Keep damage (round-robin before any leaks). Barracks and mines take the tiles with the least coverage.
- **Run end:** the Keep falls, the wave cap is reached, or a wave lasts longer than `waveTimeout` (300 s), which is reported as `stalled`.
- **No side effects:** best scores are not written and the page-leave guard is not installed.
- **Flags** (`CONFIG.sim.flags`): hero vs hero ratio, difficulty ordering, dominant or trap strategies, idle hero close to the best, building damage per gold outliers, low-share skills, one enemy type dominating Keep damage, early losses, every run hitting the cap, stalled runs.
- **Game changes made for it:**
  - `Combat.dealDamage` reports to `scene.recorder` when one exists.
  - Kit damage tags `skill` with the skill key (`'Q'`…) instead of `true`.
  - `Hero` emits `heroDied` / `heroRevived`.
  - Enemies remember their spawn `lane`.
  - Mage meteor impacts run on game time (`kit.meteors`) instead of a Phaser tween, so pause, hitstop and the sim all respect them.
- **Speed:** steps cost roughly 0.1 ms, so the sim runs several hundred times faster than real time. A full 1-seed matrix (36 runs, cap 40) took about 75 s in testing. When the browser throttles frames (background tab), each frame gets a bigger step budget (`maxFrameBudgetMs`). A game exception ends that run as `error` and is flagged, instead of freezing the sim.
- **Bug found by the sim (fixed):** an enemy killed by Thorn Mail reflect during its own attack crashed `Enemy.update` (`syncGfx` on destroyed graphics), which stopped the game loop. `Unit.syncGfx` now ignores destroyed units.
- **Bug found by the sim (fixed):** large units (the boss) pushed against a lane/connector corner stayed wedged forever. Axis-separated sliding had no perpendicular component to slide on, so boss waves never ended. `Pathing.moveUnit` now nudges a blocked straight move diagonally around the corner.
