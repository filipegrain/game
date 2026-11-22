// Damage, targeting queries and shared combat helpers.

const Combat = {
  scene: null,
  init(scene) { this.scene = scene; },

  armorMul(armor) { return 20 / (20 + Math.max(-10, armor || 0)); },

  // opts: { source, melee, crit, skill, knock: {x, y, force}, structureMul, noNumber, lifesteal, color, isAttack }
  dealDamage(target, amount, opts = {}) {
    if (!target || !target.alive || target.invulnerable || target.isBuilding) return 0;   // buildings are immune
    const armor = target.getArmor ? target.getArmor() : (target.armor || 0);
    let dmg = amount * this.armorMul(armor);
    if (target.isStructure && opts.structureMul) dmg *= opts.structureMul;
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;
    if (target.onDamaged) target.onDamaged(dmg, opts);

    // damage numbers
    if (!opts.noNumber) {
      if (target.team === 'enemy') {
        Feel.damageNumber(target.x, target.y - target.radius - 6, dmg, { crit: opts.crit, color: opts.color, small: !opts.source || !opts.source.isHero && !opts.skill });
      } else if (target.isHero) {
        Feel.damageNumber(target.x, target.y - target.radius - 6, dmg, { color: '#ff5c5c' });
      }
    }

    if (opts.knock && target.applyKnock) target.applyKnock(opts.knock.x, opts.knock.y, opts.knock.force);

    const src = opts.source;
    // lifesteal (hero attacks)
    if (src && src.isHero && src.alive && opts.isAttack && src.stats.lifesteal > 0) {
      src.heal(dmg * src.stats.lifesteal);
    }
    // thorns (hero hit by melee)
    if (target.isHero && opts.melee && src && src.alive && target.stats.thorns > 0) {
      this.dealDamage(src, dmg * target.stats.thorns, { source: target, noNumber: false, color: '#7cd67c' });
    }

    if (target.hp <= 0 && target.alive) {
      target.hp = 0;
      target.die(src);
    }
    return dmg;
  },

  enemiesInRadius(x, y, r) {
    const out = [];
    for (const e of this.scene.enemies) {
      if (!e.alive) continue;
      const rr = r + e.radius;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 <= rr * rr) out.push(e);
    }
    return out;
  },

  playerUnitsInRadius(x, y, r) {
    const out = [];
    const h = this.scene.hero;
    if (h && h.alive && !h.invulnerable) {
      const rr = r + h.radius;
      if ((h.x - x) ** 2 + (h.y - y) ** 2 <= rr * rr) out.push(h);
    }
    for (const a of this.scene.allies) {
      if (!a.alive) continue;
      const rr = r + a.radius;
      if ((a.x - x) ** 2 + (a.y - y) ** 2 <= rr * rr) out.push(a);
    }
    return out;
  },

  // Damageable structures (only the Keep: buildings are immune)
  structuresInRadius(x, y, r) {
    const out = [];
    const k = this.scene.keep;
    if (k.alive && k.edgeDist(x, y) <= r) out.push(k);
    return out;
  },

  nearestEnemy(x, y, range, filter) {
    let best = null, bestD = Infinity;
    for (const e of this.scene.enemies) {
      if (!e.alive) continue;
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.radius;
      if (d <= range && d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // Enemies sorted by distance (for chain lightning etc.)
  enemiesByDistance(x, y, range, exclude) {
    return this.scene.enemies
      .filter(e => e.alive && !(exclude && exclude.has(e)) && Math.hypot(e.x - x, e.y - y) - e.radius <= range)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  },

  angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
};
