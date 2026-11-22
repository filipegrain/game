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

  cast(key, rank, x, y) {
    const h = this.hero, i = rank - 1;
    if (key === 'Q') this.cleave(i, x, y);
    else if (key === 'W') this.charge(i, x, y);
    else if (key === 'E') this.warCry(i);
    else if (key === 'R') this.earthshatter(i, x, y);
    h.order = null; h.path = null;
  }

  // ---------------------------------------------------------------- Q
  cleave(i, x, y) {
    const h = this.hero, s = this.S.Q;
    const ang = this.aimAngle(x, y);
    h.facing = ang;
    const r = s.radius[i], arc = s.arc[i] * Math.PI / 180;
    const dmg = h.skillDamage(s.damage[i] + h.stats.damage * 0.5);
    let hits = 0;
    for (const e of Combat.enemiesInRadius(h.x, h.y, r)) {
      const a = Math.atan2(e.y - h.y, e.x - h.x);
      if (Math.abs(Combat.angleDiff(ang, a)) > arc / 2 + 0.15) continue;
      Combat.dealDamage(e, dmg, { source: h, skill: true, knock: { x: e.x - h.x, y: e.y - h.y, force: s.knock } });
      if (e.alive && s.bleedDps[i] > 0) e.applyBleed(h.skillDamage(s.bleedDps[i]), s.bleedTime);
      Feel.burst(e.x, e.y, 0xffffff, 4);
      hits++;
    }
    Feel.arc(h.x, h.y, r, ang, arc, 0x9cc8ff, 240);
    Sfx.play('swoosh');
    if (hits) { Feel.hitstop(CONFIG.feel.hitstop.small); Feel.shake(0.004, 90); }
    h.syncGfx();
  }

  // ---------------------------------------------------------------- W
  charge(i, x, y) {
    const h = this.hero, s = this.S.W;
    const dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    const dist = Math.max(120, Math.min(s.range[i], d));
    this.dash = { dirx: dx / d, diry: dy / d, left: dist, hit: new Set(), dmg: h.skillDamage(s.damage[i] + h.stats.damage * 0.4), kills: 0, rank: i + 1, trailT: 0, impact: false };
    h.facing = Math.atan2(dy, dx);
    Sfx.play('dash');
  }

  // ---------------------------------------------------------------- E
  warCry(i) {
    const h = this.hero, s = this.S.E;
    const r = s.radius[i];
    let n = 0;
    for (const e of Combat.enemiesInRadius(h.x, h.y, r)) {
      e.status.tauntT = s.taunt[i]; e.status.tauntBy = h; e.target = h; e.retargetT = s.taunt[i];
      n++;
    }
    h.status.armorBonus = s.armor[i]; h.status.armorT = s.buffTime;
    for (const a of this.scene.allies) {
      if (!a.alive || Math.hypot(a.x - h.x, a.y - h.y) > r) continue;
      a.status.atkSpeedBonus = s.allyAtkSpeed[i]; a.status.atkSpeedT = s.allyBuffTime;
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
  earthshatter(i, x, y) {
    const h = this.hero, s = this.S.R;
    let dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > s.range) { dx = dx / d * s.range; dy = dy / d * s.range; }
    const dest = this.scene.pathing.nearestWalkable(h.x + dx, h.y + dy, h.radius);
    const g = this.scene.add.graphics().setDepth(8);
    this.leap = { sx: h.x, sy: h.y, ex: dest.x, ey: dest.y, t: 0, dur: s.leapTime, i, g, trailT: 0 };
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
      Combat.dealDamage(e, D.dmg, { source: h, skill: true, knock: { x: px + D.dirx * 0.8, y: py + D.diry * 0.8, force: 420 } });
      if (!e.alive) D.kills++;
      Feel.burst(e.x, e.y, 0xffffff, 6);
      if (!D.impact) { D.impact = true; Feel.hitstop(CONFIG.feel.hitstop.charge); Feel.shake(0.006, 110); Sfx.play('hit'); }
    }
    if (D.left <= 0.5 || (bumped && moved < step * 0.3)) {
      if (D.rank >= 3 && D.kills > 0) {
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
    const r = s.radius[L.i];
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
      const dmg = h.skillDamage(s.damage[L.i]);
      for (const en of Combat.enemiesInRadius(h.x, h.y, r)) {
        Combat.dealDamage(en, dmg, { source: h, skill: true, knock: { x: en.x - h.x, y: en.y - h.y, force: 300 } });
        if (en.alive) en.applyStun(s.stun[L.i]);
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

  drawIndicator(g, key, rank, mx, my) {
    const h = this.hero, i = Math.max(0, rank - 1);
    const ang = this.aimAngle(mx, my);
    const col = 0x9cc8ff;
    if (key === 'Q') {
      const s = this.S.Q, r = s.radius[i], arc = s.arc[i] * Math.PI / 180;
      g.fillStyle(col, 0.18); g.slice(h.x, h.y, r, ang - arc / 2, ang + arc / 2, false); g.fillPath();
      g.lineStyle(2, col, 0.8); g.slice(h.x, h.y, r, ang - arc / 2, ang + arc / 2, false); g.strokePath();
    } else if (key === 'W') {
      const s = this.S.W;
      const d = Math.max(120, Math.min(s.range[i], Math.hypot(mx - h.x, my - h.y)));
      this.drawLine(g, h.x, h.y, ang, d, s.width * 2 + h.radius, col);
    } else if (key === 'E') {
      const r = this.S.E.radius[i];
      g.fillStyle(0xffb347, 0.12); g.fillCircle(h.x, h.y, r);
      g.lineStyle(2, 0xffb347, 0.8); g.strokeCircle(h.x, h.y, r);
    } else if (key === 'R') {
      const s = this.S.R, r = s.radius[i];
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
