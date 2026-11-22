// Ally behaviour: automatic lane guarding or a commanded rally point (F).

class AllyCommand {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'auto';          // 'auto' | 'command'
    this.rally = null;
    this.guardLane = 1;
    this.evalT = 0;
    this.slotCounter = 0;
    this.flag = scene.add.graphics().setDepth(9).setVisible(false);
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
    const base = this.mode === 'command' && this.rally ? this.rally : this.posts[this.guardLane];
    const o = this.slotOffset(ally.slot % 18);
    if (!ally.postCache || ally.postCache.bx !== base.x || ally.postCache.by !== base.y) {
      const pt = this.scene.pathing.nearestWalkable(base.x + o.x, base.y + o.y, ally.radius);
      ally.postCache = { bx: base.x, by: base.y, x: pt.x, y: pt.y };
    }
    return ally.postCache;
  }

  setRally(x, y) {
    const pt = this.scene.pathing.nearestWalkable(x, y, 10);
    this.mode = 'command';
    this.rally = pt;
    for (const a of this.scene.allies) { a.target = null; a.retargetT = 0; }
    this.drawFlag();
    Feel.clickRing(pt.x, pt.y, 0x4a8fe0);
    Sfx.play('click');
    this.scene.events.emit('notice', 'Allies rallying (F twice = auto)');
  }

  setAuto() {
    this.mode = 'auto';
    this.rally = null;
    this.flag.setVisible(false);
    for (const a of this.scene.allies) { a.target = null; a.retargetT = 0; }
    this.scene.events.emit('notice', 'Allies on automatic');
  }

  drawFlag() {
    const g = this.flag, p = this.rally;
    g.clear();
    g.lineStyle(3, 0xdddddd, 1); g.lineBetween(p.x, p.y, p.x, p.y - 34);
    g.fillStyle(0x4a8fe0, 1); g.fillTriangle(p.x, p.y - 34, p.x + 22, p.y - 27, p.x, p.y - 20);
    g.lineStyle(2, 0x4a8fe0, 0.5); g.strokeCircle(p.x, p.y, 30);
    g.setVisible(true);
  }

  update(dt) {
    this.evalT -= dt;
    if (this.evalT > 0 || this.mode !== 'auto') return;
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
