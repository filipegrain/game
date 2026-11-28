# Hero movement and skills

The player moves the hero with right-click and casts Q/W/E. Each hero has nine active skills (`CONFIG.skills[hero]`); the player picks three on the menu's skill card and they bind to Q/W/E in pick order (`hero.skillIds`). Aim skills need a key, then a left-click. Instant skills fire on the key toward the cursor. Each cast starts its cooldown, which shows on the skill bar. A `target` skill (Execute, Chain Lightning, Hunter's Mark, Snipe) with no enemy within 90 px of the click is refused and starts no cooldown.

## Sub-features

- `move` sends a right-click move order and the hero walks there.
- `aim-cast` covers the aim skills: key, then left-click, then cooldown.
- `aim-cancel` cancels an aim with right-click or Escape, which starts no cooldown and gives no move order.
- `instant-cast` covers the instant skills (Whirlwind, War Cry, Riposte, Rapid Fire), which fire on the key press.
- `recast` covers Arcane Orb: pressing its key while the orb flies bursts it early.
- `cooldown-deny` shows that pressing a skill on cooldown does nothing.

## How to get to it (user POV)

- Right-click on the ground to move. Right-click an enemy to attack it.
- Press Q/W/E. For aim skills, left-click the target afterwards.

## Driving it with cdg

Preconditions:

- `node $CDG start <hero> <id,id,id>` with the loadout under test (for example `start mage freeze,gravity,orb`). Skills cast at enemies need enemies on screen: walk the hero up a lane (hold `Space` to follow it and right-click ahead) until a wave meets it. Early waves die to the lane towers before they reach the Keep.

- **Move.** Run `node $CDG wclick <x> <y> right` a few hundred px from the hero. `hero.order` shows `{type:"move"}` and the hero arrives within about a second.
- **Aim.** Run `node $CDG key KeyQ`. `state` shows `hero.aiming: "Q"`. Run `node $CDG shot hero-skills/aim-Q.png` to capture the indicator.
- **Confirm cast.** Run `node $CDG wclick <x> <y> left` on the target (on an enemy for a `target` skill). `state` shows `aiming: null` and `cooldowns.Q` near `CONFIG.skills[hero][id].cd`.
- **Instant.** `node $CDG wmove <x> <y>` then `node $CDG key KeyW`. The cooldown starts at once.
- **Cancel aim.** Run `node $CDG key KeyW` then `node $CDG wclick <x> <y> right`. `aiming` is null, the cooldown is 0 and `hero.order` didn't change.
- **Cooldown deny.** Press the key again while it's on cooldown. `aiming` stays null and the cooldown keeps counting down.
- **Proof.** Capture `shot`, `state` and `logs` after each cast. `logs` must be `[]`.

## Gotchas

- `wclick` fails when the point is off screen. Keep targets within about 600 px horizontally of the hero, and clamp near the world edges.
- Skills cast while a dash, leap or channel is in progress (`kit.busy`) are buffered, not dropped. Wait for it to end before asserting a second cast.
- An Execute that kills its target resets its own cooldown to 0. Check `stats.kills` before reading that as a refused cast.
- The skill-bar icon positions follow `HERO_PANEL` in `UIScene.js` (Q/W/E at x ≈ 662|742|822, y ≈ 668).
