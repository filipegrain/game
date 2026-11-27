# Start a game

The player picks Warrior or Mage on the menu, then starts. There is no difficulty choice. It opens with the hero next to the Keep, `CONFIG.startGold` gold, and a countdown to wave 1 (`CONFIG.waves.firstDelay` s).

## Sub-features

- `start-hero` selects the hero by clicking its card.
- `start-go` starts the game with the START button or Enter.

## How to get to it (user POV)

- On the menu, click a hero card, then click START.
- On the menu, press Enter. This starts with the current selection, which is Warrior by default.

## Driving it with cdg

Preconditions:

- A fresh `launch`, with `doctor` reporting `scenes: ["MenuScene"]`.

- **Menu proof.** Run `node $CDG shot start-game/menu.png`. The screenshot shows CASTLE DEFENSE, both hero cards and the best score line.
- **Click flow.** Run `node $CDG start mage`. This clicks the Mage card (800,300) and START (640,597). It prints `{"hero":"mage","gold":200}`.
- **State.** Run `node $CDG state`. `active` is `["GameScene","UIScene"]`, `wave` is 0, `nextWaveIn` is just under `CONFIG.waves.firstDelay`, 8 lane towers stand, `gold` matches `CONFIG.startGold`, and the hero is at level 1 with full hp.
- **Enter flow.** Relaunch, then run `node $CDG key Enter` followed by `node $CDG wait "game.scene.isActive('GameScene')"`. `state` shows warrior with 200 gold.
- **Proof.** Run `node $CDG shot start-game/in-game.png`. The HUD shows the gold, `Wave 0`, the `Wave 1 in 0:xx` countdown and the hero panel with the matching hero's skills.

## Gotchas

- Card clicks call `Sfx.resume()`, so audio starts. Headless Chrome is muted anyway.
- Without a relaunch, Enter on the menu reuses the selection from the previous menu visit (`MenuScene.init` keeps `this.choice`).
