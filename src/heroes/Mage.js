// Mage skills: Blink, Deep Freeze, Meteor, Chain Lightning, Poison Pool, Gravity Well, Flame Wall, Arcane Orb, Polymorph.

class MageKit extends HeroKit {
  constructor(hero) {
    super(hero);
    this.orbShot = null;   // Arcane Orb projectile in flight
  }

  drawEmblem(g) { g.fillStyle(0xe9d5ff, 1); g.fillCircle(0, 0, 4.5); }

  // ---------------------------------------------------------------- Blink
  blink(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range);
    const dest = this.scene.pathing.nearestWalkable(c.x, c.y, h.radius);
    const ox = h.x, oy = h.y, r = h.skillRadius(def.radius), dmg = this.dmg(def);
    for (const e of Combat.enemiesInRadius(ox, oy, r)) {
      this.hit(e, dmg, def, { color: '#9fe9ff' });
      if (e.alive) e.applySlow(def.slow, h.skillDuration(def.slowTime));
    }
    Feel.ring(ox, oy, r, 0x9fe9ff, { from: 10, duration: 320, width: 6, fill: true });
    Feel.afterimage(ox, oy, 'circle', h.radius, 0xc77dff, 0, 0.7);
    h.x = dest.x; h.y = dest.y; h.vx = 0; h.vy = 0;
    h.facing = Math.atan2(dest.y - oy, dest.x - ox);
    h.syncGfx();
    Feel.ring(h.x, h.y, 30, 0xc77dff, { from: 4, duration: 220, width: 3 });
    Sfx.play('blink');
  }

  // ---------------------------------------------------------------- Deep Freeze
  freeze(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range);
    const r = h.skillRadius(def.radius), dmg = this.dmg(def), t = h.skillDuration(def.freeze);
    let any = false;
    for (const e of Combat.enemiesInRadius(c.x, c.y, r)) {
      this.hit(e, dmg, def, { color: '#9fe9ff' });
      if (!e.alive) continue;
      e.applyStun(t, true);
      any = true;
      Feel.burst(e.x, e.y, 0x9fe9ff, 4);
    }
    Feel.ring(c.x, c.y, r, 0x5ee0ff, { from: 10, duration: 380, width: 7, fill: true });
    Feel.ring(c.x, c.y, r * 0.7, 0xffffff, { from: 10, duration: 300, width: 3 });
    Feel.shake(0.005, 120);
    if (any) Feel.hitstop(CONFIG.feel.hitstop.small);
    Sfx.play('frost');
  }

  // ---------------------------------------------------------------- Meteor
  meteor(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range);
    const r = h.skillRadius(def.radius), dmg = this.dmg(def);
    let t = 0;
    this.addEffect({
      g: this.scene.add.graphics().setDepth(8),
      update(dt) {
        t += dt;
        const k = Math.min(1, t / def.warn), p = k * k, g = this.g;
        g.clear();
        g.fillStyle(0xff3020, 0.1 + 0.2 * p); g.fillCircle(c.x, c.y, r);
        g.lineStyle(2, 0xff5030, 0.85); g.strokeCircle(c.x, c.y, r);
        g.fillStyle(0xff5030, 0.3); g.fillCircle(c.x, c.y, r * p);
        const fy = c.y - 320 * (1 - p), fx = c.x + 150 * (1 - p);
        g.fillStyle(0xffb36b, 1); g.fillCircle(fx, fy, 16);
        g.fillStyle(0xff5030, 0.5); g.fillCircle(fx + 12, fy - 14, 10);
        return k < 1;
      },
    });
    this.scene.later(def.warn, () => {
      for (const e of Combat.enemiesInRadius(c.x, c.y, r)) this.hit(e, dmg, def, { color: '#ffb36b', knock: { x: e.x - c.x, y: e.y - c.y, force: def.knock } });
      Feel.ring(c.x, c.y, r, 0xff7a2a, { duration: 360, width: 8, fill: true });
      Feel.burst(c.x, c.y, 0xff5030, 24);
      Feel.burst(c.x, c.y, 0x5a3a2a, 12);
      Feel.shake(0.012, 220);
      Feel.hitstop(CONFIG.feel.hitstop.ult);
      Sfx.play('meteor');
      const burn = this.tickDmg(def, def.burnDps);
      this.zone(c.x, c.y, r * 0.8, h.skillDuration(def.burnTime), def.tick, (z) => {
        for (const e of Combat.enemiesInRadius(z.x, z.y, z.r)) this.hit(e, burn, def, { color: '#ff9a4a' });
      }, (g, z, fade) => {
        g.fillStyle(0x5a2a1a, 0.4 * fade); g.fillCircle(z.x, z.y, z.r);
        g.fillStyle(0xff7a2a, 0.15 * fade * (0.7 + 0.3 * Math.sin(this.scene.stats.time * 9))); g.fillCircle(z.x, z.y, z.r * 0.7);
      }, 5);
    });
    Sfx.play('cry');
  }

  // ---------------------------------------------------------------- Chain Lightning
  lightning(def, x, y) {
    const h = this.hero, first = this.pickTarget(x, y, def.range);
    if (!first) return false;
    const hitSet = new Set([first]);
    let from = h, to = first, dmg = this.dmg(def);
    for (let i = 0; i <= def.jumps && to; i++) {
      this.bolt(from, to);
      this.hit(to, dmg, def, { color: '#bff4ff' });
      Feel.burst(to.x, to.y, 0x7ee8ff, 5);
      dmg *= def.falloff;
      from = to;
      to = Combat.enemiesByDistance(from.x, from.y, def.jumpRange, hitSet)[0];
      if (to) hitSet.add(to);
    }
    Feel.shake(0.004, 90);
    Sfx.play('frost');
  }

  bolt(a, b) {
    const g = this.scene.add.graphics().setDepth(33);
    const draw = (w, col) => {
      g.lineStyle(w, col, 1);
      g.beginPath(); g.moveTo(a.x, a.y);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        g.lineTo(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 26, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 26);
      }
      g.lineTo(b.x, b.y); g.strokePath();
    };
    draw(5, 0x7ee8ff); draw(2, 0xffffff);
    let t = 0.22;
    this.addEffect({ g, update: (dt) => { t -= dt; g.setAlpha(Math.max(0, t / 0.22)); return t > 0; } });
  }

  // ---------------------------------------------------------------- Poison Pool
  pool(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range), r = h.skillRadius(def.radius);
    const dmg = this.tickDmg(def);
    this.zone(c.x, c.y, r, h.skillDuration(def.duration), def.tick, (z) => {
      for (const e of Combat.enemiesInRadius(z.x, z.y, z.r)) {
        this.hit(e, dmg, def, { color: '#9be86a' });
        if (e.alive) e.applySlow(def.slow, def.tick + 0.15);
      }
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * z.r * 0.9;
      Feel.burst(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 0x9be86a, 2);
    }, (g, z, fade) => {
      g.fillStyle(0x4f9a2a, 0.28 * fade); g.fillCircle(z.x, z.y, z.r);
      g.fillStyle(0x7cd63c, 0.18 * fade); g.fillCircle(z.x, z.y, z.r * (0.55 + 0.1 * Math.sin(this.scene.stats.time * 5)));
      g.lineStyle(2, 0x9be86a, 0.7 * fade); g.strokeCircle(z.x, z.y, z.r);
    });
    Feel.ring(c.x, c.y, r, 0x7cd63c, { from: 10, duration: 260, width: 4 });
    Sfx.play('frost');
  }

  // ---------------------------------------------------------------- Gravity Well
  gravity(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range), r = h.skillRadius(def.radius);
    const p = this.scene.pathing, dmg = this.dmg(def), ir = h.skillRadius(def.implodeRadius);
    let spin = 0;
    const z = this.zone(c.x, c.y, r, h.skillDuration(def.duration), 1 / 30, (z) => {
      for (const e of Combat.enemiesInRadius(z.x, z.y, z.r)) {
        const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy);
        if (d < 10) continue;
        const step = Math.min(d - 8, def.pull / 30 / (e.knockResist || 1));
        p.moveUnit(e, dx / d * step, dy / d * step);
        e.syncGfx();
      }
    }, (g, z, fade) => {
      spin += 0.12;
      g.fillStyle(0x1a0f2e, 0.35 * fade); g.fillCircle(z.x, z.y, z.r);
      g.lineStyle(2, 0x6b4dca, 0.6 * fade); g.strokeCircle(z.x, z.y, z.r);
      for (let i = 0; i < 3; i++) {
        const a = spin + i * Math.PI * 2 / 3, rr = z.r * (0.3 + 0.6 * ((spin * 0.3 + i / 3) % 1));
        g.fillStyle(0xc77dff, 0.7 * fade); g.fillCircle(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 3);
      }
      g.fillStyle(0x000000, 0.9 * fade); g.fillCircle(z.x, z.y, 14);
      g.lineStyle(3, 0xc77dff, fade); g.strokeCircle(z.x, z.y, 16);
    }, 7);
    const baseUpdate = z.update;
    z.update = (dt) => {
      if (baseUpdate(dt)) return true;
      for (const e of Combat.enemiesInRadius(z.x, z.y, ir)) this.hit(e, dmg, def, { color: '#d8b4fe' });
      Feel.ring(z.x, z.y, ir, 0xc77dff, { from: z.r, duration: 280, width: 7, fill: true });
      Feel.burst(z.x, z.y, 0xc77dff, 20);
      Feel.shake(0.01, 180);
      Feel.hitstop(CONFIG.feel.hitstop.charge);
      Sfx.play('explode');
      return false;
    };
    Sfx.play('blink');
  }

  // ---------------------------------------------------------------- Flame Wall
  flamewall(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range), w = this.wallEnds(c, def);
    const dmg = this.tickDmg(def);
    this.zone(c.x, c.y, 0, h.skillDuration(def.duration), def.tick, () => {
      for (const e of this.scene.enemies) {
        if (e.alive && segDist(e.x, e.y, w.ax, w.ay, w.bx, w.by) <= def.width / 2 + e.radius) this.hit(e, dmg, def, { color: '#ffb36b' });
      }
      const t = Math.random();
      Feel.burst(w.ax + (w.bx - w.ax) * t, w.ay + (w.by - w.ay) * t, 0xff7a2a, 2);
    }, (g, z, fade) => {
      const fl = 0.75 + 0.25 * Math.sin(this.scene.stats.time * 13);
      g.lineStyle(def.width + 8, 0xff3020, 0.25 * fade); g.lineBetween(w.ax, w.ay, w.bx, w.by);
      g.lineStyle(def.width * fl, 0xff7a2a, 0.6 * fade); g.lineBetween(w.ax, w.ay, w.bx, w.by);
      g.lineStyle(def.width * 0.3, 0xffd23f, 0.8 * fade); g.lineBetween(w.ax, w.ay, w.bx, w.by);
    });
    Sfx.play('explode');
  }

  // ---------------------------------------------------------------- Arcane Orb
  orb(def, x, y) {
    const h = this.hero, dir = this.dirTo(x, y), dmg = this.dmg(def);
    this.orbShot = this.scene.spawnProjectile({
      x: h.x + dir.x * 16, y: h.y + dir.y * 16, dir, speed: def.speed, maxDist: def.range, hitTeam: 'enemy',
      pierce: 9999, color: 0xd8b4fe, kind: 'bolt', radius: def.width / 2,
      onHit: (p, e) => { this.hit(e, dmg, def, { color: '#e9d5ff' }); Feel.burst(e.x, e.y, 0xd8b4fe, 3); },
      onExpire: (p, px, py) => this.burstOrb(def, px, py),
    });
    Sfx.play('blink');
  }

  burstOrb(def, x, y) {
    const h = this.hero, r = h.skillRadius(def.burstRadius), dmg = h.skillDamage(def.burstDamage);
    this.orbShot = null;
    for (const e of Combat.enemiesInRadius(x, y, r)) this.hit(e, dmg, def, { color: '#e9d5ff', knock: { x: e.x - x, y: e.y - y, force: def.burstKnock } });
    Feel.ring(x, y, r, 0xd8b4fe, { duration: 300, width: 6, fill: true });
    Feel.burst(x, y, 0xd8b4fe, 16);
    Feel.shake(0.006, 120);
    Sfx.play('explode');
  }

  recast(key) {
    if (this.hero.skillIds[key] !== 'orb' || !this.orbShot || !this.orbShot.alive) return false;
    const p = this.orbShot;
    p.destroy();
    this.burstOrb(this.S.orb, p.x, p.y);
    return true;
  }

  // ---------------------------------------------------------------- Polymorph
  polymorph(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range), r = h.skillRadius(def.radius);
    for (const e of Combat.enemiesInRadius(c.x, c.y, r)) {
      e.applyPoly(h.skillDuration(e.isBoss ? def.bossDuration : def.duration));
      Feel.burst(e.x, e.y, 0xff9ad5, 6);
    }
    Feel.ring(c.x, c.y, r, 0xff9ad5, { from: 10, duration: 340, width: 5, fill: true });
    Sfx.play('blink');
  }
}
