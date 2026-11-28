// Waves and the minute tick (see CONFIG.waves).
// Waves: wave 1 after firstDelay; a wave is cleared once every enemy of it has spawned and died, and the next one
// starts clearDelay s later. Clearing pays the hero the XP of every enemy in the wave, whoever killed them.
// Minute tick: every tickInterval s (the first at firstDelay) creeps spawn at each lane whose first tower stands,
// cleared neutral camps refill and tick gold (plus Gold Mines) is paid. Endless; enemy count and stats grow per wave.

class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.wave = 0;                               // last wave started
    this.nextIn = CONFIG.waves.firstDelay;       // s until the next wave, or null while a wave is on
    this.tickIn = CONFIG.waves.firstDelay;       // s until the next minute tick
    this.waveXp = 0;                             // XP of the current wave's spawned enemies, paid on clear
    this.queues = CONFIG.map.spawns.map(() => ({ items: [], t: 0 }));   // per spawn: pending { type, at }
    this.camps = CONFIG.map.camps.map(def => ({ def, units: [] }));
    this.curMods = this.mods(1);
    this.next = this.planWave(1);
    this.refillCamps(this.curMods);
  }

  mods(n) {
    const W = CONFIG.waves, e = (n - 1) * W.scaling;
    return {
      hp: W.enemyMul * (1 + W.hpLinear * e) * Math.pow(W.hpExp, e),
      dmg: W.enemyMul * (1 + W.dmgPerWave * e),
      speed: Math.min(W.speedCap, 1 + W.speedPerWave * e),
      gold: 1 + W.goldPerWaveScaling * (n - 1),
      xp: 1 + W.xpPerWaveScaling * (n - 1),
    };
  }

  planWave(n) {
    const W = CONFIG.waves;
    const bosses = n % W.bossEvery === 0 ? Math.floor(n / W.bossGrowEvery) + 1 : 0;
    const count = Math.max(0, W.baseCount + W.countPerWave * (n - 1) - bosses * W.bossReplaces);
    const pool = Object.keys(W.weights).filter(t => n >= W.unlocks[t]);
    const totalW = pool.reduce((s, t) => s + W.weights[t], 0);
    const list = [];
    for (let i = 0; i < count; i++) {
      let r = Math.random() * totalW, pick = pool[0];
      for (const t of pool) { r -= W.weights[t]; if (r <= 0) { pick = t; break; } }
      list.push(pick);
    }
    return { n, list, bosses, count: count + bosses, mods: this.mods(n) };
  }

  update(dt) {
    this.tickIn -= dt;
    if (this.tickIn <= 0) { this.tickIn += CONFIG.waves.tickInterval; this.tick(); }

    if (this.nextIn != null) {
      this.nextIn -= dt;
      if (this.nextIn <= 0) { this.nextIn = null; this.startWave(); }
    }

    this.queues.forEach((q, lane) => {
      q.t += dt;
      while (q.items.length && q.items[0].at <= q.t) {
        const it = q.items.shift();
        const sp = this.spawnPoint(lane);
        const p = this.scene.pathing.nearestWalkable(sp.x + (Math.random() - 0.5) * 60, sp.y + (Math.random() - 0.5) * 60, 14);
        const e = this.scene.spawnEnemy(it.type, p.x, p.y, this.curMods);
        e.lane = lane;
        e.viaBridge = true;
        this.waveXp += e.xp;
      }
    });

    if (this.nextIn == null && this.wave > 0 && this.hostileCount === 0) this.clearWave();
  }

  startWave() {
    const W = CONFIG.waves, sc = this.scene, plan = this.next;
    this.wave = plan.n;
    this.curMods = plan.mods;
    this.waveXp = 0;

    // enemies: round-robin over the spawns, bosses last
    const lists = this.queues.map(() => []);
    Phaser.Utils.Array.Shuffle(plan.list.slice()).forEach((t, i) => lists[i % lists.length].push(t));
    for (let b = 0; b < plan.bosses; b++) lists[b % lists.length].push('boss');
    this.queues.forEach((q, lane) => {
      q.t = 0;
      q.items = lists[lane].map((type, i) => ({ type, at: i * W.spawnInterval }));
    });

    Sfx.play('wave');
    if (plan.bosses) Sfx.play('boss');
    sc.events.emit('waveStart', this.wave, plan);
    for (let l = 0; l < this.queues.length; l++) sc.ping(this.spawnPoint(l).x, this.spawnPoint(l).y, 0xff4040);
    this.next = this.planWave(this.wave + 1);
  }

  clearWave() {
    const sc = this.scene, xp = this.waveXp;
    this.nextIn = CONFIG.waves.clearDelay;
    this.waveXp = 0;
    sc.stats.wavesCleared = this.wave;
    sc.events.emit('waveCleared', this.wave, xp);
    sc.leveling.addXp(xp);
  }

  // Minute tick: creeps, camp refills, income.
  tick() {
    const W = CONFIG.waves, sc = this.scene, n = Math.max(1, this.wave);
    this.spawnCreeps();
    this.refillCamps(this.curMods);
    let mineGold = 0;
    for (const b of sc.buildings) if (b.alive && b.type === 'mine') {
      const g = b.def.income[b.level - 1];
      mineGold += g;
      Feel.floatText(b.x, b.y - 16, '+' + g + 'g', '#ffd23f', 14, 1000);
    }
    const gold = W.tickGoldBase + W.tickGoldPerWave * (n - 1);
    sc.economy.add(gold + mineGold);
    if (sc.recorder) { sc.recorder.goldEarned('tick', gold); sc.recorder.goldEarned('mines', mineGold); }
  }

  // perLane creeps at each lane's first tower, if it still stands.
  spawnCreeps() {
    const sc = this.scene, A = CONFIG.allies, tier = sc.keep.tier;
    const archers = A.archersPerLane[tier - 1];
    for (const t of sc.towers) {
      if (!t.alive || t.order !== 0) continue;
      for (let i = 0; i < A.perLane; i++) {
        const a = (i / A.perLane) * Math.PI * 2;
        sc.spawnAlly(i < A.perLane - archers ? 'soldier' : 'archer', t.x + Math.cos(a) * 44, t.y + Math.sin(a) * 44, tier, t.lane);
      }
    }
  }

  // Camps with no living monster get a fresh set.
  refillCamps(mods) {
    const N = CONFIG.neutrals, T = CONFIG.TILE;
    for (const camp of this.camps) {
      if (camp.units.some(u => u.alive)) continue;
      camp.units = [];
      for (let i = 0; i < N.perCamp; i++) {
        const a = (i / N.perCamp) * Math.PI * 2;
        const p = this.scene.pathing.nearestWalkable(camp.def.x * T + Math.cos(a) * 30, camp.def.y * T + Math.sin(a) * 30, 14);
        camp.units.push(this.scene.spawnEnemy(camp.def.kind, p.x, p.y, mods, camp));
      }
    }
  }

  spawnPoint(lane) {
    const T = CONFIG.TILE, s = CONFIG.map.spawns[lane];
    return { x: s.x * T, y: s.y * T };
  }

  get hostileCount() { return this.scene.enemies.filter(e => e.alive && !e.neutral).length + this.queues.reduce((s, q) => s + q.items.length, 0); }
}
