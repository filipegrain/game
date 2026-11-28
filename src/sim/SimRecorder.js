// Balance simulation: collects per-run statistics from one GameScene.
// Damage/kills arrive through Combat.dealDamage (scene.recorder.onDamage); the rest through scene events.

class SimRecorder {
  constructor(scene) {
    this.scene = scene;
    this.damage = {};        // source category -> damage dealt to enemies
    this.kills = {};         // source category -> kills
    this.keepDamage = {};    // enemy type -> damage dealt to the Keep
    this.heroDamage = {};    // enemy type -> damage dealt to the hero
    this.allyDamageTaken = 0;
    this.structureDamage = {};   // enemy type -> damage dealt to lane towers and buildings
    this.casts = {};         // skill id -> casts
    this.heroDeaths = [];    // [wave, time, level]
    this.revives = 0;
    this.goldIn = { bounty: 0, tick: 0, mines: 0 };
    this.goldOut = {};       // category -> gold spent
    this.purchases = [];     // [wave, kind, key, level]
    this.waves = [];         // per survived wave: [wave, duration, keepHp%, heroLevel, goldEarned, heroDeaths]
    this.keepTiers = [];     // [wave, tier]
    this.waveStartT = 0;
    // scene.events outlives a scene restart: unsubscribe on shutdown or the next run reports into this one
    const ev = scene.events, subs = [];
    const on = (name, fn) => { ev.on(name, fn); subs.push([name, fn]); };
    ev.once('shutdown', () => subs.forEach(([n, f]) => ev.off(n, f)));
    on('skillCast', (k) => { const id = scene.hero.skillIds[k]; this.casts[id] = (this.casts[id] || 0) + 1; });
    on('heroDied', () => { const h = scene.hero; this.heroDeaths.push([this.wave(), Math.round(scene.stats.time), h.level]); });
    on('heroRevived', () => { this.revives++; });
    on('waveStart', (n) => {
      const k = scene.keep, h = scene.hero;
      if (n > 1) this.waves.push([n - 1, +(scene.stats.time - this.waveStartT).toFixed(1), Math.round(k.hp / k.maxHp * 100), h.level, scene.economy.totalEarned, this.heroDeaths.length]);
      this.waveStartT = scene.stats.time;
    });
    on('keepUpgraded', (tier) => { this.keepTiers.push([this.wave(), tier]); });
    this.buildingsLost = 0;
    on('buildingLost', () => { this.buildingsLost++; });
  }

  wave() { return this.scene.waves ? this.scene.waves.wave : 0; }

  update(dt) { }

  // Category of the player-side source of a hit on an enemy.
  category(opts) {
    const src = opts.source;
    if (!src) return 'other';
    if (src.isHero) {
      if (opts.thorns) return 'hero:thorns';
      if (opts.skill) return 'hero:' + opts.skill;
      if (opts.isAttack) return 'hero:attack';
      return 'hero:chain';
    }
    if (src.isBuilding) return 'tower:' + src.type;
    if (src === this.scene.keep) return 'keep';
    if (src.isTower) return 'laneTower';
    if (src.kind) return 'ally:' + src.kind;
    return 'other';
  }

  onDamage(target, dmg, opts, killed) {
    if (target.team === 'enemy') {
      const c = this.category(opts);
      this.damage[c] = (this.damage[c] || 0) + dmg;
      if (killed) this.kills[c] = (this.kills[c] || 0) + 1;
      return;
    }
    const type = opts.source && opts.source.type || 'unknown';
    if (target === this.scene.keep) {
      this.keepDamage[type] = (this.keepDamage[type] || 0) + dmg;
      if (this.scene.bot && opts.source) this.scene.bot.onKeepDamage(opts.source.lane, dmg);
    }
    else if (target.isHero) this.heroDamage[type] = (this.heroDamage[type] || 0) + dmg;
    else if (target.isStructure) this.structureDamage[type] = (this.structureDamage[type] || 0) + dmg;
    else this.allyDamageTaken += dmg;
  }

  goldEarned(cat, amount) { this.goldIn[cat] = (this.goldIn[cat] || 0) + Math.round(amount); }

  spent(cat, amount, kind, key, level) {
    this.goldOut[cat] = (this.goldOut[cat] || 0) + amount;
    this.purchases.push([this.wave(), kind, key, level]);
  }

  result(reason) {
    const sc = this.scene, h = sc.hero, r = (o) => { const out = {}; for (const k in o) out[k] = Math.round(o[k]); return out; };
    const towers = {};
    for (const b of sc.buildings) if (b.alive) towers[b.type] = (towers[b.type] || []).concat(b.level);
    return JSON.parse(JSON.stringify({
      hero: sc.heroKey, loadout: sc.simJob.loadout, strategy: sc.simJob.strategy, seed: sc.simJob.seed,
      end: reason, wavesCleared: sc.stats.wavesCleared, reachedWave: sc.waves.wave,
      time: Math.round(sc.stats.time), kills: sc.stats.kills,
      heroLevel: h.level, keepTier: sc.keep.tier, keepHpPct: Math.round(Math.max(0, sc.keep.hp) / sc.keep.maxHp * 100),
      goldEarned: sc.economy.totalEarned, goldUnspent: sc.economy.gold,
      damage: r(this.damage), kills_by: this.kills, keepDamage: r(this.keepDamage), heroDamage: r(this.heroDamage),
      allyDamageTaken: Math.round(this.allyDamageTaken), structureDamage: r(this.structureDamage),
      towersLost: sc.towers.filter(t => !t.alive).length, buildingsLost: this.buildingsLost,
      casts: this.casts, heroDeaths: this.heroDeaths, revives: this.revives,
      goldIn: this.goldIn, goldOut: this.goldOut, purchases: this.purchases,
      items: Object.assign({}, h.itemLevels), towers, keepTiers: this.keepTiers, waves: this.waves,
      error: this.error || null,
    }));
  }
}
