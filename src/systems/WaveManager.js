// Build phase (until the player starts the wave) → wave phase → clear → next build phase. Endless scaling.

class WaveManager {
  constructor(scene, diff) {
    this.scene = scene;
    this.diff = diff;
    this.wave = 0;               // last wave started
    this.phase = 'build';        // 'build' | 'wave'
    this.queues = [];            // per lane: list of { type, delay }
    this.spawned = 0;
    this.toSpawn = 0;
    this.next = this.planWave(1);
  }

  mods(n) {
    const W = CONFIG.waves, e = (n - 1) * this.diff.scaling;
    return {
      hp: this.diff.enemyMul * (1 + W.hpLinear * e) * Math.pow(W.hpExp, e),
      dmg: this.diff.enemyMul * (1 + W.dmgPerWave * e),
      speed: Math.min(W.speedCap, 1 + W.speedPerWave * e),
      gold: 1 + W.goldPerWaveScaling * (n - 1),
      xp: 1 + 0.06 * (n - 1),
    };
  }

  planWave(n) {
    const W = CONFIG.waves;
    const e = (n - 1) * this.diff.scaling;
    // lanes
    let laneCount = n < 3 ? 1 : n < 6 ? Phaser.Math.Between(1, 2) : n < 10 ? Phaser.Math.Between(2, 3) : 3;
    if (n >= 6 && Math.random() < 0.25) laneCount = Math.max(1, laneCount - 1);
    const lanes = Phaser.Utils.Array.Shuffle([0, 1, 2]).slice(0, laneCount).sort();
    // composition
    const count = Math.round(W.baseCount + W.countPerWave * e);
    const pool = Object.keys(W.weights).filter(t => n >= W.unlocks[t]);
    const totalW = pool.reduce((s, t) => s + W.weights[t], 0);
    const list = [];
    for (let i = 0; i < count; i++) {
      let r = Math.random() * totalW, pick = pool[0];
      for (const t of pool) { r -= W.weights[t]; if (r <= 0) { pick = t; break; } }
      list.push(pick);
    }
    const bosses = n % W.bossEvery === 0 ? Math.floor(n / (W.bossEvery * 2)) + 1 : 0;
    return { n, lanes, list, bosses, mods: this.mods(n) };
  }

  startWave() {
    if (this.phase !== 'build') return;
    const plan = this.next;
    this.wave = plan.n;
    this.phase = 'wave';
    this.curMods = plan.mods;
    this.curLanes = plan.lanes;
    // distribute enemies across lanes in groups
    const W = CONFIG.waves;
    this.queues = plan.lanes.map(() => []);
    const shuffled = Phaser.Utils.Array.Shuffle(plan.list.slice());
    shuffled.forEach((t, i) => this.queues[i % plan.lanes.length].push(t));
    this.lanesQ = plan.lanes.map((lane, li) => {
      const q = this.queues[li];
      const items = [];
      let t = 0.5 + li * 0.4, inGroup = 0, groupSize = Phaser.Math.Between(W.groupSize[0], W.groupSize[1]);
      for (const type of q) {
        items.push({ type, at: t });
        inGroup++;
        if (inGroup >= groupSize) { t += W.groupPause; inGroup = 0; groupSize = Phaser.Math.Between(W.groupSize[0], W.groupSize[1]); }
        else t += W.spawnInterval;
      }
      return { lane, items, t: 0 };
    });
    for (let b = 0; b < plan.bosses; b++) {
      const lq = this.lanesQ[b % this.lanesQ.length];
      const last = lq.items.length ? lq.items[lq.items.length - 1].at : 0;
      lq.items.push({ type: 'boss', at: last + 2 + b });
    }
    this.toSpawn = this.lanesQ.reduce((s, l) => s + l.items.length, 0);
    this.spawned = 0;
    Sfx.play('wave');
    if (plan.bosses) Sfx.play('boss');
    this.scene.events.emit('waveStart', this.wave, plan);
    for (const l of plan.lanes) this.scene.ping(this.spawnPoint(l).x, this.spawnPoint(l).y, 0xff4040);
    this.next = this.planWave(this.wave + 1);
  }

  spawnPoint(lane) {
    const T = CONFIG.TILE, s = CONFIG.map.lanes[lane].spawn;
    return { x: s.x * T, y: s.y * T };
  }

  update(dt) {
    if (this.phase === 'build') return;
    // spawning
    for (const lq of this.lanesQ) {
      lq.t += dt;
      while (lq.items.length && lq.items[0].at <= lq.t) {
        const it = lq.items.shift();
        const sp = this.spawnPoint(lq.lane);
        const T = CONFIG.TILE;
        const laneDef = CONFIG.map.paths[lq.lane === 0 ? 0 : lq.lane === 1 ? 1 : 2];
        const y = Phaser.Math.Clamp(sp.y + (Math.random() - 0.5) * (laneDef.h - 1) * T, laneDef.y * T + 14, (laneDef.y + laneDef.h) * T - 14);
        const e = this.scene.spawnEnemy(it.type, sp.x + Math.random() * 20, y, this.curMods);
        e.lane = lq.lane;
        this.spawned++;
      }
    }
    // cleared?
    if (this.spawned >= this.toSpawn && !this.scene.enemies.some(e => e.alive)) this.clearWave();
  }

  clearWave() {
    const W = CONFIG.waves;
    const n = this.wave;
    let gold = W.clearGoldBase + W.clearGoldPerWave * n;
    let mineGold = 0;
    for (const b of this.scene.buildings) if (b.alive && b.type === 'mine') { mineGold += b.def.income[b.level - 1]; Feel.floatText(b.x, b.y - 16, '+' + b.def.income[b.level - 1] + 'g', '#ffd23f', 14, 1000); }
    this.scene.economy.add(gold + mineGold);
    if (this.scene.recorder) { this.scene.recorder.goldEarned('waveClear', gold); this.scene.recorder.goldEarned('mines', mineGold); }
    this.scene.leveling.addXp(W.clearXpBase + W.clearXpPerWave * n);
    this.scene.stats.wavesCleared = n;
    this.phase = 'build';
    Sfx.play('gold');
    this.scene.events.emit('waveCleared', n, gold + mineGold);
  }

  get nextLanes() { return this.phase === 'build' ? this.next.lanes : this.curLanes; }
}
