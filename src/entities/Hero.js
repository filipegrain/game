// The player-controlled hero: MOBA-style movement, auto-attacks, skills, items, levels.

class Hero extends Unit {
  constructor(scene, heroKey, x, y) {
    const d = CONFIG.heroes[heroKey];
    super(scene, x, y, { radius: d.radius, hp: d.hp, armor: d.armor, team: 'player', color: d.color, shape: 'circle', depth: 24 });
    this.isHero = true;
    this.heroKey = heroKey;
    this.def = d;
    this.rotates = true;
    this.level = 1;
    this.xp = 0;
    this.skillPoints = 1;
    this.ranks = { Q: 0, W: 0, E: 0, R: 0 };
    this.cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
    this.cdMax = { Q: 1, W: 1, E: 1, R: 1 };
    this.items = new Array(CONFIG.inventorySlots).fill(null);
    this.order = null;
    this.path = null; this.pathIdx = 0;
    this.stuckT = 0;
    this.windupT = 0; this.windupTarget = null;
    this.atkCd = 0;
    this.autoTarget = null;
    this.needReplan = false;
    this.buffered = null;
    this.aiming = {};
    this.respawnT = 0;
    this.windCloakT = 0;
    this.trailT = 0;
    this.invulnerable = false;
    this.recalcStats();
    this.mana = this.stats.maxMana;
    this.hp = this.maxHp;
    this.kit = heroKey === 'warrior' ? new WarriorKit(this) : new MageKit(this);
    this.skillDefs = CONFIG.skills[heroKey];
    this.redraw();
  }

  redraw(color) {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    const c = color != null ? color : this.color;
    const r = this.radius;
    g.fillStyle(0x000000, 0.25); g.fillCircle(2, 3, r + 1);
    g.fillStyle(c, 1); g.fillCircle(0, 0, r);
    g.lineStyle(2.5, 0xffffff, 0.95); g.strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(r + 7, 0, r - 2, -6, r - 2, 6);
    if (this.heroKey === 'warrior') { g.fillStyle(0xffd23f, 1); g.fillRect(-4, -4, 8, 8); }
    else { g.fillStyle(0xe9d5ff, 1); g.fillCircle(0, 0, 4.5); }
  }

  // ------------------------------------------------------------ stats
  recalcStats() {
    const d = this.def, pl = d.perLevel, lv = this.level - 1;
    const s = {
      maxHp: d.hp + pl.hp * lv, maxMana: d.mana + pl.mana * lv, damage: d.damage + pl.damage * lv,
      armor: d.armor + pl.armor * lv, speed: d.speed, attackSpeed: 1, hpRegen: d.hpRegen + lv * 0.3,
      manaRegen: d.manaRegen + lv * 0.3, cdr: 0, lifesteal: 0, chain: 0, thorns: 0, skillDamage: 0,
      windCloak: 0, revive: 0, acquireRange: d.acquireRange,
    };
    for (const key of this.items) {
      if (!key) continue;
      const st = CONFIG.items[key].stats;
      for (const k in st) {
        if (k === 'hp') s.maxHp += st[k];
        else if (k === 'mana') s.maxMana += st[k];
        else if (k === 'attackSpeed') s.attackSpeed += st[k];
        else s[k] = (s[k] || 0) + st[k];
      }
    }
    s.cdr = Math.min(0.4, s.cdr);
    const oldMax = this.maxHp, oldMana = this.stats ? this.stats.maxMana : s.maxMana;
    this.stats = s;
    this.maxHp = Math.round(s.maxHp);
    this.armor = s.armor;
    if (this.maxHp > oldMax) this.hp += this.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.maxHp);
    if (this.mana != null) {
      if (s.maxMana > oldMana) this.mana += s.maxMana - oldMana;
      this.mana = Math.min(this.mana, s.maxMana);
    }
  }

  get moveSpeed() {
    let sp = this.stats.speed * this.speedMul;
    if (this.windCloakT > 0) sp *= 1 + this.stats.windCloak;
    return sp;
  }

  skillDamage(base) {
    return base * (1 + CONFIG.heroCommon.skillLevelScaling * (this.level - 1)) * (1 + this.stats.skillDamage);
  }

  // ------------------------------------------------------------ orders
  planPath(x, y) {
    const p = this.scene.pathing;
    const dest = p.nearestWalkable(x, y, this.radius);
    if (p.los(this.x, this.y, dest.x, dest.y, this.radius)) this.path = [dest];
    else this.path = p.findPath(this.x, this.y, dest.x, dest.y, this.radius) || [dest];
    this.pathIdx = 0;
    this.stuckT = 0;
    return dest;
  }

  cancelWindup() { this.windupT = 0; this.windupTarget = null; }

  commandMove(x, y) {
    if (!this.alive) return null;
    this.cancelWindup();
    this.autoTarget = null;
    const dest = this.planPath(x, y);
    this.order = { type: 'move', x: dest.x, y: dest.y };
    return dest;
  }

  commandAttack(target) {
    if (!this.alive) return;
    if (this.windupTarget && this.windupTarget !== target) this.cancelWindup();
    this.order = { type: 'attack', target };
    this.path = null;
  }

  commandAttackMove(x, y) {
    if (!this.alive) return null;
    this.cancelWindup();
    const dest = this.planPath(x, y);
    this.order = { type: 'amove', x: dest.x, y: dest.y };
    this.autoTarget = null;
    return dest;
  }

  commandStop() {
    this.cancelWindup();
    this.order = null;
    this.path = null;
    this.autoTarget = null;
    this.vx = 0; this.vy = 0;
  }

  // ------------------------------------------------------------ skills
  canRankUp(key) {
    if (this.skillPoints <= 0) return false;
    const r = this.ranks[key];
    if (r >= 3) return false;
    if (key === 'R') return this.level >= CONFIG.leveling.ultLevels[r];
    return true;
  }

  rankUp(key) {
    if (!this.canRankUp(key)) { Sfx.play('error'); return false; }
    this.ranks[key]++;
    this.skillPoints--;
    Sfx.play('click');
    this.scene.events.emit('skillRanked', key);
    return true;
  }

  beginSkill(key) {
    if (!this.aiming[key]) this.aiming[key] = { t: 0 };
  }

  releaseSkill(key, x, y) {
    if (!this.aiming[key]) return;
    delete this.aiming[key];
    this.tryCast(key, x, y);
  }

  tryCast(key, x, y, fromBuffer = false) {
    if (!this.alive) return false;
    const rank = this.ranks[key];
    const def = this.skillDefs[key];
    const ui = this.scene.events;
    if (rank <= 0) { if (!fromBuffer) { Sfx.play('error'); ui.emit('notice', def.name + ' not learned (Ctrl+' + key + ')'); } return false; }
    if (this.cooldowns[key] > 0) { if (!fromBuffer) { Sfx.play('error'); ui.emit('skillDenied', key); } return false; }
    if (this.mana < def.mana) { if (!fromBuffer) { Sfx.play('error'); ui.emit('notice', 'Not enough mana'); ui.emit('skillDenied', key); } return false; }
    if (this.stunned || this.kit.busy) {
      if (!fromBuffer) this.buffered = { key, x, y, t: CONFIG.heroCommon.skillBufferTime };
      return false;
    }
    this.cancelWindup();
    this.mana -= def.mana;
    const cd = (Array.isArray(def.cd) ? def.cd[rank - 1] : def.cd) * (1 - this.stats.cdr);
    this.cooldowns[key] = cd; this.cdMax[key] = cd;
    this.kit.cast(key, rank, x, y);
    if (key === 'W' && this.stats.windCloak > 0) this.windCloakT = 2;
    ui.emit('skillCast', key);
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    this.updateStatus(dt);
    if (!this.alive) return;

    const s = this.stats;
    this.hp = Math.min(this.maxHp, this.hp + s.hpRegen * dt);
    this.mana = Math.min(s.maxMana, this.mana + s.manaRegen * dt);
    for (const k in this.cooldowns) {
      if (this.cooldowns[k] > 0) {
        this.cooldowns[k] -= dt;
        if (this.cooldowns[k] <= 0) { this.cooldowns[k] = 0; this.scene.events.emit('skillReady', k); }
      }
    }
    if (this.windCloakT > 0) this.windCloakT -= dt;
    for (const k in this.aiming) this.aiming[k].t += dt;

    this.kit.update(dt);
    if (this.kit.busy) { this.syncGfx(); return; }
    this.integrateKnock(dt);

    if (this.buffered) {
      this.buffered.t -= dt;
      if (this.buffered.t <= 0) this.buffered = null;
      else if (!this.stunned) {
        const b = this.buffered;
        if (this.tryCast(b.key, b.x, b.y, true) || this.cooldowns[b.key] > 0) this.buffered = null;
      }
    }

    if (this.stunned) { this.vx = 0; this.vy = 0; this.syncGfx(); return; }

    this.atkCd -= dt;
    if (this.windupT > 0) {
      const t = this.windupTarget;
      if (!t || !t.alive) { this.cancelWindup(); }
      else {
        this.facing = Math.atan2(t.y - this.y, t.x - this.x);
        this.windupT -= dt;
        if (this.windupT <= 0) this.performAttack(t);
        this.syncGfx();
        return;
      }
    }

    const o = this.order;
    if (o && o.type === 'move') {
      if (this.followPath(dt)) this.order = null;
    } else if (o && o.type === 'attack') {
      if (!o.target.alive || o.target.invulnerable) this.order = null;
      else this.engage(o.target, dt);
    } else if (o && o.type === 'amove') {
      const t = this.acquire();
      if (t) this.engage(t, dt);
      else {
        if (this.needReplan) { this.planPath(o.x, o.y); this.needReplan = false; }
        if (this.followPath(dt)) this.order = null;
      }
    } else {
      const t = this.acquire();
      if (t) this.engage(t, dt);
      else { this.vx = 0; this.vy = 0; }
    }

    // movement trail when fast
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > this.def.speed * 1.15) {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 0.045; Feel.afterimage(this.x, this.y, 'circle', this.radius, this.color, 0, 0.3); }
    }
    this.syncGfx();
  }

  acquire() {
    const range = this.stats.acquireRange;
    const t = this.autoTarget;
    if (t && t.alive && t.edgeDist(this.x, this.y) <= range + 120) return t;
    this.autoTarget = Combat.nearestEnemy(this.x, this.y, range);
    return this.autoTarget;
  }

  engage(t, dt) {
    this.needReplan = true;
    const d = t.edgeDist(this.x, this.y) - this.radius;
    if (d <= this.def.range) {
      this.vx = 0; this.vy = 0;
      this.facing = Math.atan2(t.y - this.y, t.x - this.x);
      if (this.atkCd <= 0) {
        this.windupT = this.def.windup / this.stats.attackSpeed;
        this.windupTarget = t;
      }
    } else {
      this.navigateTo(t.x, t.y, this.moveSpeed, dt, this.def.accel, 0);
    }
  }

  // Follows this.path. Returns true on arrival.
  followPath(dt) {
    if (!this.path || this.pathIdx >= this.path.length) { this.path = null; this.vx = 0; this.vy = 0; return true; }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    const speed = this.moveSpeed;
    const step = speed * dt;
    if (d <= step || d < 1.5) {
      this.scene.pathing.moveUnit(this, dx, dy);
      if (d > 0.5) this.facing = Math.atan2(dy, dx);
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; this.vx = 0; this.vy = 0; return true; }
      return false;
    }
    const ox = this.x, oy = this.y;
    this.steer(dx / d, dy / d, speed, dt, this.def.accel);
    const moved = Math.hypot(this.x - ox, this.y - oy);
    if (moved < step * 0.25) {
      this.stuckT += dt;
      if (this.stuckT > 0.25) {
        const last = this.path[this.path.length - 1];
        this.planPath(last.x, last.y);
        if (this.stuckT > 1.2) { this.path = null; this.vx = 0; this.vy = 0; return true; }
      }
    } else this.stuckT = 0;
    return false;
  }

  performAttack(t) {
    this.windupT = 0; this.windupTarget = null;
    this.atkCd = 1 / (this.def.attackRate * this.stats.attackSpeed * this.atkSpeedMul);
    const hc = CONFIG.heroCommon;
    const crit = Math.random() < hc.critChance;
    const dmg = this.stats.damage * (crit ? hc.critMult : 1);
    const hit = (tgt) => {
      if (!tgt || !tgt.alive) return;
      Combat.dealDamage(tgt, dmg, { source: this, crit, isAttack: true, knock: this.def.melee ? { x: tgt.x - this.x, y: tgt.y - this.y, force: 60 } : null });
      if (crit) Feel.burst(tgt.x, tgt.y, 0xffd23f, 6);
      this.chainFrom(tgt, dmg);
    };
    if (this.def.melee) {
      hit(t);
      Feel.arc(this.x, this.y, this.radius + this.def.range + 14, this.facing, 1.6, 0xffffff, 140);
      Sfx.play('hit');
      if (crit) Feel.hitstop(CONFIG.feel.hitstop.small);
    } else {
      this.scene.spawnProjectile({
        x: this.x + Math.cos(this.facing) * 14, y: this.y + Math.sin(this.facing) * 14,
        target: t, speed: this.def.projSpeed, color: crit ? 0xffd23f : 0xd8b4fe, kind: 'bolt', radius: crit ? 6 : 5,
        onHit: (p, tgt) => hit(tgt),
      });
      Sfx.play('shoot');
    }
  }

  chainFrom(first, dmg) {
    const n = this.stats.chain;
    if (!n) return;
    const hitSet = new Set([first]);
    let from = first;
    for (let i = 0; i < n; i++) {
      const next = Combat.enemiesByDistance(from.x, from.y, 200, hitSet)[0];
      if (!next) break;
      hitSet.add(next);
      const g = this.scene.add.graphics().setDepth(33);
      g.lineStyle(3, 0x7ee8ff, 1);
      const mx = (from.x + next.x) / 2 + (Math.random() - 0.5) * 30, my = (from.y + next.y) / 2 + (Math.random() - 0.5) * 30;
      g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(mx, my); g.lineTo(next.x, next.y); g.strokePath();
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
      Combat.dealDamage(next, dmg * 0.6, { source: this, color: '#7ee8ff' });
      from = next;
    }
  }

  // ------------------------------------------------------------ life
  onDamaged(dmg, opts) {
    super.onDamaged(dmg, opts);
    if (dmg > this.maxHp * 0.08) Feel.shake(0.003, 80);
  }

  die() {
    if (this.stats.revive > 0) {
      const i = this.items.indexOf('phoenix');
      if (i >= 0) {
        this.items[i] = null;
        this.recalcStats();
        this.hp = Math.round(this.maxHp * 0.5);
        this.mana = this.stats.maxMana;
        Feel.ring(this.x, this.y, 140, 0xff7a2a, { duration: 600, width: 6, fill: true });
        Feel.burst(this.x, this.y, 0xff7a2a, 30);
        Feel.floatText(this.x, this.y - 30, 'REVIVED!', '#ff9a4a', 22);
        Sfx.play('levelup');
        this.scene.events.emit('inventoryChanged');
        return;
      }
    }
    this.alive = false;
    this.kit.cancel();
    this.order = null; this.path = null; this.cancelWindup(); this.buffered = null; this.aiming = {};
    this.respawnT = CONFIG.heroCommon.respawnBase + this.level;
    this.gfx.setVisible(false);
    Feel.burst(this.x, this.y, this.color, 30);
    Feel.shake(0.008, 250);
    Sfx.play('heroDeath');
    this.scene.events.emit('notice', 'Hero down! Respawning in ' + Math.ceil(this.respawnT) + 's');
  }

  respawn() {
    const k = this.scene.keep;
    this.x = k.rx + k.rw + 50; this.y = k.y;
    this.alive = true;
    this.hp = this.maxHp;
    this.mana = this.stats.maxMana;
    this.status.stunT = 0; this.status.slowT = 0;
    this.kvx = 0; this.kvy = 0;
    this.gfx.setVisible(true);
    this.syncGfx();
    Feel.ring(this.x, this.y, 80, 0xffffff, { duration: 400 });
    this.scene.events.emit('heroRespawn');
  }
}
