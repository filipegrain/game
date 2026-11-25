# Waves and level-up picks

The player starts each wave with N, Enter or the top-bar button; there is no build timer. Enemies spawn at the lane portals and walk to the Keep. The hero, towers and allies kill them for gold and XP. Each level-up pauses the game and offers item cards. Picking one adds the item, or raises its level if the hero already owns it.

## Sub-features

- `wave-start` starts the wave with Enter or N or the top-bar button.
- `wave-wait` stays in the build phase indefinitely until the player starts the wave.
- `wave-clear` returns to `phase: "build"` after the last enemy dies, with `stats.wavesCleared` incremented.
- `levelup-offer` pauses the game on level-up and shows `CONFIG.itemPickCount` cards.
- `levelup-pick` clicks a card, which adds the item to `hero.itemLevels` and resumes the game.

## How to get to it (user POV)

- Press Enter or N, or click "Start Wave N" in the top bar.
- On level-up, click one of the item cards. There's no close button.

## Driving it with cdg

Preconditions:

- `node $CDG start warrior medium`. Optionally place an arrow tower first (see `build.md`). With the hero idle next to the Keep, the first level-up arrives during wave 1.

- **Start.** Run `node $CDG key Enter`. `eval` of `gs.waves` shows `{wave:1, phase:"wave"}`, and gold is unchanged.
- **Enemies.** Run `node $CDG wait "game.scene.getScene('GameScene').enemies.length>0" 10000`. Then `node $CDG shot waves-picks/wave1.png`.
- **Level-up offer.** Run `node $CDG wait "game.scene.getScene('GameScene').picks.choices" 120000`. This returned in about 36 s at commit 4a5cb6e with three item keys. Then `node $CDG shot waves-picks/offer.png` shows three cards over the paused game.
- **Pick.** Run `node $CDG click 442 271` (first card). `eval` shows `picks.choices: null` and `hero.itemLevels` containing the first offered key at level 1.
- **Clear.** Run `node $CDG wait "game.scene.getScene('GameScene').waves.phase==='build' && game.scene.getScene('GameScene').stats.wavesCleared>=1" 120000`. `state` then shows `phase:"build"` and `wave:1`.
- **Proof.** Capture `state`, the screenshots and `logs` (must be `[]`).

## Gotchas

- While picks are open the game is paused (`GameScene` checks `picks.choices`). A `wait` on wave progress never resolves until you pick.
- Several pending level-ups open their offers one after another. Re-check `picks.choices` after each pick.
- Everything runs in real time. Budget up to two minutes for a wave, and pass explicit `wait` timeouts.
- The cards are random (`Math.random`, not seeded outside the sim). Assert the key of the card you clicked, read from `picks.choices` before clicking, and never a fixed item.
