// Mage kit: Fire Bolt, Blink, Frost Nova, Meteor Storm.

class MageKit {
  constructor(hero) {
    this.hero = hero;
    this.scene = hero.scene;
    this.S = CONFIG.skills.mage;
    this.storms = [];
  }

  get busy() { return false; }
  cancel() { /* storms keep falling even if the mage dies */ }

  cast(key, rank, x, y) {
    const i = rank - 1;
    if (key === 'Q') this.fireBolt(i, x, y);
    else if (key === 'W') this.blink(i, x, y);
    else if (key === 'E') this.frostNova(i);
    else if (key === 'R') this.meteorStorm(i, x, y);
  }

  // ---------------------------------------------------------------- Q
  fireBolt(i, x, y) {
    const h = this.hero, s = this.S.Q;
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / d, y: dy / d };
    h.facing = Math.atan2(dy, dx);
    const dmg = h.skillDamage(s.damage[i]);
    const aoe = s.aoe[i];
    const explode = (px, py) => {
      for (const e of Combat.enemiesInRadius(px, py, aoe)) {
        Combat.dealDamage(e, dmg, { source: h, skill: true, color: '#ffb36b', knock: { x: e.x - px, y: e.y - py, force: 140 } });
      }
      Feel.ring(px, py, aoe, 0xff7a2a, { duration: 260, width: 4, fill: true });
      Feel.burst(px, py, 0xff7a2a, 12);
      Feel.burst(px, py, 0xffd23f, 6);
      Feel.shake(0.003, 70);
      Sfx.play('explode');
    };
    this.scene.spawnProjectile({
      x: h.x + dir.x * 16, y: h.y + dir.y * 16, dir, speed: s.speed, maxDist: s.range, hitTeam: 'enemy',
      pierce: s.pierce[i], color: 0xff7a2a, kind: 'bolt', radius: 7,
      onHit: (p, e, px, py) => explode(px, py),
      onExpire: (p, px, py) => explode(px, py),
    });
    Sfx.play('shoot');
    h.cancelWindup();
  }

  // ---------------------------------------------------------------- W
  blink(i, x, y) {
    const h = this.hero, s = this.S.W, p = this.scene.pathing;
    const sx = h.x, sy = h.y;
    let dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    const dist = Math.min(s.range[i], d);
    const ux = dx / d, uy = dy / d;
    // walk back from the farthest point until we find a free spot
    let dest = null;
    for (let t = dist; t >= 0; t -= 8) {
      const px = sx + ux * t, py = sy + uy * t;
      if (!p.circleBlocked(px, py, h.radius * 0.75)) { dest = { x: px, y: py }; break; }
    }
    if (!dest) dest = { x: sx, y: sy };
    // afterimages along the line
    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      Feel.afterimage(sx + (dest.x - sx) * t, sy + (dest.y - sy) * t, 'circle', h.radius, 0xc4b5fd, 0, 0.25 + t * 0.3);
    }
    h.x = dest.x; h.y = dest.y;
    h.vx = 0; h.vy = 0;
    h.facing = Math.atan2(uy, ux);
    h.order = null; h.path = null; h.autoTarget = null; h.cancelWindup();
    // frost burst at the start point
    const bd = h.skillDamage(s.burstDamage[i]);
    for (const e of Combat.enemiesInRadius(sx, sy, s.burstRadius)) {
      Combat.dealDamage(e, bd, { source: h, skill: true, color: '#9fe9ff' });
      if (e.alive) e.applySlow(s.burstSlow, s.burstSlowTime);
    }
    Feel.ring(sx, sy, s.burstRadius, 0x5ee0ff, { duration: 300, width: 4, fill: true });
    Feel.burst(sx, sy, 0x9fe9ff, 12);
    Feel.burst(dest.x, dest.y, 0xc4b5fd, 10);
    Feel.ring(dest.x, dest.y, 40, 0xffffff, { from: 10, duration: 200, width: 3 });
    Sfx.play('blink');
    h.syncGfx();
  }

  // ---------------------------------------------------------------- E
  frostNova(i) {
    const h = this.hero, s = this.S.E;
    const r = s.radius[i];
    const dmg = h.skillDamage(s.damage[i]);
    for (const e of Combat.enemiesInRadius(h.x, h.y, r)) {
      Combat.dealDamage(e, dmg, { source: h, skill: true, color: '#9fe9ff' });
      if (!e.alive) continue;
      e.applySlow(s.slow, s.slowTime);
      if (s.freeze[i] > 0) e.applyStun(s.freeze[i], true);
      Feel.burst(e.x, e.y, 0x9fe9ff, 4);
    }
    Feel.ring(h.x, h.y, r, 0x5ee0ff, { from: 10, duration: 380, width: 7, fill: true });
    Feel.ring(h.x, h.y, r * 0.7, 0xffffff, { from: 10, duration: 300, width: 3 });
    Feel.shake(0.005, 120);
    if (s.freeze[i] > 0) Feel.hitstop(CONFIG.feel.hitstop.small);
    Sfx.play('frost');
  }

  // ---------------------------------------------------------------- R
  meteorStorm(i, x, y) {
    const h = this.hero, s = this.S.R;
    let dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > s.range) { dx = dx / d * s.range; dy = dy / d * s.range; }
    const cx = h.x + dx, cy = h.y + dy;
    const n = s.meteors[i];
    const dmg = h.skillDamage(s.damage[i]);
    const area = this.scene.add.graphics().setDepth(7);
    area.lineStyle(2, 0xff5030, 0.5); area.strokeCircle(cx, cy, s.radius);
    this.scene.later(s.duration + s.warn + 0.2, () => area.destroy());
    for (let k = 0; k < n; k++) {
      const delay = (k / n) * s.duration;
      this.scene.later(delay, () => {
        // bias meteors toward enemies in the area
        const inArea = Combat.enemiesInRadius(cx, cy, s.radius);
        let mx, my;
        if (inArea.length && Math.random() < 0.6) {
          const e = inArea[Math.floor(Math.random() * inArea.length)];
          mx = e.x + (Math.random() - 0.5) * 30; my = e.y + (Math.random() - 0.5) * 30;
        } else {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * s.radius;
          mx = cx + Math.cos(a) * rr; my = cy + Math.sin(a) * rr;
        }
        this.meteor(mx, my, s.meteorRadius, dmg, s.warn);
      });
    }
    Sfx.play('cry');
  }

  meteor(x, y, r, dmg, warn) {
    const sc = this.scene, h = this.hero;
    const g = sc.add.graphics().setDepth(8);
    const st = { p: 0 };
    const draw = () => {
      g.clear();
      g.fillStyle(0xff3020, 0.1 + 0.2 * st.p); g.fillCircle(x, y, r);
      g.lineStyle(2, 0xff5030, 0.85); g.strokeCircle(x, y, r);
      g.fillStyle(0xff5030, 0.3); g.fillCircle(x, y, r * st.p);
      // falling rock
      const fy = y - 260 * (1 - st.p), fx = x + 120 * (1 - st.p);
      g.fillStyle(0xffb36b, 1); g.fillCircle(fx, fy, 9);
      g.fillStyle(0xff5030, 0.5); g.fillCircle(fx + 8, fy - 10, 6);
    };
    draw();
    sc.tweens.add({
      targets: st, p: 1, duration: warn * 1000, ease: 'Quad.easeIn', onUpdate: draw,
      onComplete: () => {
        g.destroy();
        for (const e of Combat.enemiesInRadius(x, y, r)) {
          Combat.dealDamage(e, dmg, { source: h, skill: true, color: '#ffb36b', knock: { x: e.x - x, y: e.y - y, force: 160 } });
        }
        Feel.ring(x, y, r, 0xff7a2a, { duration: 300, width: 6, fill: true });
        Feel.burst(x, y, 0xff5030, 14);
        Feel.burst(x, y, 0x5a3a2a, 8);
        Feel.shake(0.006, 100);
        Sfx.play('meteor');
      },
    });
  }

  update() { }

  drawIndicator(g, key, rank, mx, my) {
    const h = this.hero, i = Math.max(0, rank - 1);
    const ang = Math.atan2(my - h.y, mx - h.x);
    if (key === 'Q') {
      const s = this.S.Q;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const w = 16;
      const pts = [
        { x: h.x - sn * w / 2, y: h.y + c * w / 2 }, { x: h.x + c * s.range - sn * w / 2, y: h.y + sn * s.range + c * w / 2 },
        { x: h.x + c * s.range + sn * w / 2, y: h.y + sn * s.range - c * w / 2 }, { x: h.x + sn * w / 2, y: h.y - c * w / 2 },
      ];
      g.fillStyle(0xff7a2a, 0.15); g.fillPoints(pts, true);
      g.lineStyle(2, 0xff7a2a, 0.7); g.strokePoints(pts, true);
    } else if (key === 'W') {
      const s = this.S.W;
      g.lineStyle(1.5, 0xc4b5fd, 0.5); g.strokeCircle(h.x, h.y, s.range[i]);
      const d = Math.min(s.range[i], Math.hypot(mx - h.x, my - h.y));
      const tx = h.x + Math.cos(ang) * d, ty = h.y + Math.sin(ang) * d;
      g.lineStyle(2, 0xc4b5fd, 0.8); g.lineBetween(h.x, h.y, tx, ty);
      g.fillStyle(0xc4b5fd, 0.3); g.fillCircle(tx, ty, h.radius);
      g.lineStyle(1.5, 0x5ee0ff, 0.5); g.strokeCircle(h.x, h.y, s.burstRadius);
    } else if (key === 'E') {
      const r = this.S.E.radius[i];
      g.fillStyle(0x5ee0ff, 0.12); g.fillCircle(h.x, h.y, r);
      g.lineStyle(2, 0x5ee0ff, 0.8); g.strokeCircle(h.x, h.y, r);
    } else if (key === 'R') {
      const s = this.S.R;
      g.lineStyle(1.5, 0xffffff, 0.35); g.strokeCircle(h.x, h.y, s.range);
      let dx = mx - h.x, dy = my - h.y; const d = Math.hypot(dx, dy);
      if (d > s.range) { dx = dx / d * s.range; dy = dy / d * s.range; }
      g.fillStyle(0xff5030, 0.15); g.fillCircle(h.x + dx, h.y + dy, s.radius);
      g.lineStyle(2, 0xff5030, 0.85); g.strokeCircle(h.x + dx, h.y + dy, s.radius);
    }
  }
}
