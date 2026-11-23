// Warrior kit: Whirl (Q, passive proc), Rage (W, passive), Bloodthirst (E, passive), Dash (R).

class WarriorKit {
  constructor(hero) {
    this.hero = hero;
    this.scene = hero.scene;
    this.S = CONFIG.skills.warrior;
    this.dash = null;
    this.rageT = 0;
    this.rageFxT = 0;
  }

  get busy() { return !!this.dash; }
  get rage() { return this.rageT > 0 ? this.S.W : null; }

  cancel() {
    this.dash = null;
    if (this.rageT > 0) this.endRage();
  }

  toggleAuto() { }

  cast(key, x, y) {
    if (key === 'R') this.startDash(x, y);
    this.hero.order = null; this.hero.path = null;
  }

  // HUD label under each skill slot
  skillLabel(k) {
    const h = this.hero;
    if (k === 'E') return '+' + (h.kills * (this.S.E.perKill + (h.stats.killDamage || 0))).toFixed(1) + ' DMG';
    if (k === 'W' && this.rageT > 0) return 'RAGE ' + Math.ceil(this.rageT);
    if (k === 'R') return '';
    return 'PASSIVE';
  }

  // ---------------------------------------------------------------- E: Bloodthirst
  modifyStats(s) { s.damage += this.hero.kills * (this.S.E.perKill + (s.killDamage || 0)); }
  onKill() { this.hero.recalcStats(); }

  // ---------------------------------------------------------------- Q: Whirl
  onAttack() {
    const h = this.hero, s = this.S.Q;
    if (h.cooldowns.Q > 0 || Math.random() >= Math.min(1, s.chance + (h.stats.whirlChance || 0))) return;
    const cd = h.skillCooldown('Q');
    h.cooldowns.Q = cd; h.cdMax.Q = cd;
    this.whirl(false, 'Q');
    this.scene.events.emit('skillCast', 'Q');
  }

  whirlRadius() { return this.hero.skillRadius(this.S.Q.radius * (1 + (this.hero.stats.whirlRadius || 0))); }

  whirlHit(e, forceCrit, skill) {
    const h = this.hero;
    const crit = forceCrit || Math.random() < CONFIG.heroCommon.critChance;
    const dmg = h.stats.damage * (1 + h.stats.skillDamage) * (crit ? h.critMult() : 1);
    Combat.dealDamage(e, dmg, { source: h, crit, skill, knock: { x: e.x - h.x, y: e.y - h.y, force: this.S.Q.knock } });
    if (crit) Feel.burst(e.x, e.y, 0xffd23f, 5);
  }

  whirl(forceCrit, skill) {
    const h = this.hero, r = this.whirlRadius();
    const hits = Combat.enemiesInRadius(h.x, h.y, r);
    for (const e of hits) this.whirlHit(e, forceCrit, skill);
    Feel.ring(h.x, h.y, r, forceCrit ? 0xffd23f : 0x9cc8ff, { from: h.radius, duration: 220, width: 6 });
    Sfx.play('swoosh');
    if (hits.length) Feel.shake(0.003, 70);
  }

  // ---------------------------------------------------------------- R: Dash
  startDash(x, y) {
    const h = this.hero, s = this.S.R;
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy) || 1;
    this.dash = { dirx: dx / d, diry: dy / d, left: h.skillRadius(s.range * (1 + (h.stats.dashRange || 0))), hit: new Set(), trailT: 0, impact: false };
    h.facing = Math.atan2(dy, dx);
    Sfx.play('dash');
  }

  updateDash(dt) {
    const h = this.hero, D = this.dash, s = this.S.R;
    const step = Math.min(D.left, s.speed * dt);
    const ox = h.x, oy = h.y;
    const bumped = this.scene.pathing.moveUnit(h, D.dirx * step, D.diry * step);
    const moved = Math.hypot(h.x - ox, h.y - oy);
    D.left -= step;
    D.trailT -= dt;
    if (D.trailT <= 0) { D.trailT = 0.018; Feel.afterimage(h.x, h.y, 'circle', h.radius, 0x9cc8ff, 0, 0.55); }
    for (const e of Combat.enemiesInRadius(h.x, h.y, h.radius + s.width)) {
      if (D.hit.has(e)) continue;
      D.hit.add(e);
      this.whirlHit(e, true, 'R');
      if (!D.impact) { D.impact = true; Feel.hitstop(CONFIG.feel.hitstop.charge); Sfx.play('hit'); }
    }
    if (D.left <= 0.5 || (bumped && moved < step * 0.3)) {
      this.dash = null;
      h.vx = 0; h.vy = 0;
      this.whirl(true, 'R');
      Feel.hitstop(CONFIG.feel.hitstop.small);
    }
    h.syncGfx();
  }

  // ---------------------------------------------------------------- W: Rage
  // Hero.onDamaged → here, before Combat checks for death.
  onHurt() {
    const h = this.hero, s = this.S.W;
    if (this.rageT > 0) { h.hp = Math.max(1, h.hp); return; }
    if (h.cooldowns.W > 0 || h.hp >= h.maxHp * s.threshold) return;
    h.hp = Math.max(1, h.hp);
    this.rageT = h.skillDuration(s.duration + (h.stats.rageTime || 0));
    const cd = h.skillCooldown('W');
    h.cooldowns.W = cd; h.cdMax.W = cd;
    h.color = 0xd02020; h.redraw();
    Feel.ring(h.x, h.y, 120, 0xff3030, { duration: 450, width: 8, fill: true });
    Feel.floatText(h.x, h.y - 34, 'RAGE!', '#ff3030', 22, 900);
    Feel.shake(0.008, 200);
    Feel.hitstop(CONFIG.feel.hitstop.charge);
    Sfx.play('cry');
    this.scene.events.emit('skillCast', 'W');
  }

  endRage() {
    const h = this.hero;
    this.rageT = 0;
    h.color = h.def.color; h.redraw();
  }

  update(dt) {
    if (this.dash) this.updateDash(dt);
    if (this.rageT > 0) {
      this.rageT -= dt;
      this.rageFxT -= dt;
      if (this.rageFxT <= 0) { this.rageFxT = this.S.W.fxInterval; Feel.burst(this.hero.x, this.hero.y, 0xff3030, 2); }
      if (this.rageT <= 0) this.endRage();
    }
  }
}
