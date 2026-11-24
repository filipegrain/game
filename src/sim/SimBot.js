// Balance simulation bot: plays the hero and spends gold following a strategy from CONFIG.sim.strategies.
// Hero: defends against the enemy closest to the Keep (flow distance), retreats at low HP, casts skills by heuristic.
// Spending: runs the strategy's `opening` once, then repeats `loop`, saving up for each step.

class SimBot {
  constructor(scene, strategyKey) {
    this.scene = scene;
    this.hero = scene.hero;
    this.strat = CONFIG.sim.strategies[strategyKey];
    this.B = CONFIG.sim.bot;
    this.HB = this.B[scene.heroKey];
    this.idle = this.strat.hero === 'idle';
    this.inOpening = this.strat.opening.length > 0;
    this.stepIdx = 0;
    this.thinkT = 0; this.skillT = 0; this.spendT = 0;
    this.retreating = false;
    this.focus = null;
    this.laneRR = 0;
    this.leak = [0, 0, 0];   // Keep damage taken per origin lane
    this.itemBuild = CONFIG.sim.itemBuilds[scene.heroKey];
    if (this.idle && this.hero.kit.autoQ != null) this.hero.kit.autoQ = false;   // idle = basic attacks only
  }

  onKeepDamage(lane, dmg) { if (lane != null) this.leak[lane] += dmg; }

  update(dt) {
    this.spendT -= dt;
    if (this.spendT <= 0) { this.spendT = 0.5; this.spend(); }
    const h = this.hero;
    if (!h.alive) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = this.B.thinkEvery; this.think(); }
    if (!this.idle) {
      this.skillT -= dt;
      if (this.skillT <= 0) { this.skillT = this.B.skillEvery; this.useSkills(); }
    }
  }

  // ================================================================ movement
  home() { const k = this.scene.keep; return { x: k.rx + k.rw + 50, y: k.y }; }

  think() {
    const h = this.hero, sc = this.scene, B = this.B;
    const frac = h.hp / h.maxHp;
    if (this.retreating && frac >= B.resumeHp) this.retreating = false;
    if (!this.retreating && frac < B.retreatHp && !this.idle) this.retreating = true;
    const home = this.home();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    if (this.idle) {
      if (dist(h, home) > 160 && (!h.order || h.order.type !== 'move')) h.commandMove(home.x, home.y);
      return;
    }
    if (this.retreating) {
      if (dist(h, home) > 70 && (!h.order || h.order.type !== 'move')) h.commandMove(home.x, home.y);
      return;
    }

    // most threatening enemy: closest to the Keep along the flow field
    const p = sc.pathing;
    let focus = null, fd = Infinity;
    for (const e of sc.enemies) {
      if (!e.alive) continue;
      const d = p.flowDistAt(e.x, e.y);
      if (d < fd) { fd = d; focus = e; }
    }
    this.focus = focus;

    if (!focus) {
      // wait at the post of the next lane
      const lanes = sc.waves.nextLanes || [1];
      const post = sc.allyCommand.posts[lanes[0]];
      const o = h.order;
      if (dist(h, post) > 50 && !(o && o.type === 'move' && dist(o, post) < 50)) h.commandMove(post.x, post.y);
      return;
    }

    const t = h.autoTarget;
    const engaged = h.windupT > 0 || (h.order && h.order.type === 'attack' && h.order.target.alive) ||
      (t && t.alive && t.edgeDist(h.x, h.y) <= h.stats.acquireRange);
    // override a local fight only if the focus is much closer to the Keep
    const override = engaged && t && t.alive && p.flowDistAt(t.x, t.y) - fd > 12;
    if (engaged && !override) return;

    const dF = dist(h, focus), o = h.order;
    if (dF > h.stats.acquireRange + 100) {
      // travel (ignoring enemies on the way) toward the threat
      if (!(o && o.type === 'move' && dist(o, focus) < 120)) h.commandMove(focus.x, focus.y);
    } else if (!(o && o.type === 'amove' && dist(o, focus) < 120)) {
      h.commandAttackMove(focus.x, focus.y);
    }
  }

  // ================================================================ skills
  near(range) {
    const h = this.hero, out = [];
    for (const e of this.scene.enemies) if (e.alive && Math.hypot(e.x - h.x, e.y - h.y) <= range) out.push(e);
    return out;
  }

  // Best circle of `radius` centred on an enemy within `range` of (cx, cy).
  cluster(list, cx, cy, range, radius) {
    let best = { count: 0, boss: false, x: 0, y: 0 };
    const r2 = radius * radius;
    for (const c of list) {
      if (Math.hypot(c.x - cx, c.y - cy) > range) continue;
      let n = 0, boss = false, sx = 0, sy = 0;
      for (const e of list) {
        if ((e.x - c.x) ** 2 + (e.y - c.y) ** 2 <= r2) { n++; sx += e.x; sy += e.y; if (e.isBoss) boss = true; }
      }
      if (n > best.count || (boss && !best.boss)) best = { count: n, boss, x: sx / n, y: sy / n };
    }
    return best;
  }

  ready(k) { return this.hero.cooldowns[k] <= 0; }
  cast(k, x, y) { return this.hero.tryCast(k, x, y); }

  useSkills() {
    const h = this.hero;
    if (!h.alive || h.kit.busy || h.stunned) return;
    const near = this.near(700);
    if (!near.length) return;
    if (this.scene.heroKey === 'warrior') this.warriorSkills(near);
    else this.mageSkills(near);
  }

  // Only Dash is active; Whirl, Rage and Bloodthirst are passive.
  warriorSkills(near) {
    const h = this.hero, S = CONFIG.skills.warrior, W = this.HB;
    if (!this.ready('R')) return;
    const range = h.skillRadius(S.R.range * (1 + (h.stats.dashRange || 0)));
    if (this.retreating) {
      if (near.some(e => Math.hypot(e.x - h.x, e.y - h.y) < 150)) { const hm = this.home(); this.cast('R', hm.x, hm.y); }
      return;
    }
    const f = this.focus;
    const d = f && f.alive ? Math.hypot(f.x - h.x, f.y - h.y) : Infinity;
    if (d > W.dashMinDist && d <= range + 40) { this.cast('R', f.x, f.y); return; }
    const c = this.cluster(near, h.x, h.y, range, 60);
    if (c.count >= W.dashCluster) this.cast('R', c.x, c.y);
  }

  mageSkills(near) {
    const h = this.hero, S = CONFIG.skills.mage, M = this.HB, k = this.scene.keep;
    if (this.ready('R')) {
      const c = this.cluster(near, h.x, h.y, S.R.range, S.R.radius * 0.7);
      if (c.count >= M.ultMin || c.boss) { this.cast('R', c.x, c.y); return; }
    }
    if (this.ready('E')) {
      const r = h.skillRadius(S.E.radius);
      const threats = near.filter(e => Math.hypot(e.x - h.x, e.y - h.y) <= S.E.range &&
        (k.edgeDist(e.x, e.y) <= M.freezeKeepDist || Math.hypot(e.x - h.x, e.y - h.y) <= M.freezeHeroDist));
      if (threats.length) {
        const c = this.cluster(near, threats[0].x, threats[0].y, r, r);
        this.cast('E', c.count ? c.x : threats[0].x, c.count ? c.y : threats[0].y); return;
      }
    }
    if (this.ready('W')) {
      const r = h.skillRadius(S.W.radius);
      const c = this.cluster(near, h.x, h.y, S.W.range, r);
      if (c.count >= M.poolMin) {
        // lead the group a little: average velocity of enemies in the pool area
        let vx = 0, vy = 0, n = 0;
        for (const e of near) if (Math.hypot(e.x - c.x, e.y - c.y) <= r) { vx += e.vx || 0; vy += e.vy || 0; n++; }
        n = n || 1;
        this.cast('W', c.x + vx / n * 0.4, c.y + vy / n * 0.4);
      }
    }
  }

  // ================================================================ spending
  currentStep() {
    const list = this.inOpening ? this.strat.opening : this.strat.loop;
    return list[this.stepIdx % list.length];
  }

  advance() {
    this.stepIdx++;
    if (this.inOpening && this.stepIdx >= this.strat.opening.length) { this.inOpening = false; this.stepIdx = 0; }
  }

  spend() {
    if (!this.strat.loop.length && !this.inOpening) return;
    for (let guard = 0; guard < 20; guard++) {
      const act = this.resolve(this.currentStep());
      if (!act) { this.advance(); continue; }           // impossible: skip
      if (this.scene.economy.gold < act.cost) return;   // save up
      act.run();
      this.advance();
    }
  }

  pay(cat, cost, kind, key, level) {
    this.scene.economy.gold -= cost;
    this.scene.events.emit('goldChanged', -cost);
    this.scene.recorder.spent(cat, cost, kind, key, level);
  }

  resolve(step) {
    const sc = this.scene;
    if (step === 'keep') {
      const next = sc.keep.nextTierDef;
      if (!next) return null;
      return { cost: next.cost, run: () => { this.pay('keep', next.cost, 'keep', 'tier', sc.keep.tier + 1); sc.keep.upgrade(); sc.events.emit('keepUpgraded', sc.keep.tier); } };
    }
    if (!CONFIG.buildings[step] || !sc.build.isUnlocked(step)) return null;
    const isTower = !!CONFIG.buildings[step].range;
    const up = this.upgradable(step);
    const doUpgrade = () => { this.pay(step, up.upgradeCost(), 'upgrade', step, up.level + 1); up.upgrade(); };
    // towers: upgrade before building new; barracks / mines: build new before upgrading.
    // The spot is picked only when buying (the scan is expensive); no spot left → upgrade instead, or skip.
    if (isTower && up) return { cost: up.upgradeCost(), run: doUpgrade };
    const cost = CONFIG.buildings[step].cost;
    return {
      cost,
      run: () => {
        const spot = this.pickSpot(step);
        if (spot) { this.pay(step, cost, 'build', step, 1); sc.addBuilding(new Building(sc, step, spot.tx, spot.ty)); }
        else if (up && sc.economy.gold >= up.upgradeCost()) doUpgrade();
      },
    };
  }

  upgradable(type) {
    let best = null;
    for (const b of this.scene.buildings) {
      if (!b.alive || b.type !== type || b.upgradeCost() == null || !b.canUpgradeTier()) continue;
      if (!best || b.level < best.level) best = b;
    }
    return best;
  }

  // Level-up item pick: first offered item in the hero's priority list, else the first offered.
  chooseItem(choices) {
    return this.itemBuild.find(k => choices.includes(k)) || choices[0];
  }

  // ================================================================ tower placement
  // Lane-tile coverage of a tile within `range` px, per lane. Only lane tiles near the Keep (flow distance) count.
  coverage(tx, ty, range) {
    const p = this.scene.pathing, T = CONFIG.TILE, rt = Math.ceil(range / T), cov = [0, 0, 0];
    const fp = CONFIG.buildings.footprint;
    const cx = CONFIG.px(tx + fp / 2), cy = CONFIG.px(ty + fp / 2);
    for (let y = ty - rt; y <= ty + rt; y++) {
      for (let x = tx - rt; x <= tx + rt; x++) {
        if (!p.isLane(x, y)) continue;
        const px = x * T + T / 2, py = y * T + T / 2;
        if (Math.hypot(px - cx, py - cy) > range) continue;
        const fd = p.dist[p.idx(x, y)];
        if (!(fd <= 40)) continue;
        cov[p.laneOfY(py)] += 1 + (40 - fd) / 40;   // closer to the Keep counts more
      }
    }
    return cov;
  }

  pickSpot(type) {
    const sc = this.scene, p = sc.pathing, def = CONFIG.buildings[type];
    const isTower = !!def.range;
    let lane = 0;
    if (isTower) {
      const maxLeak = Math.max(...this.leak);
      lane = maxLeak > 0 ? this.leak.indexOf(maxLeak) : (this.laneRR++ % 3);
    }
    let best = null, bestScore = -Infinity;
    for (let ty = 0; ty < p.H; ty++) {
      for (let tx = 0; tx < p.W; tx++) {
        if (p.tileType(tx, ty) !== TILE_T.TERRAIN) continue;
        const c = sc.build.check(type, tx, ty);
        if (!c.ok && !c.gold) continue;
        const cov = this.coverage(tx, ty, isTower ? def.range : 230);
        const total = cov[0] + cov[1] + cov[2];
        // towers: best coverage of the chosen lane; others: keep good tower spots free
        const score = isTower ? cov[lane] * 3 + total : -total;
        if (score > bestScore) { bestScore = score; best = { tx, ty }; }
      }
    }
    return best;
  }
}
