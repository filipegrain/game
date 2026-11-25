// World simulation, input and camera.

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.heroKey = data.hero || 'warrior';
    this.diffKey = data.difficulty || 'normal';
    this.diff = CONFIG.difficulty[this.diffKey];
    this.simJob = data.sim || null;     // balance simulation run (see SimRunner)
  }

  create() {
    if (this.simJob) SimRunner.beginRun(this);   // seeds Math.random before anything rolls dice
    Feel.init(this);
    Combat.init(this);
    this.hitstop = 0;
    this.paused = false;
    this.ended = false;
    this.timers = [];
    this.pings = [];
    this.enemies = [];
    this.allies = [];
    this.buildings = [];
    this.towers = [];
    this.projectiles = [];
    this.stats = { kills: 0, time: 0, wavesCleared: 0 };
    this.cursorMode = null;      // null | 'attack'
    this.spaceHeld = false;      // hold Space to follow the hero (the camera is otherwise free)
    this.rightHeld = false;
    this.followT = 0;
    this.pointerInside = false;

    this.pathing = new Pathing(this);
    if (this.simJob && this.textures.exists('map')) this.add.image(0, 0, 'map').setOrigin(0).setDepth(0);
    else this.drawMap();

    this.keep = new Keep(this);
    CONFIG.map.towers.forEach((lane, li) => lane.forEach((def, i) => this.towers.push(new Tower(this, li, i, def))));
    this.hero = new Hero(this, this.heroKey, this.keep.front.x, this.keep.front.y);
    this.economy = new Economy(this, this.diff.startGold);
    this.leveling = new Leveling(this, this.hero);
    this.picks = new ItemPicks(this, this.hero);
    this.build = new BuildSystem(this);
    this.waves = new WaveManager(this, this.diff);

    this.hpG = this.add.graphics().setDepth(50);
    this.indG = this.add.graphics().setDepth(45);

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
    cam.setBackgroundColor('#1b2a1a');
    this.camTarget = { x: 0, y: 0 };
    this.jumpCameraTo(this.keep.x + 300, this.keep.y);

    if (this.simJob) {
      // the bot drives the hero; no HUD, no player input
      this.ui = { isOverUI: () => false, toggleBuildPanel() { } };
      this.recorder = new SimRecorder(this);
      this.bot = new SimBot(this, this.simJob.strategy);
      this.cameras.main.setVisible(false);
      return;
    }

    this.setupInput();

    this.scene.launch('UIScene', { game: this });
    this.ui = this.scene.get('UIScene');

    this.unloadGuard = (e) => { if (!this.ended) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', this.unloadGuard);
    this.events.once('shutdown', () => {
      window.removeEventListener('beforeunload', this.unloadGuard);
      this.tweens.timeScale = 1;
    });
  }

  // ---------------------------------------------------------------- map
  drawMap() {
    const T = CONFIG.TILE, W = CONFIG.MAP_W, H = CONFIG.MAP_H, p = this.pathing, m = CONFIG.map;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const rnd = new Phaser.Math.RandomDataGenerator(['castle']);
    const COLORS = {
      [TILE_T.GRASS]: [0x2d7f4e, 0x2f8552, 0x2b7a4b],
      [TILE_T.DIRT]: [0x87543f, 0x8b5842, 0x84513c],
      [TILE_T.BRIDGE]: [0xb07e56],
      [TILE_T.WATER]: [0x4fa9b5, 0x52adb9],
      [TILE_T.ROCK]: [0x5f6770, 0x636b74, 0x5b636c],
      [TILE_T.TREE]: [0x2b7a4b],
      [TILE_T.KEEP]: [0x84513c],
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cs = COLORS[p.tileType(x, y)];
      g.fillStyle(cs[rnd.between(0, cs.length - 1)], 1); g.fillRect(x * T, y * T, T, T);
    }
    // details: rock bumps, tree canopies, water ripples, bridge planks
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = p.tileType(x, y), cx = x * T + T / 2, cy = y * T + T / 2;
      if (t === TILE_T.ROCK && rnd.frac() < 0.35) {
        g.fillStyle(0x767e88, 1); g.fillCircle(cx + rnd.between(-8, 8), cy + rnd.between(-8, 8), rnd.between(5, 10));
      } else if (t === TILE_T.TREE) {
        g.fillStyle(0x1f5a35, 1); g.fillCircle(cx + 2, cy + 4, 15);
        g.fillStyle([0x8fbf3c, 0x9ccb45, 0x82b337][rnd.between(0, 2)], 1); g.fillCircle(cx + rnd.between(-3, 3), cy + rnd.between(-3, 3), rnd.between(12, 15));
        g.fillStyle(0xb4d65a, 0.6); g.fillCircle(cx - 4, cy - 4, 5);
      } else if (t === TILE_T.WATER && rnd.frac() < 0.25) {
        g.lineStyle(2, 0x8ad6de, 0.6); g.lineBetween(cx - 8, cy, cx + 6, cy);
      } else if (t === TILE_T.BRIDGE) {
        g.lineStyle(2, 0x7d5638, 0.8);
        const vert = p.tileType(x, y - 1) === TILE_T.WATER || p.tileType(x, y + 1) === TILE_T.WATER;
        for (let i = 0; i < T; i += 8) vert ? g.lineBetween(x * T, y * T + i, x * T + T, y * T + i) : g.lineBetween(x * T + i, y * T, x * T + i, y * T + T);
      } else if (t === TILE_T.GRASS && rnd.frac() < 0.08) {
        g.fillStyle(0x3d9a60, 1); g.fillCircle(cx + rnd.between(-10, 10), cy + rnd.between(-10, 10), 3);
      }
    }
    // neutral camps
    for (const c of m.camps) {
      g.lineStyle(3, 0x9fe9ff, 0.35); g.strokeCircle(c.x * T, c.y * T, 70);
    }
    // enemy spawn portals
    for (const s of m.spawns) {
      const sx = s.x * T, sy = s.y * T;
      g.fillStyle(0x2a0a0a, 0.8); g.fillCircle(sx, sy, 40);
      g.lineStyle(4, 0xff3030, 0.8); g.strokeCircle(sx, sy, 40);
      g.lineStyle(2, 0xff8080, 0.5); g.strokeCircle(sx, sy, 28);
    }
    g.generateTexture('map', CONFIG.WORLD_W, CONFIG.WORLD_H);
    g.destroy();
    this.add.image(0, 0, 'map').setOrigin(0).setDepth(0);
    this.gridG = this.add.graphics().setDepth(1).setVisible(false);
  }

  drawBuildGrid() {
    const g = this.gridG, T = CONFIG.TILE;
    g.clear();
    if (!this.build.placing) { g.setVisible(false); return; }
    g.setVisible(true);
    const cam = this.cameras.main;
    const x0 = Math.floor(cam.scrollX / T), y0 = Math.floor(cam.scrollY / T);
    const x1 = x0 + Math.ceil(CONFIG.VIEW_W / T) + 1, y1 = y0 + Math.ceil(CONFIG.VIEW_H / T) + 1;
    const type = this.build.placing;
    g.fillStyle(0x44ff66, 0.08);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = this.build.check(type, x, y);
      if (c.ok || c.gold) g.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
    }
  }

  // ---------------------------------------------------------------- input
  setupInput() {
    const kb = this.input.keyboard;
    this.input.mouse.disableContextMenu();
    kb.addCapture('SPACE,TAB');

    this.input.on('gameout', () => { this.pointerInside = false; });
    this.input.on('gameover', () => { this.pointerInside = true; });

    this.input.on('pointerdown', (pointer) => {
      Sfx.resume();
      if (this.ended) return;
      this.pointerInside = true;
      if (this.ui && this.ui.isOverUI(pointer.x, pointer.y)) return;
      const wx = pointer.worldX, wy = pointer.worldY;
      if (pointer.middleButtonDown()) {
        this.dragPan = { x: pointer.x, y: pointer.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
        return;
      }
      if (this.paused || this.picks.choices) return;
      if (pointer.rightButtonDown()) {
        if (this.hero.aiming) { this.hero.aiming = null; return; }   // cancel aim only, no move order
        if (this.build.placing) { this.build.cancel(); return; }
        if (this.cursorMode) { this.setCursorMode(null); return; }
        this.rightClickAt(wx, wy);
        this.rightHeld = true;
        this.followT = 0.12;
        return;
      }
      if (pointer.leftButtonDown()) {
        if (this.hero.aiming) { this.hero.confirmAim(wx, wy); return; }
        if (this.build.placing) { this.build.tryPlaceAt(wx, wy); return; }
        if (this.cursorMode === 'attack') {
          const dest = this.hero.commandAttackMove(wx, wy);
          if (dest) Feel.clickRing(dest.x, dest.y, 0xff4040);
          this.setCursorMode(null);
          return;
        }
        this.selectAt(wx, wy);
      }
    });

    this.input.on('pointermove', (pointer) => {
      this.pointerInside = true;
      if (this.dragPan) {
        if (!pointer.middleButtonDown()) { this.dragPan = null; return; }
        this.camTarget.x = this.dragPan.sx - (pointer.x - this.dragPan.x);
        this.camTarget.y = this.dragPan.sy - (pointer.y - this.dragPan.y);
        this.clampCamTarget();
        this.cameras.main.setScroll(this.camTarget.x, this.camTarget.y);
      }
    });

    this.input.on('pointerup', (pointer) => {
      if (!pointer.rightButtonDown()) this.rightHeld = false;
      if (!pointer.middleButtonDown()) this.dragPan = null;
    });

    kb.on('keydown', (e) => this.onKeyDown(e));
    kb.on('keyup', (e) => this.onKeyUp(e));
  }

  pointerWorld() {
    const p = this.input.activePointer;
    const cam = this.cameras.main;
    return { x: p.x + cam.scrollX, y: p.y + cam.scrollY };
  }

  enemyAt(wx, wy) {
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - wx, e.y - wy);
      if (d < e.radius + 10 && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  rightClickAt(wx, wy) {
    const h = this.hero;
    if (!h.alive) return;
    const e = this.enemyAt(wx, wy);
    if (e) {
      h.commandAttack(e);
      Feel.clickRing(e.x, e.y, 0xff4040);
      return;
    }
    const dest = h.commandMove(wx, wy);
    if (dest) Feel.clickRing(dest.x, dest.y, 0x44ff66);
    Sfx.play('move');
  }

  selectAt(wx, wy) {
    const p = this.pathing;
    const b = p.buildingAt(p.tileOf(wx), p.tileOf(wy));
    if (b) { this.build.select(b); Sfx.play('click'); return; }
    if (this.keep.edgeDist(wx, wy) <= 0) { this.build.select(this.keep); Sfx.play('click'); return; }
    this.build.select(null);
  }

  setCursorMode(mode) {
    if (mode) this.hero.aiming = null;
    this.cursorMode = mode;
    this.input.setDefaultCursor(mode ? 'crosshair' : 'default');
    this.events.emit('cursorMode', mode);
  }

  onKeyDown(e) {
    Sfx.resume();
    if (this.ended) return;
    const code = e.code;
    const mod = e.ctrlKey || e.shiftKey;
    if (code === 'Escape') {
      if (this.hero.aiming) this.hero.aiming = null;
      else if (this.build.placing) this.build.cancel();
      else if (this.cursorMode) this.setCursorMode(null);
      else if (this.build.selected) this.build.select(null);
      else this.togglePause();
      return;
    }
    if (code === 'KeyP') { this.togglePause(); return; }
    if (code === 'KeyM') { Settings.toggle('mute'); this.events.emit('settingsChanged'); return; }
    if (code === 'Space') { this.spaceHeld = true; return; }
    if (this.paused || this.picks.choices) return;

    const skillKey = { KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R' }[code];
    if (skillKey) {
      if (e.repeat || mod) return;
      const w = this.pointerWorld();
      this.hero.pressSkill(skillKey, w.x, w.y);
      if (this.hero.aiming) { this.build.cancel(); if (this.cursorMode) this.setCursorMode(null); }
      return;
    }
    switch (code) {
      case 'KeyA': if (this.hero.alive) this.setCursorMode('attack'); break;
      case 'KeyS': this.hero.commandStop(); this.setCursorMode(null); break;
      case 'KeyV': this.ui.toggleBuildPanel(); break;
      case 'KeyU': this.upgradeKeep(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
        const n = code.slice(-1);
        const type = Object.keys(CONFIG.buildings).find(k => CONFIG.buildings[k].key === n);
        if (type) { this.build.startPlacing(type); this.ui.toggleBuildPanel(true); }
        break;
      }
    }
  }

  onKeyUp(e) {
    const code = e.code;
    if (code === 'Space') this.spaceHeld = false;
  }

  togglePause(force) {
    this.paused = force != null ? force : !this.paused;
    this.tweens.timeScale = this.paused ? 0 : 1;
    this.events.emit('pauseChanged', this.paused);
  }

  upgradeKeep() {
    const next = this.keep.nextTierDef;
    if (!next) { Sfx.play('error'); this.events.emit('notice', 'Keep is at max tier'); return; }
    if (!this.economy.spend(next.cost)) return;
    this.keep.upgrade();
    this.events.emit('keepUpgraded', this.keep.tier);
    this.events.emit('selectionChanged');
  }

  // ---------------------------------------------------------------- camera
  clampCamTarget() {
    this.camTarget.x = Phaser.Math.Clamp(this.camTarget.x, 0, CONFIG.WORLD_W - CONFIG.VIEW_W);
    this.camTarget.y = Phaser.Math.Clamp(this.camTarget.y, 0, CONFIG.WORLD_H - CONFIG.VIEW_H);
  }

  // Centre the camera target on the hero (or the Keep while the hero is dead).
  jumpToHero() {
    const h = this.hero, k = this.keep;
    const fx = h.alive ? h.x : k.x, fy = h.alive ? h.y : k.y;
    this.camTarget.x = fx - CONFIG.VIEW_W / 2;
    this.camTarget.y = fy - CONFIG.VIEW_H / 2;
    this.clampCamTarget();
  }

  jumpCameraTo(wx, wy) {
    this.camTarget.x = wx - CONFIG.VIEW_W / 2;
    this.camTarget.y = wy - CONFIG.VIEW_H / 2;
    this.clampCamTarget();
    this.cameras.main.setScroll(this.camTarget.x, this.camTarget.y);
  }

  updateCamera(dt) {
    const C = CONFIG.camera, cam = this.cameras.main;
    if (this.spaceHeld) {
      this.jumpToHero();
    } else if (!this.dragPan) {
      // free camera: edge pan (middle-drag and the minimap also move it)
      const p = this.input.activePointer;
      let mx = 0, my = 0;
      if (this.pointerInside && document.hasFocus()) {
        if (p.x <= C.edgeSize) mx -= 1;
        if (p.x >= CONFIG.VIEW_W - C.edgeSize) mx += 1;
        if (p.y <= C.edgeSize) my -= 1;
        if (p.y >= CONFIG.VIEW_H - C.edgeSize) my += 1;
      }
      this.camTarget.x += mx * C.edgeSpeed * dt;
      this.camTarget.y += my * C.edgeSpeed * dt;
      this.clampCamTarget();
    }
    const k = Math.min(1, dt * C.smoothing);
    cam.setScroll(cam.scrollX + (this.camTarget.x - cam.scrollX) * k, cam.scrollY + (this.camTarget.y - cam.scrollY) * k);
  }

  // ---------------------------------------------------------------- spawning & bookkeeping
  spawnEnemy(type, x, y, mods, camp) {
    const e = new Enemy(this, type, x, y, mods, camp);
    this.enemies.push(e);
    if (type === 'boss') {
      this.events.emit('notice', 'BOSS INCOMING!');
      Feel.shake(0.006, 300);
    }
    return e;
  }

  spawnAlly(kind, x, y, tier, lane) {
    const p = this.pathing.nearestWalkable(x, y, 10);
    const a = new Ally(this, kind, p.x, p.y, tier, lane);
    this.allies.push(a);
    Feel.ring(a.x, a.y, 24, 0x4a8fe0, { duration: 300, width: 2 });
    return a;
  }

  spawnProjectile(o) {
    const p = new Projectile(this, o);
    this.projectiles.push(p);
    return p;
  }

  addBuilding(b) {
    this.buildings.push(b);
    this.pathing.occupyBuilding(b);
    this.events.emit('buildingsChanged');
  }

  removeBuilding(b) {
    this.pathing.freeBuilding(b);
    b.destroy();
    this.buildings = this.buildings.filter(x => x !== b);
    if (this.build.selected === b) this.build.select(null);
    this.events.emit('buildingsChanged');
  }

  onEnemyKilled(e, killer) {
    this.stats.kills++;
    if (killer === this.hero) { this.hero.kills++; if (this.hero.kit.onKill) this.hero.kit.onKill(e); }
    this.economy.add(e.gold, e.x, e.y - e.radius - 4);
    if (this.recorder) this.recorder.goldEarned('bounty', e.gold);
    const h = this.hero;
    if (h.alive && Math.hypot(h.x - e.x, h.y - e.y) <= CONFIG.heroCommon.xpRadius) this.leveling.addXp(e.xp);
    else this.leveling.addXp(e.xp * 0.25);
  }

  ping(x, y, color) { this.pings.push({ x, y, color, t: 2.5 }); }

  later(delay, fn) { this.timers.push({ t: delay, fn }); }

  gameOver() {
    if (this.ended) return;
    this.ended = true;
    if (this.simJob) { SimRunner.endRun(this, 'keep'); return; }
    const s = this.stats, sc = CONFIG.score;
    const score = Math.round((s.wavesCleared * sc.perWave + s.kills * sc.perKill + this.hero.level * sc.perLevel + s.time * sc.perSecond) * this.diff.scoreMul);
    const key = 'cd_best_' + this.diffKey;
    let best = 0;
    try { best = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { /* ignore */ }
    const newBest = score > best;
    if (newBest) { try { localStorage.setItem(key, String(score)); } catch (e) { /* ignore */ } best = score; }
    const data = {
      hero: this.heroKey, difficulty: this.diffKey, waves: s.wavesCleared, reached: this.waves.wave,
      time: s.time, kills: s.kills, level: this.hero.level, score, best, newBest,
    };
    this.cameras.main.flash(400, 255, 80, 60);
    this.time.delayedCall(1800, () => {
      this.scene.stop('UIScene');
      this.scene.start('GameOverScene', data);
    });
  }

  // ---------------------------------------------------------------- loop
  update(time, delta) {
    if (this.simJob) { this.simUpdate(); return; }
    const realDt = Math.min(delta / 1000, 0.05);
    this.updateCamera(realDt);
    this.pings = this.pings.filter(p => (p.t -= realDt) > 0);
    if (this.ended) { this.drawOverlays(); return; }
    if (this.paused || this.picks.choices) { this.drawOverlays(); return; }   // level-up item pick pauses too
    if (this.hitstop > 0) { this.hitstop -= realDt; this.drawOverlays(); return; }
    this.step(realDt);
    this.drawOverlays();
  }

  // Balance simulation: as many fixed steps as fit in the frame budget. Hitstop and pause don't apply.
  simUpdate() {
    const S = CONFIG.sim, t0 = performance.now();
    try {
      while (!this.ended && performance.now() - t0 < S.frameBudgetMs) {
        this.bot.update(S.step);
        this.step(S.step);
        this.recorder.update(S.step);
        if (!this.ended) SimRunner.checkRunEnd(this);
      }
    } catch (err) {
      // a game exception ends this run (reported as 'error') instead of freezing the whole simulation
      console.error('[sim] run crashed', this.simJob, err);
      this.recorder.error = String(err && err.stack || err).split('\n').slice(0, 3).join(' | ');
      if (!this.ended) SimRunner.endRun(this, 'error');
    }
  }

  // One simulation tick.
  step(dt) {
    this.stats.time += dt;

    // timers
    if (this.timers.length) {
      const due = [];
      this.timers = this.timers.filter(t => { t.t -= dt; if (t.t <= 0) { due.push(t); return false; } return true; });
      due.forEach(t => t.fn());
    }

    this.waves.update(dt);

    // hold right-click: keep following the cursor
    const ptr = this.input.activePointer;
    if (this.rightHeld && ptr.rightButtonDown() && this.hero.alive && !this.ui.isOverUI(ptr.x, ptr.y)) {
      this.followT -= dt;
      if (this.followT <= 0) {
        this.followT = 0.07;
        const w = this.pointerWorld();
        if (!this.hero.order || this.hero.order.type === 'move') this.hero.commandMove(w.x, w.y);
      }
    } else this.rightHeld = false;

    this.hero.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const a of this.allies) a.update(dt);
    for (const b of this.buildings) b.update(dt);
    for (const t of this.towers) t.update(dt);
    this.keep.update(dt);
    for (const p of this.projectiles) p.update(dt);

    separateUnits(this.enemies, 90, dt);
    separateUnits(this.allies, 90, dt);

    if (this.enemies.some(e => !e.alive)) this.enemies = this.enemies.filter(e => e.alive);
    if (this.allies.some(a => !a.alive)) this.allies = this.allies.filter(a => a.alive);
    if (this.projectiles.some(p => !p.alive)) this.projectiles = this.projectiles.filter(p => p.alive);
  }

  drawOverlays() {
    const g = this.hpG;
    g.clear();
    const bar = (x, y, w, h, frac, color, bg = 0x000000) => {
      g.fillStyle(bg, 0.7); g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      g.fillStyle(color, 1); g.fillRect(x - w / 2, y, w * Phaser.Math.Clamp(frac, 0, 1), h);
    };
    const cam = this.cameras.main;
    const vis = (x, y) => x > cam.scrollX - 60 && x < cam.scrollX + CONFIG.VIEW_W + 60 && y > cam.scrollY - 60 && y < cam.scrollY + CONFIG.VIEW_H + 60;
    for (const e of this.enemies) {
      if (!e.alive || !vis(e.x, e.y)) continue;
      if (e.hp < e.maxHp || e.isBoss) bar(e.x, e.y - e.radius - 8, e.isBoss ? 70 : Math.max(20, e.radius * 2.2), e.isBoss ? 6 : 4, e.hp / e.maxHp, e.isBoss ? 0xff3030 : e.neutral ? 0x5fd3c6 : 0xe04040);
      if (e.stunned) { g.fillStyle(e.status.frozen ? 0x9fe9ff : 0xffd23f, 1); g.fillCircle(e.x - 5, e.y - e.radius - 14, 2.5); g.fillCircle(e.x + 5, e.y - e.radius - 14, 2.5); }
      if (e.status.tauntT > 0) { g.fillStyle(0xffb347, 1); g.fillRect(e.x - 1.5, e.y - e.radius - 20, 3, 7); g.fillRect(e.x - 1.5, e.y - e.radius - 11, 3, 2.5); }
    }
    for (const a of this.allies) {
      if (!a.alive || !vis(a.x, a.y)) continue;
      if (a.hp < a.maxHp) bar(a.x, a.y - a.radius - 7, 20, 3, a.hp / a.maxHp, 0x4ade80);
      if (a.status.atkSpeedT > 0) { g.lineStyle(1.5, 0xffb347, 0.8); g.strokeCircle(a.x, a.y, a.radius + 3); }
    }
    const k = this.keep;
    bar(k.x, k.ry - 22, 140, 8, k.hp / k.maxHp, 0x4ade80);
    for (const s of this.towers) if (s.alive && vis(s.x, s.y)) bar(s.x, s.y - s.radius - 10, 56, 5, s.hp / s.maxHp, 0x4ade80);
    for (const s of this.buildings) if (s.alive && s.hp < s.maxHp && vis(s.x, s.y)) bar(s.x, s.y - s.radius - 6, 44, 4, s.hp / s.maxHp, 0x4ade80);
    const h = this.hero;
    if (h.alive) {
      bar(h.x, h.y - h.radius - 12, 44, 5, h.hp / h.maxHp, 0x22c55e);
      if (h.status.armorT > 0) { g.lineStyle(3, 0xffb347, 0.7); g.strokeCircle(h.x, h.y, h.radius + 5); }
      if (h.windCloakT > 0) { g.lineStyle(2, 0x9be8c9, 0.7); g.strokeCircle(h.x, h.y, h.radius + 8); }
      if (h.stunned) { g.fillStyle(0xffd23f, 1); g.fillCircle(h.x - 6, h.y - h.radius - 20, 3); g.fillCircle(h.x + 6, h.y - h.radius - 20, 3); }
    }

    // indicators
    const ig = this.indG;
    ig.clear();
    const w = this.pointerWorld();
    if (h.alive) {
      if (h.aiming) h.kit.drawIndicator(ig, h.aiming, w.x, w.y);
      // move destination
      if (h.order && (h.order.type === 'move' || h.order.type === 'amove')) {
        ig.lineStyle(1.5, h.order.type === 'amove' ? 0xff4040 : 0x44ff66, 0.5);
        ig.strokeCircle(h.order.x, h.order.y, 6);
      }
      if (h.order && h.order.type === 'attack' && h.order.target.alive) {
        ig.lineStyle(2, 0xff4040, 0.8); ig.strokeCircle(h.order.target.x, h.order.target.y, h.order.target.radius + 5);
      }
    }
    if (this.cursorMode === 'attack') {
      ig.lineStyle(2, 0xff4040, 0.9); ig.strokeCircle(w.x, w.y, 12);
      ig.lineBetween(w.x - 16, w.y, w.x + 16, w.y); ig.lineBetween(w.x, w.y - 16, w.x, w.y + 16);
    } else {
      const e = this.enemyAt(w.x, w.y);
      if (e) { ig.lineStyle(2, 0xff4040, 0.6); ig.strokeCircle(e.x, e.y, e.radius + 4); }
    }
    this.build.drawGhost(ig, w.x, w.y);
    this.drawBuildGrid();
    const sel = this.build.selected;
    if (sel && sel.alive) {
      if (sel === this.keep) {
        ig.lineStyle(2, 0xffd23f, 0.9); ig.strokeRect(k.rx - 8, k.ry - 8, k.rw + 16, k.rh + 16);
        if (k.tierDef.attack) { ig.lineStyle(1.5, 0xffd23f, 0.3); ig.strokeCircle(k.x, k.y, k.tierDef.attack.range); }
      } else {
        const s = CONFIG.px(sel.fp);
        ig.lineStyle(2, 0xffd23f, 0.9); ig.strokeRect(CONFIG.px(sel.tx) - 2, CONFIG.px(sel.ty) - 2, s + 4, s + 4);
        if (sel.range) { ig.lineStyle(1.5, 0xffd23f, 0.4); ig.strokeCircle(sel.x, sel.y, sel.range); }
      }
    }
  }
}
