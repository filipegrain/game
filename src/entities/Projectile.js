// Projectiles: homing (arrows/bolts), point-target (cannon) and skillshots (fire bolt).
//
// opts: {
//   x, y, speed, color, radius, kind: 'arrow' | 'ball' | 'bolt',
//   target            - homing target (unit or structure)
//   tx, ty            - point target (non homing)
//   dir: {x,y}, maxDist, hitTeam: 'enemy' | 'player', pierce  - skillshot
//   onHit(proj, target|null, x, y)
// }

class Projectile {
  constructor(scene, o) {
    this.scene = scene;
    Object.assign(this, { pierce: 0, radius: 4, kind: 'ball', color: 0xffffff }, o);
    this.alive = true;
    this.traveled = 0;
    this.hitSet = new Set();
    this.gfx = scene.add.graphics().setDepth(30);
    this.trailT = 0;
    const g = this.gfx;
    if (this.kind === 'arrow') {
      g.lineStyle(2, this.color, 1);
      g.lineBetween(-7, 0, 5, 0);
      g.fillStyle(this.color, 1); g.fillTriangle(5, -3, 10, 0, 5, 3);
    } else if (this.kind === 'bolt') {
      g.fillStyle(this.color, 0.35); g.fillCircle(0, 0, this.radius * 1.9);
      g.fillStyle(this.color, 1); g.fillCircle(0, 0, this.radius);
      g.fillStyle(0xffffff, 1); g.fillCircle(0, 0, this.radius * 0.45);
    } else {
      g.fillStyle(this.color, 1); g.fillCircle(0, 0, this.radius);
      g.lineStyle(1.5, 0x000000, 0.5); g.strokeCircle(0, 0, this.radius);
    }
    if (this.dir) { this.vx = this.dir.x * this.speed; this.vy = this.dir.y * this.speed; }
    this.lastTx = o.target ? o.target.x : o.tx;
    this.lastTy = o.target ? o.target.y : o.ty;
    this.gfx.setPosition(this.x, this.y);
  }

  update(dt) {
    if (!this.alive) return;
    if (this.dir) return this.updateSkillshot(dt);
    // homing / point target
    if (this.target && this.target.alive) { this.lastTx = this.target.x; this.lastTy = this.target.y; }
    const dx = this.lastTx - this.x, dy = this.lastTy - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    const angle = Math.atan2(dy, dx);
    this.gfx.setRotation(angle);
    const hitDist = this.target && this.target.alive && this.target.radius ? this.target.radius * 0.6 : 2;
    if (d <= step + hitDist) {
      this.x = this.lastTx; this.y = this.lastTy;
      const tgt = this.target && this.target.alive ? this.target : null;
      if (this.onHit) this.onHit(this, tgt, this.x, this.y);
      this.destroy();
      return;
    }
    this.x += dx / d * step; this.y += dy / d * step;
    this.gfx.setPosition(this.x, this.y);
  }

  updateSkillshot(dt) {
    const step = this.speed * dt;
    const sub = Math.max(1, Math.ceil(step / 10));
    for (let i = 0; i < sub && this.alive; i++) {
      this.x += this.vx * dt / sub; this.y += this.vy * dt / sub;
      this.traveled += step / sub;
      if (this.hitTeam === 'enemy') {
        for (const e of this.scene.enemies) {
          if (!e.alive || this.hitSet.has(e)) continue;
          if (Math.hypot(e.x - this.x, e.y - this.y) <= e.radius + this.radius) {
            this.hitSet.add(e);
            if (this.onHit) this.onHit(this, e, this.x, this.y);
            if (this.pierce <= 0) { this.destroy(); return; }
            this.pierce--;
          }
        }
      }
      if (this.traveled >= this.maxDist) {
        if (this.onExpire) this.onExpire(this, this.x, this.y);
        this.destroy();
        return;
      }
    }
    this.trailT -= dt;
    if (this.trailT <= 0) { this.trailT = 0.025; Feel.burst(this.x, this.y, this.color, 1); }
    this.gfx.setPosition(this.x, this.y);
  }

  destroy() {
    this.alive = false;
    if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
  }
}
