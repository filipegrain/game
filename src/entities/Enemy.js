// Enemy unit: flow-field toward the Keep, aggro on the hero, creeps and lane towers; attacks buildings that are
// in the way. With `camp` set it is a neutral camp monster instead: idle until the hero hits it, then fights the
// hero until leashed back to the camp.

class Enemy extends Unit {
  constructor(scene, type, x, y, mods, camp = null) {
    const d = camp ? CONFIG.neutrals[type] : CONFIG.enemies[type];
    super(scene, x, y, {
      radius: d.radius, hp: Math.round(d.hp * mods.hp), armor: d.armor, team: 'enemy',
      color: d.color, shape: d.shape, depth: type === 'boss' ? 22 : 19,
    });
    this.type = type;
    this.def = d;
    this.damage = d.damage * mods.dmg;
    this.speed = d.speed * mods.speed;
    this.range = d.range;
    this.rate = d.rate;
    this.gold = Math.round(d.gold * mods.gold);
    this.xp = Math.round(d.xp * mods.xp);
    this.atkCd = Math.random() * 0.5;
    this.retargetT = 0;
    this.target = null;
    this.rotates = d.shape === 'triangle' || d.shape === 'diamond';
    this.knockResist = type === 'boss' ? 6 : type === 'brute' ? 2 : 1;
    this.specialT = (d.slamEvery || d.healEvery || 0) * (0.5 + Math.random() * 0.5);
    this.slam = null;
    this.isBoss = type === 'boss';
    if (this.isBoss) this.stunResist = 0.5;
    this.progT = 1.5; this.lastFd = Infinity;
    this.neutral = !!camp;
    if (camp) { this.camp = camp; this.home = { x, y }; this.provoked = false; }
  }

  applyStun(t, freeze) { super.applyStun(this.isBoss ? t * 0.4 : t, freeze); }

  validTarget(t) {
    if (!t || !t.alive) return false;
    if (t.invulnerable) return false;
    return true;
  }

  // Nearest of: hero, creeps and lane towers within aggro; buildings next to us; the Keep in range.
  // Structure breakers (Sapper) skip units and go for any tower or building within their breaker range.
  pickTarget() {
    const s = this.status, sc = this.scene;
    if (s.tauntT > 0 && s.tauntBy && s.tauntBy.alive) return s.tauntBy;
    const d = this.def;
    let best = null, bestD = Infinity;
    const consider = (t, maxD) => {
      if (!t.alive || t.invulnerable) return;
      const dd = t.edgeDist(this.x, this.y);
      if (dd <= maxD && dd < bestD) { bestD = dd; best = t; }
    };
    const near = this.range + this.radius + 16;
    if (d.structureBreaker) {
      for (const t of sc.towers) consider(t, d.structureBreaker);
      for (const b of sc.buildings) consider(b, d.structureBreaker);
    } else {
      consider(sc.hero, d.aggro);
      for (const a of sc.allies) consider(a, d.aggro);
      for (const t of sc.towers) consider(t, d.aggro);
      for (const b of sc.buildings) consider(b, near);
    }
    if (best) return best;
    if (sc.keep.alive && sc.keep.edgeDist(this.x, this.y) - this.radius <= this.range + 6) return sc.keep;
    // walled in: no flow progress lately → break the nearest building
    if (this.stuck) for (const b of sc.buildings) consider(b, 160);
    return best;
  }

  // Flow progress check: an enemy that made no progress toward the Keep for a while counts as stuck.
  trackProgress(dt) {
    this.progT -= dt;
    if (this.progT > 0) return;
    this.progT = 1.5;
    const p = this.scene.pathing;
    const fd = p.flowDistAt(this.x, this.y, this.viaBridge ? p.bridgeDist[this.lane] : p.dist);
    this.stuck = !this.target && fd >= this.lastFd - 0.5;
    this.lastFd = fd;
  }

  update(dt) {
    if (!this.alive) return;
    this.updateStatus(dt);
    if (!this.alive) return;
    this.integrateKnock(dt);
    this.atkCd -= dt;

    if (this.stunned) { this.vx = 0; this.vy = 0; this.syncGfx(); return; }
    if (this.status.polyT > 0) { this.wander(dt); this.syncGfx(); return; }

    if (this.slam) { this.updateSlam(dt); this.syncGfx(); return; }
    if (this.neutral) { this.updateNeutral(dt); this.syncGfx(); return; }
    this.updateSpecial(dt);
    if (this.slam) { this.syncGfx(); return; }
    this.trackProgress(dt);

    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.validTarget(this.target)) {
      this.retargetT = 0.25 + Math.random() * 0.1;
      this.target = this.pickTarget();
    }

    const sp = this.speed * this.speedMul;
    const t = this.target;
    if (t) {
      const dist = t.edgeDist(this.x, this.y) - this.radius;
      if (dist <= this.range) {
        this.vx = 0; this.vy = 0;
        this.facing = Math.atan2(t.y - this.y, t.x - this.x);
        if (this.atkCd <= 0) this.attack(t);
      } else if (t === this.scene.keep) {
        this.followFlow(sp, dt);
      } else if (t.isStructure) {
        this.navigateTo(t.x, t.y, sp, dt, 1500);
      } else {
        // chase a unit
        const p = this.scene.pathing;
        if (p.los(this.x, this.y, t.x, t.y, this.radius)) this.moveToward(t.x, t.y, sp, dt, 1500);
        else this.navigateTo(t.x, t.y, sp, dt, 1500);
      }
    } else {
      this.followFlow(sp, dt);
    }
    this.syncGfx();
  }

  // Polymorphed: a harmless critter hopping around (no attacks, a boss's slam fizzles).
  wander(dt) {
    if (this.slam) { this.slam.g.destroy(); this.slam = null; }
    this.wanderT = (this.wanderT || 0) - dt;
    if (this.wanderT <= 0) { this.wanderT = 0.4 + Math.random() * 0.4; this.wanderA = Math.random() * Math.PI * 2; }
    this.steer(Math.cos(this.wanderA), Math.sin(this.wanderA), CONFIG.skills.mage.polymorph.critterSpeed, dt, 1500);
  }

  // Neutral: idle at the camp; once provoked, fight the hero until leashed, then walk home healing.
  updateNeutral(dt) {
    const h = this.scene.hero, sp = this.speed * this.speedMul;
    const fromHome = Math.hypot(this.x - this.home.x, this.y - this.home.y);
    if (this.provoked && (!h.alive || h.invulnerable || fromHome > CONFIG.neutrals.leash)) this.provoked = false;
    if (this.provoked) {
      const dist = h.edgeDist(this.x, this.y) - this.radius;
      if (dist <= this.range) {
        this.vx = 0; this.vy = 0;
        this.facing = Math.atan2(h.y - this.y, h.x - this.x);
        if (this.atkCd <= 0) this.attack(h);
      } else this.navigateTo(h.x, h.y, sp, dt, 1500);
      return;
    }
    if (fromHome > 8) { this.navigateTo(this.home.x, this.home.y, sp * 1.3, dt, 1500); this.heal(this.maxHp * 0.25 * dt); }
    else { this.vx = 0; this.vy = 0; this.heal(this.maxHp * 0.1 * dt); }
  }

  followFlow(sp, dt) {
    const p = this.scene.pathing;
    const next = this.lane != null ? p.laneNext(this, p.dist) : p.flowNext(this.x, this.y);
    if (!next) { this.vx = 0; this.vy = 0; return; }
    const T = CONFIG.TILE;
    const tx = next.tx * T + T / 2, ty = next.ty * T + T / 2;
    // aim at the next tile but keep some of our lateral offset so groups don't single-file
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.steer(dx / d, dy / d, sp, dt, 1500);
  }

  attack(t) {
    this.atkCd = 1 / this.rate;
    const d = this.def;
    const structMul = d.structureMul || 1;
    if (d.ranged) {
      this.scene.spawnProjectile({
        x: this.x, y: this.y, target: t, speed: d.projSpeed, color: this.type === 'shaman' ? 0xc77dff : 0xff8080,
        kind: this.type === 'shaman' ? 'ball' : 'arrow', radius: 4,
        onHit: (pr, tgt) => { if (tgt) Combat.dealDamage(tgt, this.damage, { source: this, structureMul: structMul }); },
      });
    } else {
      Combat.dealDamage(t, this.damage, { source: this, melee: true, structureMul: structMul });
      // lunge
      if (this.gfx) {
        const ox = Math.cos(this.facing) * 5, oy = Math.sin(this.facing) * 5;
        this.gfx.x += ox; this.gfx.y += oy;
      }
      if (t.isHero) Sfx.play('hit');
    }
  }

  updateSpecial(dt) {
    const d = this.def;
    if (this.type === 'boss') {
      this.specialT -= dt;
      if (this.specialT <= 0) {
        const targets = Combat.playerUnitsInRadius(this.x, this.y, d.slamRadius * 0.9);
        const structNear = Combat.structuresInRadius(this.x, this.y, d.slamRadius * 0.6).length > 0;
        if (targets.length || structNear) {
          this.specialT = d.slamEvery;
          this.slam = { t: d.slamWindup, x: this.x, y: this.y, g: this.scene.add.graphics().setDepth(8) };
          Sfx.play('boss');
        } else this.specialT = 0.5;
      }
    } else if (this.type === 'shaman') {
      this.specialT -= dt;
      if (this.specialT <= 0) {
        this.specialT = d.healEvery;
        let any = false;
        for (const e of Combat.enemiesInRadius(this.x, this.y, d.healRadius, true)) {
          if (e === this) continue;
          any = true;
          e.heal(e.maxHp * d.healPct);
          e.status.hasteMul = d.hasteMul; e.status.hasteT = d.hasteTime;
        }
        if (any) Feel.ring(this.x, this.y, d.healRadius, 0x9b4dca, { duration: 450, width: 3 });
      }
    }
  }

  updateSlam(dt) {
    const s = this.slam, d = this.def;
    s.t -= dt;
    const prog = 1 - s.t / d.slamWindup;
    s.g.clear();
    s.g.fillStyle(0xff2020, 0.12 + 0.18 * prog);
    s.g.fillCircle(s.x, s.y, d.slamRadius);
    s.g.lineStyle(3, 0xff3030, 0.9);
    s.g.strokeCircle(s.x, s.y, d.slamRadius);
    s.g.fillStyle(0xff3030, 0.35);
    s.g.fillCircle(s.x, s.y, d.slamRadius * prog);
    if (s.t <= 0) {
      s.g.destroy();
      this.slam = null;
      for (const u of Combat.playerUnitsInRadius(s.x, s.y, d.slamRadius)) {
        Combat.dealDamage(u, d.slamDamage * (this.damage / d.damage), { source: this, knock: { x: u.x - s.x, y: u.y - s.y, force: 380 } });
        if (u.alive) u.applyStun(d.slamStun);
      }
      for (const st of Combat.structuresInRadius(s.x, s.y, d.slamRadius)) {
        Combat.dealDamage(st, d.slamDamage * (this.damage / d.damage), { source: this, structureMul: d.structureMul });
      }
      Feel.ring(s.x, s.y, d.slamRadius, 0xff5030, { duration: 400, width: 6, fill: true });
      Feel.burst(s.x, s.y, 0x8b1a1a, 24);
      Feel.shake(0.012, 260);
      Feel.hitstop(CONFIG.feel.hitstop.boss);
      Sfx.play('thump');
    }
  }

  onDamaged(dmg, opts) {
    super.onDamaged(dmg, opts);
    if (this.neutral && opts.source && opts.source.isHero) for (const m of this.camp.units) m.provoked = true;
    if (opts.source && opts.source.isHero) Sfx.play('enemyHit');
  }

  die(killer) {
    if (!this.alive) return;
    this.alive = false;
    const sc = this.scene;
    if (this.slam) { this.slam.g.destroy(); this.slam = null; }
    sc.onEnemyKilled(this, killer);
    Feel.burst(this.x, this.y, this.color, this.isBoss ? 40 : 10);
    if (this.isBoss) { Feel.shake(0.01, 300); Feel.hitstop(0.08); }
    Sfx.play('death');
    this.destroy();
  }
}
