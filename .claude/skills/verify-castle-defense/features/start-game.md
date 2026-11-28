# Start a game

The player picks Warrior, Mage or Archer on the menu, then picks 3 of that hero's 9 skills on the skill card, then starts. There is no difficulty choice. It opens with the hero next to the Keep, `CONFIG.startGold` gold, and a countdown to wave 1 (`CONFIG.waves.firstDelay` s).

## Sub-features

- `start-hero` selects the hero by clicking its card.
- `start-skills` opens the skill card (SKILLS ▸ or Enter) and toggles skills; picks show their key badge (Q/W/E in pick order), a fourth pick is refused, and START stays dim until three are picked. The last picks per hero persist in `localStorage` (`cd_loadouts`).
- `start-go` starts the game with the START button or Enter.

## How to get to it (user POV)

- On the menu, click a hero card, click SKILLS ▸, click three skills, then click START.
- Enter moves from the hero screen to the skill card, and from the skill card starts the game once three skills are picked. Escape or ◂ Heroes goes back.

## Driving it with cdg

Preconditions:

- A fresh `launch`, with `doctor` reporting `scenes: ["MenuScene"]`.

- **Menu proof.** Run `node $CDG shot start-game/menu.png`. The screenshot shows CASTLE DEFENSE, the three hero cards with stat bars and the best score line.
- **Click flow.** Run `node $CDG start mage freeze,gravity,orb`. This clicks the Mage card (640,330), SKILLS ▸ (640,597), clears any remembered picks, clicks the three skill cards (3×3 grid, see `cdg.mjs`) and START (640,597). Without a list it picks the first three skills. It prints `{"hero":"mage","gold":200}`; `hero.skillIds` is `{Q:'freeze',W:'gravity',E:'orb'}`.
- **State.** Run `node $CDG state`. `active` is `["GameScene","UIScene"]`, `wave` is 0, `nextWaveIn` is just under `CONFIG.waves.firstDelay`, 8 lane towers stand, `gold` matches `CONFIG.startGold`, and the hero is at level 1 with full hp.
- **Enter flow.** Relaunch, run `node $CDG key Enter` (skill card), click three skill cards, then `node $CDG key Enter` and `node $CDG wait "game.scene.isActive('GameScene')"`. `state` shows warrior with 200 gold.
- **Proof.** Run `node $CDG shot start-game/in-game.png`. The HUD shows the gold, `Wave 0`, the `Wave 1 in Ns` countdown and the hero panel with the three picked skills.

## Gotchas

- Card clicks call `Sfx.resume()`, so audio starts. Headless Chrome is muted anyway.
- Without a relaunch, Enter on the menu reuses the selection from the previous menu visit (`MenuScene.init` keeps `this.choice`).
