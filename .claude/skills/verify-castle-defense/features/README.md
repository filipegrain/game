# Castle Defense verification map

This directory is the maintained source for verifying what a player can do in Castle Defense. Read this index before driving the game, then use the matching feature file as the recipe.

## Baseline preconditions

- `CDG=".claude/skills/verify-castle-defense/scripts/cdg.mjs"` from the repo root.
- `node $CDG launch` succeeded and `node $CDG doctor` exits 0 with `scenes: ["MenuScene"]` and `errors: 0`.
- The instance was launched by this run. Relaunch after changing JS, because the page doesn't hot-reload.
- Best scores live in the throwaway Chrome profile, so `cd_best_*` and `cd_settings` start empty on every launch.

## Driving conventions

- Start each recipe from a fresh `start <hero>` unless its preconditions say otherwise. To get back to the menu, `stop` and `launch`.
- Drive with `key`, `click`, `wclick` and `wmove`. Use `eval` and `state` only to read state or find targets.
- Find world targets with `eval` rather than hard-coding them. Map tiles are 32 px, so world = `CONFIG.px(tile) + 16` for a tile centre.
- Wait with `wait '<expr>' <ms>`, never with a fixed sleep.
- The camera is free and starts on the Keep. `wclick` only reaches points on screen: move the camera first (left-click the minimap, or hold Space to centre on the hero).
- Waves are timed (`CONFIG.waves.firstDelay`, then every `interval` s). To skip ahead without waiting in real time, say so in the report and step the scene: `eval '(()=>{const gs=game.scene.getScene("GameScene"); for(let i=0;i<30*40;i++) gs.step(1/30)})()'`.

## Proof and skip reporting

- Capture the action (commands), the resulting state read back after the action, a screenshot under `.verify/artifacts/<feature-id>/`, and `logs`.
- Name the feature ID and the entry point you used for every artifact.
- If an entry point is unreachable, report the command you tried and the precondition that wasn't met. Don't report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file has an H1 title and one paragraph, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with cdg`, `Gotchas`.

## Features

- [Start a game](./start-game.md) covers choosing a hero in the menu and entering the game.
- [Hero movement and skills](./hero-skills.md) covers right-click move, and the aim, instant and auto skill casts for both heroes.
- [Build towers](./build.md) covers the build panel and hotkeys, placement validity, gold spending, and cancelling.
- [Waves and level-up picks](./waves-picks.md) covers starting a wave, enemies spawning and dying, XP, and picking an item.
