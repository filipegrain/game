// Allied soldiers/archers spawned by the Keep.

class Ally extends Unit {
  constructor(scene, kind, x, y, tier) {
    const d = CONFIG.allies[kind];
    const mul = 1 + CONFIG.keep.allyTierScaling * (tier - 1);
    super(scene, x, y, { radius: d.radius, hp: Math.round(d.hp * mul), armor: d.armor, team: 'player', color: d.color, shape: d.shape, depth: 19 });
    this.kind = kind;
    this.def = d;
    this.damage = d.damage * mul;
    this.range = d.range;
    this.rate = d.rate;
    this.speed = d.speed;
    this.atkCd = 0;
    this.retargetT = 0;
    this.target = null;
    this.slot = scene.allyCommand.nextSlot();
    this.rotates = d.shape === 'diamond';
  }

  update(dt) {
    if (!this.alive) return;
    this.updateStatus(dt);
    if (!this.alive) return;
    this.integrateKnock(dt);
    this.atkCd -= dt;
    if (this.stunned) { this.syncGfx(); return; }

    const cmd = this.scene.allyCommand;
    const post = cmd.postFor(this);
    const leash = cmd.mode === 'command' ? CONFIG.allies.commandLeash : CONFIG.allies.leash;

    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target || !this.target.alive) {
      this.retargetT = 0.3;
      this.target = null;
      let bestD = this.def.aggro;
      for (const e of this.scene.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - post.x, e.y - post.y) > leash + this.def.aggro * 0.5) continue;
        const d = e.edgeDist(this.x, this.y);
        if (d < bestD) { bestD = d; this.target = e; }
      }
    }

    const t = this.target;
    if (t && t.alive) {
      // give up chasing if dragged too far from post
      if (Math.hypot(t.x - post.x, t.y - post.y) > leash + 150) { this.target = null; }
      else {
        const d = t.edgeDist(this.x, this.y) - this.radius;
        if (d <= this.range) {
          this.vx = 0; this.vy = 0;
          this.facing = Math.atan2(t.y - this.y, t.x - this.x);
          if (this.atkCd <= 0) this.attack(t);
        } else {
          this.navigateTo(t.x, t.y, this.speed * this.speedMul, dt, 1500);
        }
        this.syncGfx();
        return;
      }
    }
    this.navigateTo(post.x, post.y, this.speed * this.speedMul, dt, 1500, 8);
    this.syncGfx();
  }

  attack(t) {
    this.atkCd = 1 / (this.rate * this.atkSpeedMul);
    if (this.def.ranged) {
      this.scene.spawnProjectile({
        x: this.x, y: this.y, target: t, speed: this.def.projSpeed, color: 0xbfe0ff, kind: 'arrow',
        onHit: (p, tgt) => { if (tgt) Combat.dealDamage(tgt, this.damage, { source: this }); },
      });
    } else {
      Combat.dealDamage(t, this.damage, { source: this, melee: true });
    }
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    Feel.burst(this.x, this.y, this.color, 8);
    this.destroy();
  }
}
