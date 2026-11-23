// Base class for moving units (hero, allies, enemies).

class Unit {
  constructor(scene, x, y, o) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.kvx = 0; this.kvy = 0;
    this.radius = o.radius;
    this.maxHp = o.hp; this.hp = o.hp;
    this.armor = o.armor || 0;
    this.team = o.team;
    this.color = o.color;
    this.shape = o.shape || 'circle';
    this.alive = true;
    this.facing = Math.PI;
    this.status = {
      slowMul: 1, slowT: 0, stunT: 0, tauntT: 0, tauntBy: null,
      bleedDps: 0, bleedT: 0, bleedTick: 0, hasteMul: 1, hasteT: 0,
      atkSpeedBonus: 0, atkSpeedT: 0, armorBonus: 0, armorT: 0, frozen: false,
    };
    this.flashT = 0;
    this.gfx = scene.add.graphics().setDepth(o.depth || 20);
    this.nav = { goal: null, path: null, idx: 0, repath: 0 };
    this.redraw();
    this.syncGfx();
  }

  redraw(color) {
    const g = this.gfx;
    g.clear();
    const c = color != null ? color : (this.status.frozen ? 0x9fe9ff : this.color);
    drawShape(g, this.shape, this.radius, c, { line: 2, lineColor: 0x000000, lineAlpha: 0.5 });
  }

  flash() {
    this.flashT = 0.07;
    this.redraw(0xffffff);
  }

  onDamaged() { this.flash(); }

  getArmor() { return this.armor + (this.status.armorT > 0 ? this.status.armorBonus : 0); }

  heal(amount) {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  applySlow(mul, t) {
    const s = this.status;
    if (s.slowT <= 0 || mul <= s.slowMul) { s.slowMul = mul; s.slowT = Math.max(s.slowT, t); }
    else s.slowT = Math.max(s.slowT, t * 0.5);
  }
  applyStun(t, freeze = false) {
    this.status.stunT = Math.max(this.status.stunT, t);
    if (freeze) { this.status.frozen = true; this.redraw(); }
  }
  applyKnock(dx, dy, force) {
    const l = Math.hypot(dx, dy) || 1;
    const resist = this.knockResist || 1;
    this.kvx += dx / l * force / resist;
    this.kvy += dy / l * force / resist;
  }
  applyBleed(dps, t) { this.status.bleedDps = Math.max(this.status.bleedDps, dps); this.status.bleedT = t; }

  get stunned() { return this.status.stunT > 0; }
  get speedMul() { return (this.status.slowT > 0 ? this.status.slowMul : 1) * (this.status.hasteT > 0 ? this.status.hasteMul : 1); }
  get atkSpeedMul() { return 1 + (this.status.atkSpeedT > 0 ? this.status.atkSpeedBonus : 0); }

  updateStatus(dt) {
    const s = this.status;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.redraw(); }
    if (s.slowT > 0) s.slowT -= dt;
    if (s.hasteT > 0) s.hasteT -= dt;
    if (s.atkSpeedT > 0) s.atkSpeedT -= dt;
    if (s.armorT > 0) s.armorT -= dt;
    if (s.stunT > 0) {
      s.stunT -= dt;
      if (s.stunT <= 0 && s.frozen) { s.frozen = false; this.redraw(); }
    }
    if (s.tauntT > 0) { s.tauntT -= dt; if (s.tauntT <= 0) s.tauntBy = null; }
    if (s.bleedT > 0) {
      s.bleedT -= dt;
      s.bleedTick -= dt;
      if (s.bleedTick <= 0) {
        s.bleedTick = 0.5;
        Combat.dealDamage(this, s.bleedDps * 0.5, { source: this.scene.hero, color: '#ff4d6d', skill: 'Q' });
        if (this.alive) Feel.burst(this.x, this.y, 0xb0213a, 3);
      }
    }
  }

  // knockback velocity decays quickly
  integrateKnock(dt) {
    if (Math.abs(this.kvx) + Math.abs(this.kvy) < 2) { this.kvx = 0; this.kvy = 0; return; }
    this.scene.pathing.moveUnit(this, this.kvx * dt, this.kvy * dt);
    const k = Math.exp(-9 * dt);
    this.kvx *= k; this.kvy *= k;
  }

  // Steer toward a direction with acceleration (instant turning).
  steer(dirx, diry, speed, dt, accel = 2000) {
    const cur = Math.hypot(this.vx, this.vy);
    const sp = Math.min(speed, cur + accel * dt);
    this.vx = dirx * sp; this.vy = diry * sp;
    if (sp > 1) this.facing = Math.atan2(diry, dirx);
    return this.scene.pathing.moveUnit(this, this.vx * dt, this.vy * dt);
  }

  moveToward(tx, ty, speed, dt, accel) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) { this.vx = 0; this.vy = 0; return true; }
    const step = speed * dt;
    if (d <= step) {
      this.scene.pathing.moveUnit(this, dx, dy);
      this.facing = Math.atan2(dy, dx);
      return true;
    }
    this.steer(dx / d, dy / d, speed, dt, accel);
    return false;
  }

  // Path-aware navigation (A* when no line of sight). Returns true on arrival.
  navigateTo(tx, ty, speed, dt, accel, arriveDist = 6) {
    const n = this.nav;
    n.repath -= dt;
    const goalMoved = !n.goal || Math.hypot(n.goal.x - tx, n.goal.y - ty) > 40;
    if (goalMoved || n.repath <= 0 || !n.path) {
      n.goal = { x: tx, y: ty };
      n.repath = 0.7 + Math.random() * 0.3;
      const p = this.scene.pathing;
      if (p.los(this.x, this.y, tx, ty, this.radius)) n.path = [{ x: tx, y: ty }];
      else n.path = p.findPath(this.x, this.y, tx, ty, this.radius) || [{ x: tx, y: ty }];
      n.idx = 0;
    } else if (n.path.length) {
      n.path[n.path.length - 1] = { x: tx, y: ty };
    }
    if (Math.hypot(tx - this.x, ty - this.y) <= arriveDist) { this.vx = 0; this.vy = 0; return true; }
    let wp = n.path[n.idx];
    while (wp && n.idx < n.path.length - 1 && Math.hypot(wp.x - this.x, wp.y - this.y) < 10) { n.idx++; wp = n.path[n.idx]; }
    if (!wp) return true;
    this.moveToward(wp.x, wp.y, speed, dt, accel);
    return false;
  }

  clearNav() { this.nav.goal = null; this.nav.path = null; }

  edgeDist(x, y) { return Math.hypot(this.x - x, this.y - y) - this.radius; }

  syncGfx() {
    if (!this.gfx) return;   // destroyed mid-update (e.g. killed by Thorn Mail while attacking)
    this.gfx.setPosition(this.x, this.y);
    if (this.rotates) this.gfx.setRotation(this.facing);
  }

  destroy() {
    this.alive = false;
    if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
  }
}

// Light push-apart between units of the same team (units never block each other).
function separateUnits(list, strength = 60, dt = 0.016) {
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = (a.radius + b.radius) * 0.85;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / min * strength * dt;
      const nx = dx / d, ny = dy / d;
      const pa = a.isHero ? 0.2 : 1, pb = b.isHero ? 0.2 : 1;
      a.scene.pathing.moveUnit(a, -nx * push * pa, -ny * push * pa);
      b.scene.pathing.moveUnit(b, nx * push * pb, ny * push * pb);
    }
  }
}
