// Warrior kit: Cleave, Charge, War Cry, Earthshatter.

class WarriorKit {
  constructor(hero) {
    this.hero = hero;
    this.scene = hero.scene;
    this.S = CONFIG.skills.warrior;
    this.dash = null;
    this.leap = null;
  }

  get busy() { return !!(this.dash || this.leap); }

  cancel() {
    if (this.leap && this.leap.g) this.leap.g.destroy();
    this.dash = null; this.leap = null;
    this.hero.invulnerable = false;
    if (this.hero.gfx) this.hero.gfx.setScale(1);
  }

  aimAngle(x, y) { return Math.atan2(y - this.hero.y, x - this.hero.x); }

  toggleAuto() { }

  cast(key, x, y) {
    const h = this.hero;
    if (key === 'Q') this.cleave(x, y);
    else if (key === 'W') this.charge(x, y);
    else if (key === 'E') this.warCry();
    else if (key === 'R') this.earthshatter(x, y);
    h.order = null; h.path = null;
  }

  // ---------------------------------------------------------------- Q
  cleave(x, y) {
    const h = this.hero, s = this.S.Q;
    const ang = this.aimAngle(x, y);
    h.facing = ang;
    const r = h.skillRadius(s.radius), arc = s.arc * Math.PI / 180;
    const dmg = h.skillDamage(s.damage + h.stats.damage * 0.5);
    const bleed = h.hasMilestone('Q', 'bleed');
    let hits = 0;
    for (const e of Combat.enemiesInRadius(h.x, h.y, r)) {
      const a = Math.atan2(e.y - h.y, e.x - h.x);
      if (Math.abs(Combat.angleDiff(ang, a)) > arc / 2 + 0.15) continue;
      Combat.dealDamage(e, dmg, { source: h, skill: 'Q', knock: { x: e.x - h.x, y: e.y - h.y, force: s.knock } });
      if (e.alive && bleed) e.applyBleed(h.skillDamage(s.bleedDps), h.skillDuration(s.bleedTime));
      Feel.burst(e.x, e.y, 0xffffff, 4);
      hits++;
    }
    Feel.arc(h.x, h.y, r, ang, arc, 0x9cc8ff, 240);
    Sfx.play('swoosh');
    if (hits) { Feel.hitstop(CONFIG.feel.hitstop.small); Feel.shake(0.004, 90); }
    h.syncGfx();
  }

  // ---------------------------------------------------------------- W
  charge(x, y) {
    const h = this.hero, s = this.S.W;
    const dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    const dist = Math.max(120, Math.min(h.skillRadius(s.range), d));
    this.dash = { dirx: dx / d, diry: dy / d, left: dist, hit: new Set(), dmg: h.skillDamage(s.damage + h.stats.damage * 0.4), kills: 0, reset: h.hasMilestone('W', 'reset'), trailT: 0, impact: false };
    h.facing = Math.atan2(dy, dx);
    Sfx.play('dash');
  }

  // ---------------------------------------------------------------- E
  warCry() {
    const h = this.hero, s = this.S.E;
    const r = h.skillRadius(s.radius);
    const taunt = h.skillDuration(s.taunt);
    const lvMul = h.skillDamage(1) / (1 + h.stats.skillDamage);   // level growth only
    let n = 0;
    for (const e of Combat.enemiesInRadius(h.x, h.y, r)) {
      e.status.tauntT = taunt; e.status.tauntBy = h; e.target = h; e.retargetT = taunt;
      n++;
    }
    h.status.armorBonus = s.armor * lvMul; h.status.armorT = h.skillDuration(s.buffTime);
    for (const a of this.scene.allies) {
      if (!a.alive || Math.hypot(a.x - h.x, a.y - h.y) > r) continue;
      a.status.atkSpeedBonus = s.allyAtkSpeed * lvMul; a.status.atkSpeedT = h.skillDuration(s.allyBuffTime);
      Feel.burst(a.x, a.y, 0xffb347, 4);
    }
    Feel.ring(h.x, h.y, r, 0xffb347, { duration: 450, width: 6, fill: true });
    Feel.ring(h.x, h.y, r * 0.6, 0xffffff, { duration: 300, width: 3 });
    Feel.floatText(h.x, h.y - 34, 'WAR CRY!', '#ffb347', 18, 700);
    Feel.shake(0.005, 140);
    Sfx.play('cry');
    if (n) Feel.popScale(h.gfx, 1.3, 100);
  }

  // ---------------------------------------------------------------- R
  earthshatter(x, y) {
    const h = this.hero, s = this.S.R;
    let dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > s.range) { dx = dx / d * s.range; dy = dy / d * s.range; }
    const dest = this.scene.pathing.nearestWalkable(h.x + dx, h.y + dy, h.radius);
    const g = this.scene.add.graphics().setDepth(8);
    this.leap = { sx: h.x, sy: h.y, ex: dest.x, ey: dest.y, t: 0, dur: s.leapTime, r: h.skillRadius(s.radius), g, trailT: 0 };
    h.invulnerable = true;
    h.facing = Math.atan2(dest.y - h.y, dest.x - h.x);
    Sfx.play('swoosh');
  }

  update(dt) {
    const h = this.hero;
    if (this.dash) this.updateDash(dt);
    if (this.leap) this.updateLeap(dt);
  }

  updateDash(dt) {
    const h = this.hero, D = this.dash, s = this.S.W;
    const step = Math.min(D.left, s.speed * dt);
    const ox = h.x, oy = h.y;
    const bumped = this.scene.pathing.moveUnit(h, D.dirx * step, D.diry * step);
    const moved = Math.hypot(h.x - ox, h.y - oy);
    D.left -= step;
    D.trailT -= dt;
    if (D.trailT <= 0) { D.trailT = 0.018; Feel.afterimage(h.x, h.y, 'circle', h.radius, 0x9cc8ff, 0, 0.55); }
    // hit enemies along the way
    for (const e of Combat.enemiesInRadius(h.x, h.y, h.radius + s.width)) {
      if (D.hit.has(e)) continue;
      D.hit.add(e);
      // push sideways out of the path
      const side = (e.x - h.x) * -D.diry + (e.y - h.y) * D.dirx >= 0 ? 1 : -1;
      const px = -D.diry * side, py = D.dirx * side;
      Combat.dealDamage(e, D.dmg, { source: h, skill: 'W', knock: { x: px + D.dirx * 0.8, y: py + D.diry * 0.8, force: 420 } });
      if (!e.alive) D.kills++;
      Feel.burst(e.x, e.y, 0xffffff, 6);
      if (!D.impact) { D.impact = true; Feel.hitstop(CONFIG.feel.hitstop.charge); Feel.shake(0.006, 110); Sfx.play('hit'); }
    }
    if (D.left <= 0.5 || (bumped && moved < step * 0.3)) {
      if (D.reset && D.kills > 0) {
        h.cooldowns.W = 0;
        Feel.floatText(h.x, h.y - 30, 'RESET!', '#9cc8ff', 16, 600);
        this.scene.events.emit('skillReady', 'W');
      }
      this.dash = null;
      h.vx = 0; h.vy = 0;
    }
    h.syncGfx();
  }

  updateLeap(dt) {
    const h = this.hero, L = this.leap, s = this.S.R;
    L.t += dt;
    const p = Math.min(1, L.t / L.dur);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    h.x = L.sx + (L.ex - L.sx) * e;
    h.y = L.sy + (L.ey - L.sy) * e;
    const lift = Math.sin(p * Math.PI);
    h.gfx.setScale(1 + lift * 0.6);
    L.trailT -= dt;
    if (L.trailT <= 0) { L.trailT = 0.03; Feel.afterimage(h.x, h.y, 'circle', h.radius * (1 + lift * 0.5), 0xffb347, 0, 0.4); }
    // telegraph at landing spot
    const r = L.r;
    L.g.clear();
    L.g.fillStyle(0xffb347, 0.12 + 0.2 * p); L.g.fillCircle(L.ex, L.ey, r);
    L.g.lineStyle(3, 0xffb347, 0.9); L.g.strokeCircle(L.ex, L.ey, r);
    L.g.fillStyle(0xffb347, 0.25); L.g.fillCircle(L.ex, L.ey, r * p);
    h.syncGfx();
    if (p >= 1) {
      L.g.destroy();
      this.leap = null;
      h.invulnerable = false;
      h.gfx.setScale(1);
      const dmg = h.skillDamage(s.damage), stun = h.skillDuration(s.stun);
      const hit = new Set();
      for (const en of Combat.enemiesInRadius(h.x, h.y, r)) {
        hit.add(en);
        Combat.dealDamage(en, dmg, { source: h, skill: 'R', knock: { x: en.x - h.x, y: en.y - h.y, force: 300 } });
        if (en.alive) en.applyStun(stun);
      }
      if (h.hasMilestone('R', 'shockwave')) {
        const cx = h.x, cy = h.y, r2 = r * s.shockwaveRadiusMul;
        this.scene.later(s.shockwaveDelay, () => {
          for (const en of Combat.enemiesInRadius(cx, cy, r2)) {
            if (hit.has(en)) continue;
            Combat.dealDamage(en, dmg * s.shockwaveMul, { source: h, skill: 'R', knock: { x: en.x - cx, y: en.y - cy, force: 260 } });
          }
          Feel.ring(cx, cy, r2, 0xffb347, { from: r, duration: 350, width: 6 });
          Feel.shake(0.008, 160);
          Sfx.play('thump');
        });
      }
      Feel.ring(h.x, h.y, r, 0xffb347, { duration: 380, width: 8, fill: true });
      Feel.ring(h.x, h.y, r * 1.6, 0xffffff, { from: r * 0.5, duration: 600, width: 4 });
      Feel.burst(h.x, h.y, 0x8a6d3b, 30);
      Feel.burst(h.x, h.y, 0xffb347, 20);
      Feel.hitstop(CONFIG.feel.hitstop.ult);
      Feel.shake(0.016, 320);
      Sfx.play('thump');
    }
  }

  drawIndicator(g, key, mx, my) {
    const h = this.hero;
    const ang = this.aimAngle(mx, my);
    const col = 0x9cc8ff;
    if (key === 'Q') {
      const s = this.S.Q, r = h.skillRadius(s.radius), arc = s.arc * Math.PI / 180;
      g.fillStyle(col, 0.18); g.slice(h.x, h.y, r, ang - arc / 2, ang + arc / 2, false); g.fillPath();
      g.lineStyle(2, col, 0.8); g.slice(h.x, h.y, r, ang - arc / 2, ang + arc / 2, false); g.strokePath();
    } else if (key === 'W') {
      const s = this.S.W;
      const d = Math.max(120, Math.min(h.skillRadius(s.range), Math.hypot(mx - h.x, my - h.y)));
      this.drawLine(g, h.x, h.y, ang, d, s.width * 2 + h.radius, col);
    } else if (key === 'E') {
      const r = h.skillRadius(this.S.E.radius);
      g.fillStyle(0xffb347, 0.12); g.fillCircle(h.x, h.y, r);
      g.lineStyle(2, 0xffb347, 0.8); g.strokeCircle(h.x, h.y, r);
    } else if (key === 'R') {
      const s = this.S.R, r = h.skillRadius(s.radius);
      g.lineStyle(1.5, 0xffffff, 0.35); g.strokeCircle(h.x, h.y, s.range);
      let dx = mx - h.x, dy = my - h.y; const d = Math.hypot(dx, dy);
      if (d > s.range) { dx = dx / d * s.range; dy = dy / d * s.range; }
      g.fillStyle(0xffb347, 0.18); g.fillCircle(h.x + dx, h.y + dy, r);
      g.lineStyle(2, 0xffb347, 0.9); g.strokeCircle(h.x + dx, h.y + dy, r);
    }
  }

  drawLine(g, x, y, ang, len, width, col) {
    const c = Math.cos(ang), s = Math.sin(ang), px = -s * width / 2, py = c * width / 2;
    const pts = [
      { x: x + px, y: y + py }, { x: x + c * len + px, y: y + s * len + py },
      { x: x + c * len - px, y: y + s * len - py }, { x: x - px, y: y - py },
    ];
    g.fillStyle(col, 0.18); g.fillPoints(pts, true);
    g.lineStyle(2, col, 0.8); g.strokePoints(pts, true);
  }
}
