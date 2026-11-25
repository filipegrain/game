# Build towers

The player opens the build panel, picks a building, sees a green or red placement ghost, and left-clicks a valid terrain tile next to a lane inside the Keep's build radius. Gold is deducted and the building appears. Invalid tiles show a notice and cost nothing.

## Sub-features

- `build-open` opens the panel with V or the BUILD button.
- `build-pick` picks a building with a hotkey (1–5) or a panel button. Locked tiers show a notice.
- `build-place` places a building on a valid tile and deducts its cost.
- `build-invalid` rejects lanes, the Keep's surroundings, tiles outside the radius and unaffordable buildings, showing a reason and keeping the gold.
- `build-cancel` stops placing with right-click or Escape.

## How to get to it (user POV)

- Press V, or click BUILD at the top right, then press 1–5 or click a panel row.
- Left-click the map to place. Right-click or Escape cancels.

## Driving it with cdg

Preconditions:

- `node $CDG start warrior medium` (300 gold, Keep tier 1 so only `arrow` is unlocked).

- **Find a valid tile.** Run `node $CDG eval "(() => { const gs = game.scene.getScene('GameScene'), h = gs.hero, out = []; for (let ty = 0; ty < CONFIG.MAP_H; ty++) for (let tx = 0; tx < CONFIG.MAP_W; tx++) if (gs.build.check('arrow', tx, ty).ok) out.push({ tx, ty, wx: CONFIG.px(tx) + 16, wy: CONFIG.px(ty) + 16, d: Math.hypot(CONFIG.px(tx) - h.x, CONFIG.px(ty) - h.y) }); out.sort((a, b) => a.d - b.d); return out.slice(0, 3); })()"`. At commit 4a5cb6e the nearest one was tile (5,26), world (176,848).
- **Open and pick.** Run `node $CDG key KeyV` then `node $CDG key Digit1`. `state.placing` is `"arrow"`.
- **Ghost.** Run `node $CDG wmove 176 848` then `node $CDG shot build/ghost.png`. A green footprint shows with the range circle and the build-radius ring.
- **Place.** Run `node $CDG wclick 176 848`. `state.buildings` contains `{type:"arrow", level:1, tx:5, ty:26}` and `gold` dropped by `CONFIG.buildings.arrow.cost` (300 → 200).
- **Invalid.** While still placing, run `node $CDG wclick 400 720` (a lane tile). No building is added, gold is unchanged, and a notice shows "Buildings go next to lanes, not on them".
- **Locked tier.** Run `node $CDG key Digit2`. `placing` doesn't become `cannon`, and a notice shows that it requires Keep tier 2.
- **Cancel.** Run `node $CDG key Escape`. `state.placing` is null.
- **Proof.** Run `node $CDG shot build/placed.png` with the tower visible next to the lane, plus `state` and `logs`.

## Gotchas

- Placing doesn't exit placement mode. `placing` stays set after a successful build, so cancel before driving other left-clicks.
- Escape works in layers: it cancels aim, then placement, then cursor mode, then selection, and only then pauses. Press it once per layer.
- The valid-tile list depends on the map in `CONFIG.map` and the Keep tier. Always recompute it with `build.check`, and never reuse the example tile after a map change.
- Building checks read `economy.canAfford`, so after spending, the same tile list can turn invalid with the reason "Not enough gold".
