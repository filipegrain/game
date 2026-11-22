// Mage kit: Fire Bolt (autocast), Poison Pool, Deep Freeze, Meteor Storm.

class MageKit {
  constructor(hero) {
    this.hero = hero;
    this.scene = hero.scene;
    this.S = CONFIG.skills.mage;
    this.autoQ = true;
    this.pools = [];
  }

  get busy() { return false; }
  cancel() { /* pools and storms keep going even if the mage dies */ }

  toggleAuto(key) {
    if (key !== 'Q') return;
    this.autoQ = !this.autoQ;
    Sfx.play('click');
    this.scene.events.emit('notice', 'Fire Bolt autocast ' + (this.autoQ ? 'ON' : 'OFF') + ' (Q)');
  }

  // Called by Hero after each basic attack: fire Q at the enemy we're attacking.
  onAttack(t) {
    const h = this.hero;
    if (!this.autoQ || h.cooldowns.Q > 0 || !t || !t.alive) return;
    // lead the target a little
    const lead = Math.hypot(t.x - h.x, t.y - h.y) / this.S.Q.speed;
    h.tryCast('Q', t.x + (t.vx || 0) * lead, t.y + (t.vy || 0) * lead, true);
  }

  cast(key, x, y) {
    if (key === 'Q') this.fireBolt(x, y);
    else if (key === 'W') this.poisonPool(x, y);
    else if (key === 'E') this.deepFreeze(x, y);
    else if (key === 'R') this.meteorStorm(x, y);
  }

  clampToRange(x, y, range) {
    const h = this.hero;
    let dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > range) { dx = dx / d * range; dy = dy / d * range; }
    return { x: h.x + dx, y: h.y + dy };
  }

  // ---------------------------------------------------------------- Q
  fireBolt(x, y) {
    const h = this.hero, s = this.S.Q;
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / d, y: dy / d };
    h.facing = Math.atan2(dy, dx);
    const dmg = h.skillDamage(s.damage);
    const aoe = h.skillRadius(s.aoe);
    const pierce = h.hasMilestone('Q', 'pierce2') ? 2 : h.hasMilestone('Q', 'pierce1') ? 1 : 0;
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
      pierce, color: 0xff7a2a, kind: 'bolt', radius: 7,
      onHit: (p, e, px, py) => explode(px, py),
      onExpire: (p, px, py) => explode(px, py),
    });
    Sfx.play('shoot');
  }

  // ---------------------------------------------------------------- W
  poisonPool(x, y) {
    const h = this.hero, s = this.S.W;
    const c = this.clampToRange(x, y, s.range);
    const pool = {
      x: c.x, y: c.y, r: h.skillRadius(s.radius), left: h.skillDuration(s.duration), tickT: 0,
      dmg: h.skillDamage(s.dps) * s.tick, slow: h.hasMilestone('W', 'slow'),
      g: this.scene.add.graphics().setDepth(6), bubbleT: 0,
    };
    this.pools.push(pool);
    Feel.ring(pool.x, pool.y, pool.r, 0x7cd63c, { from: 10, duration: 260, width: 4 });
    Feel.burst(pool.x, pool.y, 0x7cd63c, 14);
    Sfx.play('frost');
  }

  updatePools(dt) {
    const s = this.S.W, h = this.hero;
    for (const p of this.pools) {
      p.left -= dt;
      p.tickT -= dt;
      if (p.tickT <= 0) {
        p.tickT += s.tick;
        for (const e of Combat.enemiesInRadius(p.x, p.y, p.r)) {
          Combat.dealDamage(e, p.dmg, { source: h, skill: true, color: '#9be86a' });
          if (e.alive && p.slow) e.applySlow(s.slow, s.tick + 0.15);
        }
      }
      p.bubbleT -= dt;
      if (p.bubbleT <= 0) {
        p.bubbleT = 0.12;
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * p.r * 0.9;
        Feel.burst(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 0x9be86a, 1);
      }
      const fade = Math.max(0, Math.min(1, p.left / 0.4));
      const g = p.g;
      g.clear();
      g.fillStyle(0x4f9a2a, 0.28 * fade); g.fillCircle(p.x, p.y, p.r);
      g.fillStyle(0x7cd63c, 0.18 * fade); g.fillCircle(p.x, p.y, p.r * (0.55 + 0.1 * Math.sin(this.scene.time.now / 200)));
      g.lineStyle(2, 0x9be86a, 0.7 * fade); g.strokeCircle(p.x, p.y, p.r);
      if (p.left <= 0) g.destroy();
    }
    if (this.pools.some(p => p.left <= 0)) this.pools = this.pools.filter(p => p.left > 0);
  }

  // ---------------------------------------------------------------- E
  deepFreeze(x, y) {
    const h = this.hero, s = this.S.E;
    const c = this.clampToRange(x, y, s.range);
    const r = h.skillRadius(s.radius);
    const dmg = h.skillDamage(s.damage), t = h.skillDuration(s.freeze);
    const shatter = h.hasMilestone('E', 'shatter');
    const frozen = [];
    for (const e of Combat.enemiesInRadius(c.x, c.y, r)) {
      Combat.dealDamage(e, dmg, { source: h, skill: true, color: '#9fe9ff' });
      if (!e.alive) continue;
      e.applyStun(t, true);
      frozen.push(e);
      Feel.burst(e.x, e.y, 0x9fe9ff, 4);
    }
    if (shatter && frozen.length) {
      const sd = h.skillDamage(s.shatterDamage);
      this.scene.later(t, () => {
        for (const e of frozen) {
          if (!e.alive) continue;
          Combat.dealDamage(e, sd, { source: h, skill: true, color: '#cff6ff' });
          Feel.burst(e.x, e.y, 0xcff6ff, 8);
        }
        Sfx.play('frost');
      });
    }
    Feel.ring(c.x, c.y, r, 0x5ee0ff, { from: 10, duration: 380, width: 7, fill: true });
    Feel.ring(c.x, c.y, r * 0.7, 0xffffff, { from: 10, duration: 300, width: 3 });
    Feel.shake(0.005, 120);
    if (frozen.length) Feel.hitstop(CONFIG.feel.hitstop.small);
    Sfx.play('frost');
  }

  // ---------------------------------------------------------------- R
  meteorStorm(x, y) {
    const h = this.hero, s = this.S.R;
    const c = this.clampToRange(x, y, s.range);
    const cx = c.x, cy = c.y;
    const n = Math.round(s.meteors * (h.hasMilestone('R', 'more') ? s.bonusMeteorMul : 1));
    const dmg = h.skillDamage(s.damage);
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

  update(dt) { this.updatePools(dt); }

  drawIndicator(g, key, mx, my) {
    const h = this.hero;
    const circleAt = (range, r, col) => {
      g.lineStyle(1.5, 0xffffff, 0.35); g.strokeCircle(h.x, h.y, range);
      const c = this.clampToRange(mx, my, range);
      g.fillStyle(col, 0.16); g.fillCircle(c.x, c.y, r);
      g.lineStyle(2, col, 0.85); g.strokeCircle(c.x, c.y, r);
    };
    if (key === 'W') circleAt(this.S.W.range, h.skillRadius(this.S.W.radius), 0x7cd63c);
    else if (key === 'E') circleAt(this.S.E.range, h.skillRadius(this.S.E.radius), 0x5ee0ff);
    else if (key === 'R') circleAt(this.S.R.range, this.S.R.radius, 0xff5030);
  }
}
