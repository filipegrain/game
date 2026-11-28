// The player-controlled hero: MOBA-style movement, auto-attacks, skills, items, levels.

const SKILL_KEYS = ['Q', 'W', 'E'];   // one per picked skill (CONFIG.heroCommon.skillPicks)
const HERO_KITS = { warrior: () => WarriorKit, mage: () => MageKit, archer: () => ArcherKit };   // kits load after Hero

class Hero extends Unit {
  // loadout: skill ids from CONFIG.skills[heroKey], bound to SKILL_KEYS in order
  constructor(scene, heroKey, loadout, x, y) {
    const d = CONFIG.heroes[heroKey];
    super(scene, x, y, { radius: d.radius, hp: d.hp, armor: d.armor, team: 'player', color: d.color, shape: 'circle', depth: 24 });
    this.isHero = true;
    this.heroKey = heroKey;
    this.def = d;
    this.rotates = true;
    this.level = 1;
    this.xp = 0;
    this.skillIds = {};      // key -> skill id
    this.skillDefs = {};     // key -> CONFIG.skills[heroKey][id]
    this.cooldowns = {};
    this.cdMax = {};
    SKILL_KEYS.forEach((k, i) => {
      this.skillIds[k] = loadout[i];
      this.skillDefs[k] = CONFIG.skills[heroKey][loadout[i]];
      this.cooldowns[k] = 0; this.cdMax[k] = 1;
    });
    this.itemLevels = {};    // key -> level (owned items)
    this.reviveCd = 0;       // Phoenix Feather cooldown
    this.kills = 0;          // hero kills
    this.order = null;
    this.path = null; this.pathIdx = 0;
    this.stuckT = 0;
    this.windupT = 0; this.windupTarget = null;
    this.atkCd = 0;
    this.autoTarget = null;
    this.needReplan = false;
    this.buffered = null;
    this.aiming = null;      // skill key waiting for a left-click
    this.respawnT = 0;
    this.windCloakT = 0;
    this.trailT = 0;
    this.invulnerable = false;
    this.recalcStats();
    this.hp = this.maxHp;
    this.kit = new (HERO_KITS[heroKey]())(this);
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
    if (this.kit) this.kit.drawEmblem(g);   // the first redraw (from Unit) comes before the kit exists
  }

  // ------------------------------------------------------------ stats
  recalcStats() {
    const d = this.def, pl = d.perLevel, lv = this.level - 1;
    const s = {
      maxHp: d.hp + pl.hp * lv, damage: d.damage + pl.damage * lv, armor: d.armor,
      speed: d.speed * (1 + Math.min(CONFIG.heroCommon.speedGrowthCap, pl.speed * lv)),
      attackSpeed: 1 + pl.attackSpeed * lv, hpRegen: d.hpRegen + pl.hpRegen * lv,
      cdr: 0, lifesteal: 0, chain: 0, thorns: 0, skillDamage: 0,
      windCloak: 0, revive: 0, acquireRange: d.acquireRange,
    };
    for (const key in this.itemLevels) {
      const st = CONFIG.items[key].stats, n = this.itemLevels[key];
      for (const k in st) {
        if (k === 'hp') s.maxHp += st[k] * n;
        else if (k === 'attackSpeed') s.attackSpeed += st[k] * n;
        else s[k] = (s[k] || 0) + st[k] * n;
      }
    }
    for (const k in CONFIG.itemCaps) s[k] = Math.min(CONFIG.itemCaps[k], s[k]);
    const oldMax = this.maxHp;
    this.stats = s;
    this.maxHp = Math.round(s.maxHp);
    this.armor = s.armor;
    if (this.maxHp > oldMax) this.hp += this.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  get moveSpeed() {
    let sp = this.stats.speed * this.speedMul * this.kit.moveMul;
    if (this.windCloakT > 0) sp *= 1 + this.stats.windCloak;
    return sp;
  }

  // ------------------------------------------------------------ skill scaling by level
  skillDamage(base) {
    return base * (1 + CONFIG.heroCommon.skillScaling.damage * (this.level - 1)) * (1 + this.stats.skillDamage);
  }
  skillRadius(base) { return base * (1 + CONFIG.heroCommon.skillScaling.radius * (this.level - 1)); }
  skillDuration(base) { return base * (1 + CONFIG.heroCommon.skillScaling.duration * (this.level - 1)); }
  levelCdr() { const sc = CONFIG.heroCommon.skillScaling; return Math.min(sc.cdrCap, sc.cdr * (this.level - 1)); }
  skillCooldown(key) {
    const cdr = 1 - (1 - this.levelCdr()) * (1 - this.stats.cdr);
    return this.skillDefs[key].cd * (1 - Math.min(CONFIG.heroCommon.totalCdrCap, cdr));
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
  // Key press: 'aim' skills wait for a left-click, 'instant' fire now. A skill still out may be recast (Arcane Orb).
  pressSkill(key, x, y) {
    if (!this.alive) return;
    const def = this.skillDefs[key];
    if (this.kit.recast(key)) return;
    if (this.aiming === key) { this.aiming = null; return; }
    if (this.cooldowns[key] > 0) { Sfx.play('error'); this.scene.events.emit('skillDenied', key); return; }
    if (def.cast === 'instant') { this.aiming = null; this.tryCast(key, x, y); return; }
    this.aiming = key;
  }

  confirmAim(x, y) {
    const key = this.aiming;
    if (!key) return false;
    this.aiming = null;
    this.tryCast(key, x, y);
    return true;
  }

  tryCast(key, x, y, fromBuffer = false) {
    if (!this.alive) return false;
    const def = this.skillDefs[key];
    const ui = this.scene.events;
    if (this.cooldowns[key] > 0) { if (!fromBuffer) { Sfx.play('error'); ui.emit('skillDenied', key); } return false; }
    if (this.stunned || this.kit.busy) {
      if (!fromBuffer) this.buffered = { key, x, y, t: CONFIG.heroCommon.skillBufferTime };
      return false;
    }
    this.cancelWindup();
    if (this.kit.cast(key, x, y) === false) {   // e.g. no target near the cursor: no cooldown
      if (!fromBuffer) { Sfx.play('error'); ui.emit('skillDenied', key); }
      return false;
    }
    const cd = this.skillCooldown(key);
    this.cooldowns[key] = cd; this.cdMax[key] = cd;
    if (def.move && this.stats.windCloak > 0) this.windCloakT = CONFIG.windCloakTime;
    ui.emit('skillCast', key);
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    if (this.reviveCd > 0) this.reviveCd -= dt;
    if (!this.alive) {
      this.respawnT -= dt;
      this.kit.update(dt);   // lingering effects (zones, traps) keep ticking
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    this.updateStatus(dt);
    if (!this.alive) return;

    const s = this.stats;
    this.hp = Math.min(this.maxHp, this.hp + s.hpRegen * dt);
    for (const k in this.cooldowns) {
      if (this.cooldowns[k] > 0) {
        this.cooldowns[k] -= dt;
        if (this.cooldowns[k] <= 0) { this.cooldowns[k] = 0; this.scene.events.emit('skillReady', k); }
      }
    }
    if (this.windCloakT > 0) this.windCloakT -= dt;

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
      if (this.kit.moveShoot && this.atkCd <= 0) {   // Rapid Fire: shoot on the move
        const t = Combat.nearestEnemy(this.x, this.y, this.def.range + this.radius);
        if (t) {
          const f = this.facing;
          this.facing = Math.atan2(t.y - this.y, t.x - this.x);
          this.performAttack(t);
          this.facing = f;
        }
      }
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
    this.autoTarget = Combat.nearestEnemy(this.x, this.y, range, e => !e.neutral || e.provoked);
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
    const hc = CONFIG.heroCommon, d = this.def;
    const crit = this.kit.forceCrit() || Math.random() < hc.critChance;
    const dmg = this.stats.damage * (crit ? hc.critMult : 1);
    const struck = (e) => e.alive && (t.neutral || !e.neutral);   // splash and cleave spare camps unless the target is one
    const hit = (tgt, knock) => {
      Combat.dealDamage(tgt, dmg, { source: this, crit, isAttack: true, knock });
      if (crit) Feel.burst(tgt.x, tgt.y, 0xffd23f, 6);
    };
    const shoot = (o) => this.scene.spawnProjectile(Object.assign({
      x: this.x + Math.cos(this.facing) * 14, y: this.y + Math.sin(this.facing) * 14, target: t, speed: d.projSpeed,
    }, o));
    if (d.attack === 'cleave') {
      // every enemy in the half circle toward the target
      const reach = this.radius + d.cleaveReach;
      for (const e of Combat.enemiesInRadius(this.x, this.y, reach)) {
        if (e !== t && (!struck(e) || Math.abs(Combat.angleDiff(this.facing, Math.atan2(e.y - this.y, e.x - this.x))) > Math.PI / 2)) continue;
        hit(e, { x: e.x - this.x, y: e.y - this.y, force: d.cleaveKnock });
      }
      if (t.alive) this.chainFrom(t, dmg);
      Feel.arc(this.x, this.y, reach + 8, this.facing, Math.PI, crit ? 0xffd23f : 0xffffff, 150);
      Sfx.play('hit');
      if (crit) Feel.hitstop(CONFIG.feel.hitstop.small);
    } else if (d.attack === 'splash') {
      shoot({
        color: crit ? 0xffd23f : 0xff7a2a, kind: 'bolt', radius: crit ? 7 : 6,
        onHit: (p, tgt, px, py) => {
          for (const e of Combat.enemiesInRadius(px, py, d.splashRadius)) if (e === tgt || struck(e)) hit(e);
          if (tgt && tgt.alive) this.chainFrom(tgt, dmg);
          Feel.ring(px, py, d.splashRadius, 0xff7a2a, { from: 6, duration: 200, width: 3, fill: true });
          Feel.burst(px, py, 0xff7a2a, 5);
          Sfx.play('explode');
        },
      });
      Sfx.play('shoot');
    } else {
      shoot({
        color: crit ? 0xffd23f : 0xfef3c7, kind: 'arrow',
        onHit: (p, tgt) => { if (tgt) { hit(tgt); this.chainFrom(tgt, dmg); } },
      });
      Sfx.play('arrow');
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
    if (this.stats.revive > 0 && this.reviveCd <= 0) {
      this.reviveCd = CONFIG.phoenixCooldown / this.stats.revive;
      this.hp = Math.round(this.maxHp * 0.5);
      Feel.ring(this.x, this.y, 140, 0xff7a2a, { duration: 600, width: 6, fill: true });
      Feel.burst(this.x, this.y, 0xff7a2a, 30);
      Feel.floatText(this.x, this.y - 30, 'REVIVED!', '#ff9a4a', 22);
      Sfx.play('levelup');
      this.scene.events.emit('heroRevived');
      return;
    }
    this.alive = false;
    this.kit.cancel();
    this.order = null; this.path = null; this.cancelWindup(); this.buffered = null; this.aiming = null;
    this.respawnT = CONFIG.heroCommon.respawnBase + this.level;
    this.gfx.setVisible(false);
    Feel.burst(this.x, this.y, this.color, 30);
    Feel.shake(0.008, 250);
    Sfx.play('heroDeath');
    this.scene.events.emit('heroDied');
    this.scene.events.emit('notice', 'Hero down! Respawning in ' + Math.ceil(this.respawnT) + 's');
  }

  respawn() {
    const k = this.scene.keep;
    this.x = k.front.x; this.y = k.front.y;
    this.alive = true;
    this.hp = this.maxHp;
    this.status.stunT = 0; this.status.slowT = 0;
    this.kvx = 0; this.kvy = 0;
    this.gfx.setVisible(true);
    this.syncGfx();
    Feel.ring(this.x, this.y, 80, 0xffffff, { duration: 400 });
    this.scene.events.emit('heroRespawn');
  }
}
