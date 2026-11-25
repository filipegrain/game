# Waves and level-up picks

Waves are timed: the first comes after `CONFIG.waves.firstDelay` s, then one every `interval` s, endlessly. Each tick spawns enemies at all three red spawns (they cross their lane's bridge, then go for the Keep), 5 creeps at each lane whose first tower stands, refills cleared neutral camps and pays tick gold. The hero, towers and creeps kill enemies for gold and XP. Each level-up pauses the game and offers item cards. Picking one adds the item, or raises its level if the hero already owns it.

## Sub-features

- `wave-tick` fires when the top-bar countdown reaches 0: enemies at every spawn, creeps at every lane with its first tower, tick gold.
- `wave-timer` keeps counting whether or not the last wave is dead; `stats.wavesCleared` is waves survived (`wave - 1`).
- `levelup-offer` pauses the game on level-up and shows `CONFIG.itemPickCount` cards.
- `levelup-pick` clicks a card, which adds the item to `hero.itemLevels` and resumes the game.

## How to get to it (user POV)

- Wait for the "Wave N in m:ss" countdown in the top bar.
- On level-up, click one of the item cards. There's no close button.

## Driving it with cdg

Preconditions:

- `node $CDG start warrior medium`. Optionally place an arrow tower first (see `build.md`). With the hero idle next to the Keep, the first level-up arrives during wave 1.

- **Tick.** Run `node $CDG wait "game.scene.getScene('GameScene').waves.wave>=1" 60000`. `state` shows `wave:1`, gold up by `CONFIG.waves.tickGoldBase` and `allies` 15.
- **Enemies.** Run `node $CDG wait "game.scene.getScene('GameScene').enemies.length>0" 10000`. Then `node $CDG shot waves-picks/wave1.png`.
- **Level-up offer.** Run `node $CDG wait "game.scene.getScene('GameScene').picks.choices" 120000`. With the hero idle the first level-up can take a few waves; move the hero toward a lane to speed it up. Then `node $CDG shot waves-picks/offer.png` shows three cards over the paused game.
- **Pick.** Run `node $CDG click 442 271` (first card). `eval` shows `picks.choices: null` and `hero.itemLevels` containing the first offered key at level 1.
- **Proof.** Capture `state`, the screenshots and `logs` (must be `[]`).

## Gotchas

- While picks are open the game is paused (`GameScene` checks `picks.choices`). A `wait` on wave progress never resolves until you pick.
- Several pending level-ups open their offers one after another. Re-check `picks.choices` after each pick.
- Everything runs in real time. Budget up to two minutes for a wave, and pass explicit `wait` timeouts.
- The cards are random (`Math.random`, not seeded outside the sim). Assert the key of the card you clicked, read from `picks.choices` before clicking, and never a fixed item.
