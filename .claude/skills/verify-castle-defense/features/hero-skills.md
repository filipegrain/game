# Hero movement and skills

The player moves the hero with right-click and casts Q/W/E/R. Aim skills need a key, then a left-click on the target. Instant skills fire on the key toward the cursor. Auto skills toggle autocast. Passive skills react to combat with no key. Each cast starts its cooldown, which shows on the skill bar.

## Sub-features

- `move` sends a right-click move order and the hero walks there.
- `aim-cast` covers the aim skills (Mage W Poison Pool, E Deep Freeze, R Meteor Storm): key, then left-click, then cooldown.
- `aim-cancel` cancels an aim with right-click or Escape, which starts no cooldown and gives no move order.
- `instant-cast` covers Warrior R Dash, which fires toward the cursor on the key press.
- `auto-toggle` covers Mage Q Fire Bolt, which the key or a click on the skill icon toggles.
- `cooldown-deny` shows that pressing a skill on cooldown does nothing.

## How to get to it (user POV)

- Right-click on the ground to move. Right-click an enemy to attack it.
- Press Q/W/E/R. For aim skills, left-click the target afterwards.
- Click the Q icon on the skill bar to toggle Mage autocast.

## Driving it with cdg

Preconditions:

- `node $CDG start mage easy` (or `warrior` for the Dash steps). The hero starts at about world (284,720).

- **Move.** Run `node $CDG wclick 584 720 right`. `node $CDG eval "game.scene.getScene('GameScene').hero.order"` shows `{type:"move", x≈583, y≈719}`. Then `node $CDG wait "Math.abs(game.scene.getScene('GameScene').hero.x-584)<20" 5000` returns ok in under 1 s.
- **Aim.** Run `node $CDG wmove 784 720` then `node $CDG key KeyE`. `state` shows `hero.aiming: "E"`. Run `node $CDG shot hero-skills/aim-E.png` to capture the aim indicator.
- **Confirm cast.** Run `node $CDG wclick 784 720 left`. `state` shows `aiming: null` and `cooldowns.E` at about `CONFIG.skills.mage.E.cd` (12 at level 1).
- **Cancel aim.** Run `node $CDG key KeyW` then `node $CDG wclick 700 720 right`. `aiming` is null, `cooldowns.W` is 0 and `hero.order` didn't change.
- **Cooldown deny.** Run `node $CDG key KeyE` again while it's on cooldown. `aiming` stays null and the cooldown keeps counting down.
- **Auto toggle.** Run `node $CDG key KeyQ`. `node $CDG eval "game.scene.getScene('GameScene').hero.kit.autoQ"` flips (it starts `true`), and a notice reads "Fire Bolt autocast OFF (Q)". Left-clicking the Q icon with `node $CDG click 638 668` flips it back.
- **Dash (Warrior).** Run `node $CDG wmove 484 720` then `node $CDG key KeyR`. The hero x moves toward 484 by up to `CONFIG.skills.warrior.R.range`, and `cooldowns.R` is set.
- **Proof.** Capture `shot`, `state` and `logs` after each cast. `logs` must be `[]`.

## Gotchas

- `wclick` fails when the point is off screen. Keep targets within about 600 px horizontally of the hero.
- Skills cast while the Dash is in progress (`kit.busy`) are buffered, not dropped. Wait for the dash to end before asserting a second cast.
- The skill-bar icon positions follow `HERO_PANEL` in `UIScene.js`. If the HUD moves, re-read `createBottomPanel` for the coordinates.
- Warrior Q/W/E are passive. Pressing them correctly does nothing, so prove them through combat in `waves-picks`.
