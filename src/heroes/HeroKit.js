// Shared base for the hero kits. A kit implements each of its skills as a method named after the skill id
// (CONFIG.skills[hero][id]); Hero calls kit.cast(key, x, y), which dispatches to the id bound to that key.
// A cast that returns false (e.g. no target near the cursor) costs no cooldown.
//
// Building blocks:
//   motion  - one hero movement at a time ({ update(dt) → true when done }); blocks other actions (busy)
//   channel - a timed cast in progress (Snipe; { update(dt) → true when done, g? }); also busy
//   effects - lingering things in the world ({ update(dt) → false when done, g? }): zones, traps, shockwaves

class HeroKit {
  constructor(hero) {
    this.hero = hero;
    this.scene = hero.scene;
    this.S = CONFIG.skills[hero.heroKey];
    this.motion = null;
    this.channel = null;
    this.effects = [];
  }

  get busy() { return !!this.motion || !!this.channel; }
  get moveMul() { return 1; }          // hero move speed multiplier (Whirlwind)
  get moveShoot() { return false; }    // hero may attack while walking (Rapid Fire)
  forceCrit() { return false; }        // next basic attack is a guaranteed crit (Tumble)
  onIncoming(amount) { return amount; }   // damage about to hit the hero (War Cry, Riposte); 0 = blocked
  recast() { return false; }           // pressing a key whose skill is still out (Arcane Orb)
  skillLabel() { return ''; }
  drawEmblem(g) {}                     // mark drawn on the hero's body

  cancel() {
    this.motion = null;
    if (this.channel && this.channel.g) this.channel.g.destroy();
    this.channel = null;
    this.hero.invulnerable = false;
  }

  cast(key, x, y) {
    const h = this.hero, id = h.skillIds[key];
    const ok = this[id](this.S[id], x, y, key);
    if (ok !== false) { h.order = null; h.path = null; }
    return ok;
  }

  // ---------------------------------------------------------------- helpers
  // skill damage: level-scaled base plus a share of the hero's attack damage
  dmg(def) {
    const h = this.hero;
    return h.skillDamage(def.damage || 0) + (def.adMul || 0) * h.stats.damage * (1 + h.stats.skillDamage);
  }

  // damage per tick of a zone skill (def.dps every def.tick s)
  tickDmg(def, dps = def.dps) { return this.hero.skillDamage(dps) * def.tick; }

  hit(e, amount, def, opts = {}) {
    return Combat.dealDamage(e, amount, Object.assign({ source: this.hero, skill: def.id }, opts));
  }

  clampToRange(x, y, range) {
    const h = this.hero;
    let dx = x - h.x, dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > range) { dx = dx / d * range; dy = dy / d * range; }
    return { x: h.x + dx, y: h.y + dy };
  }

  dirTo(x, y) {
    const h = this.hero, dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy);
    return d < 1 ? { x: Math.cos(h.facing), y: Math.sin(h.facing), d: 0 } : { x: dx / d, y: dy / d, d };
  }

  // Enemy nearest the cursor (within 90 px of it) whose edge is within `range` of the hero.
  pickTarget(x, y, range) {
    const h = this.hero;
    let best = null, bestD = 90;
    for (const e of this.scene.enemies) {
      if (!e.alive || e.invulnerable || e.edgeDist(h.x, h.y) > range) continue;
      const d = e.edgeDist(x, y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // Dash in a straight line; terrain and buildings stop it. onStep runs each frame, onEnd once.
  dash(dir, dist, speed, opts = {}) {
    const h = this.hero, pathing = this.scene.pathing;
    let left = dist, trailT = 0;
    h.facing = Math.atan2(dir.y, dir.x);
    this.motion = {
      update: (dt) => {
        const step = Math.min(left, speed * dt);
        const ox = h.x, oy = h.y;
        const bumped = pathing.moveUnit(h, dir.x * step, dir.y * step);
        left -= step;
        trailT -= dt;
        if (trailT <= 0) { trailT = 0.02; Feel.afterimage(h.x, h.y, 'circle', h.radius, opts.color || h.color, 0, 0.5); }
        const stop = opts.onStep ? opts.onStep() : false;
        if (stop || left <= 0.5 || (bumped && Math.hypot(h.x - ox, h.y - oy) < step * 0.3)) {
          h.vx = 0; h.vy = 0;
          if (opts.onEnd) opts.onEnd();
          return true;
        }
        return false;
      },
    };
  }

  addEffect(e) { this.effects.push(e); return e; }

  // Circular area that ticks every `tick` s for `duration` s. onTick(zone) does the work; draw(g, zone, fade) the visuals.
  zone(x, y, r, duration, tick, onTick, draw, depth = 6) {
    const z = { x, y, r, left: duration, tickT: 0, g: this.scene.add.graphics().setDepth(depth) };
    z.update = (dt) => {
      z.left -= dt;
      z.tickT -= dt;
      if (z.tickT <= 0) { z.tickT += tick; onTick(z); }
      z.g.clear();
      draw(z.g, z, Math.max(0, Math.min(1, z.left / 0.4)));
      return z.left > 0;
    };
    return this.addEffect(z);
  }

  update(dt) {
    if (this.motion && this.motion.update(dt)) this.motion = null;
    if (this.channel && this.channel.update(dt)) this.channel = null;
    if (this.effects.length) {
      this.effects = this.effects.filter(e => {
        if (e.update(dt)) return true;
        if (e.g) e.g.destroy();
        return false;
      });
    }
  }

  // ---------------------------------------------------------------- aim indicator (from def.aim)
  drawIndicator(g, key, mx, my) {
    const h = this.hero, def = h.skillDefs[key], col = def.icon[1];
    if (def.aim === 'dash' || def.aim === 'circle' || def.aim === 'wall' || def.aim === 'target') {
      g.lineStyle(1.5, 0xffffff, 0.3); g.strokeCircle(h.x, h.y, def.range);
    }
    const c = this.clampToRange(mx, my, def.range), dir = this.dirTo(mx, my);
    if (def.aim === 'circle') {
      const r = h.skillRadius(def.radius);
      g.fillStyle(col, 0.16); g.fillCircle(c.x, c.y, r);
      g.lineStyle(2, col, 0.85); g.strokeCircle(c.x, c.y, r);
    } else if (def.aim === 'dash') {
      g.lineStyle(3, col, 0.7); g.lineBetween(h.x, h.y, c.x, c.y);
      g.strokeCircle(c.x, c.y, h.radius);
    } else if (def.aim === 'line') {
      const ex = h.x + dir.x * def.range, ey = h.y + dir.y * def.range;
      g.lineStyle(Math.max(4, def.width * 2), col, 0.18); g.lineBetween(h.x, h.y, ex, ey);
      g.lineStyle(1.5, col, 0.8); g.lineBetween(h.x, h.y, ex, ey);
    } else if (def.aim === 'cone') {
      const a = Math.atan2(dir.y, dir.x);
      g.fillStyle(col, 0.14); g.beginPath(); g.slice(h.x, h.y, def.range, a - def.arc / 2, a + def.arc / 2, false); g.fillPath();
      g.lineStyle(1.5, col, 0.7); g.beginPath(); g.slice(h.x, h.y, def.range, a - def.arc / 2, a + def.arc / 2, false); g.strokePath();
    } else if (def.aim === 'wall') {
      const w = this.wallEnds(c, def);
      g.lineStyle(def.width, col, 0.3); g.lineBetween(w.ax, w.ay, w.bx, w.by);
      g.lineStyle(2, col, 0.9); g.lineBetween(w.ax, w.ay, w.bx, w.by);
    } else if (def.aim === 'target') {
      const t = this.pickTarget(mx, my, def.range);
      if (t) { g.lineStyle(3, col, 0.95); g.strokeCircle(t.x, t.y, t.radius + 7); g.lineStyle(1, col, 0.5); g.lineBetween(h.x, h.y, t.x, t.y); }
      else { g.lineStyle(1.5, 0xef4444, 0.7); g.strokeCircle(mx, my, 14); }
    }
  }

  // Wall segment centred on c, perpendicular to the hero → c direction.
  wallEnds(c, def) {
    const h = this.hero, half = h.skillRadius(def.length) / 2;
    const d = Math.hypot(c.x - h.x, c.y - h.y);
    const nx = d < 1 ? Math.cos(h.facing) : (c.x - h.x) / d, ny = d < 1 ? Math.sin(h.facing) : (c.y - h.y) / d;
    return { ax: c.x - ny * half, ay: c.y + nx * half, bx: c.x + ny * half, by: c.y - nx * half };
  }
}

// Distance from point (px, py) to segment a-b.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
