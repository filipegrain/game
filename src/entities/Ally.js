// Allied lane creep: spawned at its lane's first tower each wave tick, pushes toward that lane's enemy spawn
// along the spawn's flow field and fights the enemies it meets.

class Ally extends Unit {
  constructor(scene, kind, x, y, tier, lane) {
    const d = CONFIG.allies[kind];
    const mul = 1 + CONFIG.keep.tierScaling * (tier - 1);
    super(scene, x, y, { radius: d.radius, hp: Math.round(d.hp * mul), armor: d.armor, team: 'player', color: d.color, shape: d.shape, depth: 19 });
    this.kind = kind;
    this.def = d;
    this.lane = lane;
    this.damage = d.damage * mul;
    this.range = d.range;
    this.rate = d.rate;
    this.speed = d.speed;
    this.atkCd = 0;
    this.retargetT = Math.random() * 0.3;
    this.target = null;
    this.rotates = d.shape === 'diamond';
    this.viaBridge = true;   // walk to the lane's bridge first
  }

  update(dt) {
    if (!this.alive) return;
    this.updateStatus(dt);
    if (!this.alive) return;
    this.integrateKnock(dt);
    this.atkCd -= dt;
    if (this.stunned) { this.syncGfx(); return; }

    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target || !this.target.alive) {
      this.retargetT = 0.3;
      const t = this.target;
      // keep the current target unless it got away
      if (!(t && t.alive && t.edgeDist(this.x, this.y) <= this.def.aggro * 1.5)) {
        this.target = Combat.nearestEnemy(this.x, this.y, this.def.aggro);
      }
    }

    const sp = this.speed * this.speedMul, t = this.target;
    if (t && t.alive) {
      const d = t.edgeDist(this.x, this.y) - this.radius;
      if (d <= this.range) {
        this.vx = 0; this.vy = 0;
        this.facing = Math.atan2(t.y - this.y, t.x - this.x);
        if (this.atkCd <= 0) this.attack(t);
      } else if (this.scene.pathing.los(this.x, this.y, t.x, t.y, this.radius)) this.moveToward(t.x, t.y, sp, dt, 1500);
      else this.navigateTo(t.x, t.y, sp, dt, 1500);
    } else {
      this.push(sp, dt);
    }
    this.syncGfx();
  }

  // Walk down the lane toward the enemy spawn; stand there once arrived.
  push(sp, dt) {
    const p = this.scene.pathing, field = p.spawnDist[this.lane];
    const next = p.flowDistAt(this.x, this.y, field) > 3 ? p.laneNext(this, field) : null;
    if (!next) { this.vx = 0; this.vy = 0; return; }
    const T = CONFIG.TILE, dx = next.tx * T + T / 2 - this.x, dy = next.ty * T + T / 2 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.steer(dx / d, dy / d, sp, dt, 1500);
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
