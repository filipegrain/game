// Ally behaviour: automatic lane guarding.

class AllyCommand {
  constructor(scene) {
    this.scene = scene;
    this.guardLane = 1;
    this.evalT = 0;
    this.slotCounter = 0;
    const T = CONFIG.TILE;
    this.posts = CONFIG.map.lanes.map(l => ({ x: l.post.x * T, y: l.post.y * T }));
  }

  nextSlot() { return this.slotCounter++; }

  // Formation offset so allies don't stack on one point.
  slotOffset(slot) {
    const ring = Math.floor(slot / 6);
    const a = (slot % 6) / 6 * Math.PI * 2 + ring * 0.5;
    const r = 22 + ring * 20;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  postFor(ally) {
    const base = this.posts[this.guardLane];
    const o = this.slotOffset(ally.slot % 18);
    if (!ally.postCache || ally.postCache.bx !== base.x || ally.postCache.by !== base.y) {
      const pt = this.scene.pathing.nearestWalkable(base.x + o.x, base.y + o.y, ally.radius);
      ally.postCache = { bx: base.x, by: base.y, x: pt.x, y: pt.y };
    }
    return ally.postCache;
  }

  update(dt) {
    this.evalT -= dt;
    if (this.evalT > 0) return;
    this.evalT = 1;
    // guard the lane whose enemies are closest to the Keep
    const p = this.scene.pathing;
    let best = null, bestD = Infinity;
    for (const e of this.scene.enemies) {
      if (!e.alive) continue;
      const d = p.flowDistAt(e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    this.guardLane = best ? p.laneOfY(best.y) : 1;
  }
}
