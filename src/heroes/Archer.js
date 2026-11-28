// Archer skills: Tumble, Volley, Piercing Shot, Arrow Rain, Explosive Trap, Hunter's Mark, Rapid Fire, Net Shot, Snipe.

class ArcherKit extends HeroKit {
  constructor(hero) {
    super(hero);
    this.critT = 0;      // Tumble: next attack crits while > 0
    this.rapidT = 0;     // Rapid Fire
    this.traps = [];
    this.marked = null;    // Hunter's Mark { e, t, def }
  }

  drawEmblem(g) { g.lineStyle(2, 0xfef3c7, 1); g.beginPath(); g.arc(-2, 0, 7, -1.2, 1.2); g.strokePath(); g.lineBetween(-2, 0, 7, 0); }

  get moveShoot() { return this.rapidT > 0; }

  forceCrit() {
    if (this.critT <= 0) return false;
    this.critT = 0;
    return true;
  }

  cancel() {
    super.cancel();
    this.rapidT = 0;
  }

  skillLabel(k) {
    const id = this.hero.skillIds[k];
    if (id === 'trap') return this.traps.length + ' / ' + this.S.trap.max;
    if (id === 'tumble' && this.critT > 0) return 'CRIT READY';
    if (id === 'rapid' && this.rapidT > 0) return 'RAPID ' + Math.ceil(this.rapidT);
    return '';
  }

  arrow(def, dir, speed, range, dmg, opts = {}) {
    const h = this.hero;
    return this.scene.spawnProjectile(Object.assign({
      x: h.x + dir.x * 14, y: h.y + dir.y * 14, dir, speed, maxDist: range, hitTeam: 'enemy',
      color: opts.color || 0xfacc15, kind: 'arrow', radius: def.width ? def.width / 2 : 5,
      onHit: (p, e) => this.hit(e, dmg, def),
    }, opts));
  }

  // ---------------------------------------------------------------- Tumble
  tumble(def, x, y) {
    const dir = this.dirTo(x, y);
    this.dash(dir, def.range, def.speed, { color: 0x86efac, onEnd: () => { this.critT = def.critWindow; } });
    Sfx.play('dash');
  }

  // ---------------------------------------------------------------- Volley
  volley(def, x, y) {
    const h = this.hero, d = this.dirTo(x, y), base = Math.atan2(d.y, d.x), dmg = this.dmg(def);
    for (let i = 0; i < def.arrows; i++) {
      const a = base + (i / (def.arrows - 1) - 0.5) * def.arc;
      this.arrow(def, { x: Math.cos(a), y: Math.sin(a) }, def.speed, def.range, dmg);
    }
    h.facing = base;
    Sfx.play('arrow'); Sfx.play('swoosh');
  }

  // ---------------------------------------------------------------- Piercing Shot
  pierce(def, x, y) {
    const dir = this.dirTo(x, y), dmg = this.dmg(def);
    this.arrow(def, dir, def.speed, def.range, dmg, {
      pierce: 9999, color: 0xffffff,
      onHit: (p, e) => { this.hit(e, dmg, def, { knock: { x: dir.x, y: dir.y, force: def.knock } }); Feel.burst(e.x, e.y, 0xffffff, 4); },
    });
    this.hero.facing = Math.atan2(dir.y, dir.x);
    Feel.shake(0.004, 80);
    Sfx.play('shoot');
  }

  // ---------------------------------------------------------------- Arrow Rain
  rain(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range), r = h.skillRadius(def.radius);
    const dmg = this.tickDmg(def);
    this.zone(c.x, c.y, r, h.skillDuration(def.duration), def.tick, (z) => {
      for (const e of Combat.enemiesInRadius(z.x, z.y, z.r)) {
        this.hit(e, dmg, def);
        if (e.alive) e.applySlow(def.slow, def.tick + 0.2);
      }
      Sfx.play('arrow');
    }, (g, z, fade) => {
      g.fillStyle(0xa3e635, 0.1 * fade); g.fillCircle(z.x, z.y, z.r);
      g.lineStyle(2, 0xa3e635, 0.5 * fade); g.strokeCircle(z.x, z.y, z.r);
      g.lineStyle(2, 0xfacc15, 0.9 * fade);
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * z.r;
        const ax = z.x + Math.cos(a) * rr, ay = z.y + Math.sin(a) * rr;
        g.lineBetween(ax - 4, ay - 14, ax, ay);
      }
    }, 7);
    Sfx.play('swoosh');
  }

  // ---------------------------------------------------------------- Explosive Trap
  trap(def, x, y) {
    const h = this.hero, c = this.clampToRange(x, y, def.range);
    const p = this.scene.pathing.nearestWalkable(c.x, c.y, 6);
    if (this.traps.length >= def.max) this.traps[0].dead = true;
    const trap = { x: p.x, y: p.y, arm: def.arm, life: def.life, dead: false, g: this.scene.add.graphics().setDepth(6) };
    trap.update = (dt) => {
      if (trap.dead) return this.dropTrap(trap);
      trap.arm -= dt; trap.life -= dt;
      if (trap.life <= 0) return this.dropTrap(trap);
      const g = trap.g, armed = trap.arm <= 0;
      g.clear();
      g.fillStyle(0x3f2a1a, 1); g.fillCircle(trap.x, trap.y, 10);
      g.lineStyle(2, 0xf97316, armed ? 0.6 + 0.4 * Math.sin(this.scene.stats.time * 8) : 0.3); g.strokeCircle(trap.x, trap.y, 10);
      g.fillStyle(armed ? 0xf97316 : 0x6b7280, 1); g.fillCircle(trap.x, trap.y, 3);
      if (!armed) return true;
      const trig = Combat.enemiesInRadius(trap.x, trap.y, def.trigger, true);
      if (!trig.length) return true;
      const r = h.skillRadius(def.radius), dmg = this.dmg(def), root = h.skillDuration(def.root);
      for (const e of Combat.enemiesInRadius(trap.x, trap.y, r)) {
        this.hit(e, dmg, def, { color: '#fdba74' });
        if (e.alive) e.applyStun(root);
      }
      Feel.ring(trap.x, trap.y, r, 0xf97316, { duration: 320, width: 7, fill: true });
      Feel.burst(trap.x, trap.y, 0xf97316, 18);
      Feel.shake(0.008, 140);
      Sfx.play('explode');
      return this.dropTrap(trap);
    };
    this.traps.push(trap);
    this.addEffect(trap);
    Sfx.play('build');
  }

  dropTrap(trap) {
    this.traps = this.traps.filter(t => t !== trap);
    return false;
  }

  // ---------------------------------------------------------------- Hunter's Mark
  mark(def, x, y) {
    const t = this.pickTarget(x, y, def.range);
    if (!t) return false;
    if (this.marked && this.marked.e.alive) this.marked.e.applyMark(0, 0);
    this.marked = { e: t, t: this.hero.skillDuration(def.duration), def };
    t.applyMark(def.vuln, this.marked.t);
    this.markRing(t);
    if (!this.markFx) {
      this.markFx = this.addEffect({ g: this.scene.add.graphics().setDepth(34), update: (dt) => this.updateMark(dt) });
    }
    Sfx.play('ready');
  }

  markRing(e) { Feel.ring(e.x, e.y, e.radius + 16, 0xef4444, { from: 60, duration: 300, width: 3 }); }

  updateMark(dt) {
    const m = this.marked, g = this.markFx.g;
    g.clear();
    if (!m) return this.endMark();
    m.t -= dt;
    if (m.t <= 0) { this.marked = null; return this.endMark(); }
    if (!m.e.alive) {
      const next = Combat.enemiesByDistance(m.e.x, m.e.y, m.def.jumpRange)[0];
      if (!next) { this.marked = null; return this.endMark(); }
      next.applyMark(m.def.vuln, m.t);
      this.markRing(next);
      m.e = next;
    }
    const e = m.e, y = e.y - e.radius - 22, s = 6 + Math.sin(this.scene.stats.time * 8);
    g.lineStyle(2, 0xef4444, 0.9); g.strokeCircle(e.x, e.y, e.radius + 6);
    g.fillStyle(0xef4444, 1); g.fillTriangle(e.x - s, y - s, e.x + s, y - s, e.x, y + 2);
    return true;
  }

  endMark() { this.markFx = null; return false; }

  // ---------------------------------------------------------------- Rapid Fire
  rapid(def) {
    const h = this.hero, t = h.skillDuration(def.duration);
    h.applyAtkSpeed(def.atkSpeed, t);
    this.rapidT = t;
    Feel.ring(h.x, h.y, 50, 0xfde047, { from: 10, duration: 300, width: 4 });
    Sfx.play('ready');
  }

  // ---------------------------------------------------------------- Net Shot
  net(def, x, y) {
    const h = this.hero, dir = this.dirTo(x, y), dmg = this.dmg(def), root = h.skillDuration(def.root);
    this.arrow(def, dir, def.speed, def.range, dmg, {
      color: 0xd6d3d1, kind: 'ball',
      onHit: (p, e, px, py) => {
        for (const n of Combat.enemiesInRadius(px, py, def.netRadius)) {
          this.hit(n, dmg, def);
          if (n.alive) n.applyStun(n === e ? root : root * def.splashRoot);
        }
        Feel.ring(px, py, def.netRadius, 0xd6d3d1, { from: 10, duration: 260, width: 3 });
        Sfx.play('hit');
      },
    });
    this.dash({ x: -dir.x, y: -dir.y }, def.recoil, def.recoilSpeed, { color: 0xd6d3d1 });
    h.facing = Math.atan2(dir.y, dir.x);
    Sfx.play('shoot');
  }

  // ---------------------------------------------------------------- Snipe
  snipe(def, x, y) {
    const h = this.hero, t = this.pickTarget(x, y, def.range);
    if (!t) return false;
    let left = def.channel;
    const g = this.scene.add.graphics().setDepth(34);
    this.channel = {
      g,
      update: (dt) => {
        g.clear();
        if (!t.alive || h.stunned) { g.destroy(); return true; }
        left -= dt;
        h.facing = Math.atan2(t.y - h.y, t.x - h.x);
        h.syncGfx();
        const k = 1 - left / def.channel;
        g.lineStyle(1 + 2 * k, 0xff3030, 0.3 + 0.6 * k); g.lineBetween(h.x, h.y, t.x, t.y);
        g.lineStyle(2, 0xff3030, 0.9); g.strokeCircle(t.x, t.y, t.radius + 22 * (1 - k) + 4);
        if (left > 0) return false;
        g.destroy();
        this.hit(t, this.dmg(def), def, { crit: true, knock: { x: t.x - h.x, y: t.y - h.y, force: def.knock } });
        const tr = this.scene.add.graphics().setDepth(34);
        tr.lineStyle(4, 0xffffff, 1); tr.lineBetween(h.x, h.y, t.x, t.y);
        let f = 0.25;
        this.addEffect({ g: tr, update: (d) => { f -= d; tr.setAlpha(Math.max(0, f / 0.25)); return f > 0; } });
        Feel.burst(t.x, t.y, 0xffffff, 14);
        Feel.shake(0.01, 160);
        Feel.hitstop(CONFIG.feel.hitstop.ult);
        Sfx.play('cannon');
        return true;
      },
    };
    h.vx = 0; h.vy = 0;
    Sfx.play('ready');
  }

  update(dt) {
    super.update(dt);
    if (this.critT > 0) this.critT -= dt;
    if (this.rapidT > 0) this.rapidT -= dt;
  }
}
