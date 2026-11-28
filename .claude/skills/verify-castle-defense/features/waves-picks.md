# Waves and level-up picks

Wave 1 comes after `CONFIG.waves.firstDelay` s and spawns enemies at all three red spawns (they cross their lane's bridge, then go for the Keep). Once the whole wave has spawned and died, the hero gets the XP of every enemy in it (a "WAVE N CLEARED" banner) and the next wave comes `clearDelay` s later. Kills pay gold. Separately, a minute tick (`tickInterval`, the first at `firstDelay`) spawns 5 creeps at each lane whose first tower stands, refills cleared neutral camps and pays tick gold. Each level-up pauses the game and offers item cards. Picking one adds the item, or raises its level if the hero already owns it.

## Sub-features

- `wave-start` fires when the top-bar countdown reaches 0: enemies at every spawn.
- `wave-clear` fires when the wave is dead: XP to the hero, `stats.wavesCleared` = `wave`, `waves.nextIn` = `clearDelay`. While a wave is alive `nextIn` is null and the top bar reads "Clear the wave!".
- `minute-tick` fires every `tickInterval` s regardless of waves: creeps at every lane with its first tower, camp refills, tick gold.
- `levelup-offer` pauses the game on level-up and shows `CONFIG.itemPickCount` cards.
- `levelup-pick` clicks a card, which adds the item to `hero.itemLevels` and resumes the game.

## How to get to it (user POV)

- Wait for the "Wave N in Ns" countdown in the top bar, or clear the current wave.
- On level-up, click one of the item cards. There's no close button.

## Driving it with cdg

Preconditions:

- `node $CDG start warrior`. With the hero idle next to the Keep, the lane towers and creeps clear wave 1 and its XP brings the first level-up about 30 s in.

- **Wave and tick.** Run `node $CDG wait "game.scene.getScene('GameScene').waves.wave>=1" 20000`. `state` shows `wave:1`, `nextWaveIn: null`, gold up by `CONFIG.waves.tickGoldBase` and `allies` 15 (the first minute tick lands with wave 1).
- **Enemies.** Run `node $CDG wait "game.scene.getScene('GameScene').enemies.length>0" 10000`. Then `node $CDG shot waves-picks/wave1.png`.
- **Clear and level-up offer.** Run `node $CDG wait "game.scene.getScene('GameScene').picks.choices" 90000`. `stats.wavesCleared` is 1 and `hero.xp` reflects the wave's XP minus the level cost. Then `node $CDG shot waves-picks/offer.png` shows three cards over the paused game.
- **Pick.** Run `node $CDG click 442 271` (first card). `eval` shows `picks.choices: null` and `hero.itemLevels` containing the first offered key at level 1.
- **Proof.** Capture `state`, the screenshots and `logs` (must be `[]`).

## Gotchas

- While picks are open the game is paused (`GameScene` checks `picks.choices`). A `wait` on wave progress never resolves until you pick.
- Several pending level-ups open their offers one after another. Re-check `picks.choices` after each pick.
- Everything runs in real time. Budget up to two minutes for a wave, and pass explicit `wait` timeouts.
- The cards are random (`Math.random`, not seeded outside the sim). Assert the key of the card you clicked, read from `picks.choices` before clicking, and never a fixed item.
