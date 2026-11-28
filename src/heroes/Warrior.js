// Warrior skills: Charge, Leap Slam, Whirlwind, War Cry, Chain Hook, Fissure, Riposte, Execute, War Banner.

class WarriorKit extends HeroKit {
  constructor(hero) {
    super(hero);
    this.spinT = 0; this.spinTick = 0; this.spinDef = null;
    this.guardT = 0; this.guardDef = null;
    this.block = null;   // Riposte { t, stored, def }
  }

  get moveMul() { return this.spinT > 0 ? this.spinDef.moveMul : 1; }

  drawEmblem(g) { g.fillStyle(0xffd23f, 1); g.fillRect(-4, -4, 8, 8); }

  cancel() {
    super.cancel();
    this.spinT = 0; this.guardT = 0; this.block = null;
  }

  skillLabel(k) {
    const id = this.hero.skillIds[k];
    if (id === 'whirlwind' && this.spinT > 0) return 'SPIN ' + Math.ceil(this.spinT);
    if (id === 'warcry' && this.guardT > 0) return 'GUARD ' + Math.ceil(this.guardT);
    if (id === 'riposte' && this.block) return 'BLOCK ' + Math.round(this.block.stored);
    return '';
  }

  onIncoming(amount) {
    if (this.block) {
      this.block.stored += amount;
      if (Math.random() < 0.4) Feel.floatText(this.hero.x, this.hero.y - 30, 'BLOCK', '#e8d9a0', 13, 500);
      return 0;
    }
    if (this.guardT > 0) return amount * (1 - this.guardDef.reduction);
    return amount;
  }

  // ---------------------------------------------------------------- Charge
  charge(def, x, y) {
    const h = this.hero, dir = this.dirTo(x, y), hitSet = new Set(), dmg = this.dmg(def);
    let first = true;
    this.dash(dir, Math.max(def.minDist, Math.min(def.range, dir.d)), def.speed, {
      color: 0x9cc8ff,
      onStep: () => {
        for (const e of Combat.enemiesInRadius(h.x, h.y, h.radius + def.width)) {
          if (hitSet.has(e)) continue;
          hitSet.add(e);
          const side = (e.x - h.x) * dir.y - (e.y - h.y) * dir.x > 0 ? 1 : -1;
          this.hit(e, dmg, def, { knock: { x: dir.y * side + dir.x * 0.3, y: -dir.x * side + dir.y * 0.3, force: def.knock } });
          if (first && e.alive) {
            first = false;
            e.applyStun(h.skillDuration(def.stun));
            Feel.hitstop(CONFIG.feel.hitstop.charge);
            Feel.shake(0.006, 120);
            Sfx.play('thump');
          }
        }
      },
    });
    Sfx.play('dash');
  }

  // ---------------------------------------------------------------- Leap Slam
  leap(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range);
    const land = this.scene.pathing.nearestWalkable(c.x, c.y, h.radius);
    const sx = h.x, sy = h.y, T = def.airTime;
    let t = 0;
    h.invulnerable = true;
    h.facing = Math.atan2(land.y - sy, land.x - sx);
    const shadow = this.scene.add.graphics().setDepth(5);
    this.motion = {
      update: (dt) => {
        t = Math.min(T, t + dt);
        const k = t / T;
        h.x = sx + (land.x - sx) * k; h.y = sy + (land.y - sy) * k;
        shadow.clear(); shadow.fillStyle(0x000000, 0.3); shadow.fillEllipse(h.x, h.y + 4, 30, 14);
        if (h.gfx) h.gfx.setScale(1 + 0.5 * Math.sin(Math.PI * k));
        h.syncGfx();
        if (k < 1) return false;
        shadow.destroy();
        if (h.gfx) h.gfx.setScale(1);
        h.invulnerable = false;
        const r = h.skillRadius(def.radius), dmg = this.dmg(def);
        for (const e of Combat.enemiesInRadius(h.x, h.y, r)) this.hit(e, dmg, def, { knock: { x: e.x - h.x, y: e.y - h.y, force: def.knock } });
        Feel.ring(h.x, h.y, r, 0xffb347, { from: 10, duration: 320, width: 8, fill: true });
        Feel.burst(h.x, h.y, 0x9a6b3f, 18);
        Feel.shake(0.01, 180);
        Feel.hitstop(CONFIG.feel.hitstop.charge);
        Sfx.play('thump');
        return true;
      },
    };
    Sfx.play('swoosh');
  }

  // ---------------------------------------------------------------- Whirlwind
  whirlwind(def) {
    this.spinDef = def;
    this.spinT = this.hero.skillDuration(def.duration);
    this.spinTick = 0;
    Sfx.play('swoosh');
  }

  updateSpin(dt) {
    const h = this.hero, def = this.spinDef;
    this.spinT -= dt;
    h.atkCd = Math.max(h.atkCd, 0.05);   // no basic attacks while spinning
    h.cancelWindup();
    this.spinTick -= dt;
    if (this.spinTick > 0) return;
    this.spinTick += def.tick;
    const r = h.skillRadius(def.radius), dmg = this.dmg(def);
    for (const e of Combat.enemiesInRadius(h.x, h.y, r)) this.hit(e, dmg, def, { knock: { x: e.x - h.x, y: e.y - h.y, force: def.knock } });
    Feel.arc(h.x, h.y, r, this.spinT * 14, Math.PI * 1.2, 0x7ee8ff, 160);
    Feel.ring(h.x, h.y, r, 0x7ee8ff, { from: h.radius, duration: 180, width: 3 });
    Sfx.play('swoosh');
  }

  // ---------------------------------------------------------------- War Cry
  warcry(def) {
    const h = this.hero, r = h.skillRadius(def.radius), t = h.skillDuration(def.duration);
    for (const e of Combat.enemiesInRadius(h.x, h.y, r, true)) { e.status.tauntT = t; e.status.tauntBy = h; e.target = h; }
    this.guardDef = def;
    this.guardT = t;
    Feel.ring(h.x, h.y, r, 0xff6040, { from: 10, duration: 450, width: 8, fill: true });
    Feel.floatText(h.x, h.y - 34, 'WAR CRY!', '#ff6040', 20, 900);
    Feel.shake(0.006, 160);
    Sfx.play('cry');
  }

  // ---------------------------------------------------------------- Chain Hook
  hook(def, x, y) {
    const h = this.hero, dir = this.dirTo(x, y), dmg = this.dmg(def);
    const chain = { g: this.scene.add.graphics().setDepth(29), proj: null, pulled: null, t: 0 };
    chain.proj = this.scene.spawnProjectile({
      x: h.x + dir.x * 16, y: h.y + dir.y * 16, dir, speed: def.speed, maxDist: def.range, hitTeam: 'enemy',
      color: 0xc0c6d0, kind: 'arrow', radius: def.width,
      onHit: (p, e) => {
        this.hit(e, dmg, def);
        if (!e.alive) return;
        if (e.isBoss) { e.applySlow(def.bossSlow, def.bossSlowTime); return; }
        e.applyStun(h.skillDuration(def.stun) + def.pullStun);   // + the pull itself
        chain.pulled = e;
        Feel.hitstop(CONFIG.feel.hitstop.small);
        Sfx.play('hit');
      },
    });
    chain.update = (dt) => {
      chain.g.clear();
      const end = chain.pulled || (chain.proj.alive ? chain.proj : null);
      if (!end || !end.alive || !h.alive) return false;
      chain.g.lineStyle(3, 0xc0c6d0, 0.9); chain.g.lineBetween(h.x, h.y, end.x, end.y);
      if (!chain.pulled) return true;
      const e = chain.pulled, dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy), stop = h.radius + e.radius + 4;
      chain.t += dt;
      if (d <= stop || chain.t > def.pullTime) return false;
      const step = Math.min(d - stop, def.pullSpeed * dt);
      this.scene.pathing.moveUnit(e, dx / d * step, dy / d * step);
      e.syncGfx();
      return true;
    };
    this.addEffect(chain);
    Sfx.play('swoosh');
  }

  // ---------------------------------------------------------------- Fissure
  fissure(def, x, y) {
    const h = this.hero, dir = this.dirTo(x, y), dmg = this.dmg(def), hitSet = new Set();
    const sx = h.x + dir.x * h.radius, sy = h.y + dir.y * h.radius;
    const g = this.scene.add.graphics().setDepth(5);
    let dist = 0, life = def.fade;
    const len = def.range, w = def.width;
    this.addEffect({
      g,
      update: (dt) => {
        if (dist < len) {
          const from = dist;
          dist = Math.min(len, dist + def.speed * dt);
          const px = sx + dir.x * dist, py = sy + dir.y * dist;
          for (const e of Combat.enemiesInRadius(px, py, w)) {
            if (hitSet.has(e)) continue;
            hitSet.add(e);
            this.hit(e, dmg, def, { knock: { x: -dir.y, y: dir.x, force: def.knock } });
            if (e.alive) e.applySlow(def.slow, h.skillDuration(def.slowTime));
          }
          if (Math.floor(from / 40) !== Math.floor(dist / 40)) { Feel.burst(px, py, 0x9a6b3f, 4); Feel.shake(0.002, 40); }
        } else life -= dt;
        g.clear();
        const a = Math.max(0, Math.min(1, life));
        g.lineStyle(w * 0.6, 0x5a3a2a, 0.45 * a); g.lineBetween(sx, sy, sx + dir.x * dist, sy + dir.y * dist);
        g.lineStyle(3, 0xffb347, 0.8 * a); g.lineBetween(sx, sy, sx + dir.x * dist, sy + dir.y * dist);
        return life > 0;
      },
    });
    Sfx.play('thump');
  }

  // ---------------------------------------------------------------- Riposte
  riposte(def) {
    this.block = { t: this.hero.skillDuration(def.duration), stored: 0, def };
    const h = this.hero;
    Feel.ring(h.x, h.y, 40, 0xe8d9a0, { from: 10, duration: 300, width: 5 });
    Sfx.play('frost');
  }

  releaseRiposte() {
    const h = this.hero, b = this.block, def = b.def;
    this.block = null;
    const t = Combat.nearestEnemy(h.x, h.y, def.range);
    if (t) h.facing = Math.atan2(t.y - h.y, t.x - h.x);
    const dmg = this.dmg(def) + b.stored * def.reflect;
    for (const e of Combat.enemiesInRadius(h.x, h.y, def.range)) {
      if (Math.abs(Combat.angleDiff(h.facing, Math.atan2(e.y - h.y, e.x - h.x))) > def.arc / 2) continue;
      this.hit(e, dmg, def, { crit: b.stored > 0, knock: { x: e.x - h.x, y: e.y - h.y, force: def.knock } });
    }
    Feel.arc(h.x, h.y, def.range, h.facing, def.arc, 0xe8d9a0, 260);
    Feel.shake(0.006 + Math.min(0.01, b.stored / 3000), 160);
    if (b.stored > 0) Feel.hitstop(CONFIG.feel.hitstop.charge);
    Sfx.play('hit');
  }

  // ---------------------------------------------------------------- Execute
  execute(def, x, y, key) {
    const h = this.hero, t = this.pickTarget(x, y, def.range);
    if (!t) return false;
    let travelled = 0;
    const strike = () => {
      if (!t.alive) return;
      const missing = 1 - t.hp / t.maxHp;
      this.hit(t, this.dmg(def) * (1 + def.missingMul * missing), def, { crit: true, knock: { x: t.x - h.x, y: t.y - h.y, force: def.knock } });
      Feel.arc(h.x, h.y, h.radius + 40, h.facing, 1.8, 0xff3030, 200);
      Feel.burst(t.x, t.y, 0xd02020, 12);
      Feel.hitstop(CONFIG.feel.hitstop.charge);
      Sfx.play('hit');
      if (!t.alive) {
        h.cooldowns[key] = 0;
        Feel.floatText(h.x, h.y - 34, 'EXECUTED', '#ff5050', 16, 700);
        this.scene.events.emit('skillReady', key);
      }
    };
    this.motion = {
      update: (dt) => {
        if (!t.alive) return true;
        const dx = t.x - h.x, dy = t.y - h.y, d = Math.hypot(dx, dy), gap = d - t.radius - h.radius - 6;
        h.facing = Math.atan2(dy, dx);
        if (gap <= 0) { strike(); return true; }
        const step = Math.min(gap, def.speed * dt);
        this.scene.pathing.moveUnit(h, dx / d * step, dy / d * step);
        travelled += step;
        Feel.afterimage(h.x, h.y, 'circle', h.radius, 0xd02020, 0, 0.4);
        h.syncGfx();
        if (travelled > def.range + def.overshoot) { strike(); return true; }
        return false;
      },
    };
    Sfx.play('dash');
  }

  // ---------------------------------------------------------------- War Banner
  banner(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range), r = h.skillRadius(def.radius);
    this.zone(c.x, c.y, r, h.skillDuration(def.duration), 0.25, (z) => {
      for (const e of Combat.enemiesInRadius(z.x, z.y, z.r)) e.applyVuln(def.vuln, 0.35);
      for (const u of Combat.playerUnitsInRadius(z.x, z.y, z.r)) u.applyAtkSpeed(def.atkSpeed, 0.35);
    }, (g, z, fade) => {
      g.fillStyle(0xffd23f, 0.07 * fade); g.fillCircle(z.x, z.y, z.r);
      g.lineStyle(2, 0xffd23f, 0.5 * fade); g.strokeCircle(z.x, z.y, z.r);
      g.lineStyle(3, 0x6b4f2a, fade); g.lineBetween(z.x, z.y, z.x, z.y - 46);
      const wave = Math.sin(this.scene.stats.time * 6) * 3;
      g.fillStyle(0xd02020, fade); g.fillTriangle(z.x, z.y - 46, z.x + 26, z.y - 38 + wave, z.x, z.y - 30);
    });
    Feel.ring(c.x, c.y, r, 0xffd23f, { from: 10, duration: 350, width: 5 });
    Sfx.play('build');
  }

  update(dt) {
    super.update(dt);
    if (this.spinT > 0 && this.hero.alive) this.updateSpin(dt);
    if (this.guardT > 0) this.guardT -= dt;
    if (this.block) { this.block.t -= dt; if (this.block.t <= 0 && this.hero.alive) this.releaseRiposte(); }
  }
}
