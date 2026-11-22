// World simulation, input and camera.

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.heroKey = data.hero || 'warrior';
    this.diffKey = data.difficulty || 'medium';
    this.diff = CONFIG.difficulty[this.diffKey];
  }

  create() {
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
    this.projectiles = [];
    this.stats = { kills: 0, time: 0, wavesCleared: 0 };
    this.cursorMode = null;      // null | 'attack' | 'rally'
    this.spaceHeld = false;      // hold Space to look around (camera is otherwise locked on the hero)
    this.rightHeld = false;
    this.followT = 0;
    this.pointerInside = false;

    this.pathing = new Pathing(this);
    this.drawMap();

    this.keep = new Keep(this);
    this.hero = new Hero(this, this.heroKey, this.keep.rx + this.keep.rw + 60, this.keep.y);
    this.economy = new Economy(this, this.diff.startGold);
    this.leveling = new Leveling(this, this.hero);
    this.shop = new Shop(this, this.hero);
    this.build = new BuildSystem(this);
    this.allyCommand = new AllyCommand(this);
    this.waves = new WaveManager(this, this.diff);

    this.hpG = this.add.graphics().setDepth(50);
    this.indG = this.add.graphics().setDepth(45);

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, CONFIG.WORLD_W, CONFIG.WORLD_H);
    cam.setBackgroundColor('#1b2a1a');
    this.camTarget = { x: 0, y: 0 };
    this.jumpToHero();
    cam.setScroll(this.camTarget.x, this.camTarget.y);

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
    const T = CONFIG.TILE, W = CONFIG.MAP_W, H = CONFIG.MAP_H, p = this.pathing;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const rnd = new Phaser.Math.RandomDataGenerator(['castle']);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = p.tileType(x, y);
        let c;
        if (t === TILE_T.TERRAIN) {
          const v = rnd.between(0, 2);
          c = [0x2c4a2a, 0x2f4e2c, 0x2a4627][v];
        } else if (t === TILE_T.PATH) {
          c = (x + y) % 2 ? 0x8d7b58 : 0x86754f;
          if (x >= CONFIG.map.spawnZoneX) c = (x + y) % 2 ? 0x8a5a4a : 0x845446;
        } else if (t === TILE_T.CONNECTOR) {
          c = (x + y) % 2 ? 0x9b8a66 : 0x94835e;
        } else c = 0x3a3f48;
        g.fillStyle(c, 1); g.fillRect(x * T, y * T, T, T);
      }
    }
    // lane edges
    g.lineStyle(2, 0x5f5238, 0.8);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!p.isLane(x, y)) continue;
        if (!p.isLane(x, y - 1) && p.tileType(x, y - 1) !== TILE_T.KEEP) g.lineBetween(x * T, y * T, x * T + T, y * T);
        if (!p.isLane(x, y + 1) && p.tileType(x, y + 1) !== TILE_T.KEEP) g.lineBetween(x * T, y * T + T, x * T + T, y * T + T);
        if (!p.isLane(x - 1, y) && p.tileType(x - 1, y) !== TILE_T.KEEP) g.lineBetween(x * T, y * T, x * T, y * T + T);
        if (!p.isLane(x + 1, y) && x + 1 < W) g.lineBetween(x * T + T, y * T, x * T + T, y * T + T);
      }
    }
    // connector markings (always open)
    g.lineStyle(2, 0xe8d9a0, 0.35);
    for (const r of CONFIG.map.connectors) {
      for (let y = r.y; y < r.y + r.h; y += 2) {
        g.lineBetween((r.x + 0.5) * T, y * T + 6, (r.x + 0.5) * T, y * T + 26);
        g.lineBetween((r.x + r.w - 0.5) * T, y * T + 6, (r.x + r.w - 0.5) * T, y * T + 26);
      }
    }
    // decorative rocks/trees on terrain far from lanes
    for (let i = 0; i < 260; i++) {
      const x = rnd.between(0, W - 1), y = rnd.between(0, H - 1);
      let near = false;
      for (let yy = y - 3; yy <= y + 3 && !near; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (p.isLane(xx, yy) || p.tileType(xx, yy) === TILE_T.KEEP) { near = true; break; }
      if (near) continue;
      const cx = x * T + rnd.between(6, 26), cy = y * T + rnd.between(6, 26);
      if (rnd.frac() < 0.7) {
        g.fillStyle(0x1f3a1d, 1); g.fillCircle(cx, cy, rnd.between(9, 16));
        g.fillStyle(0x264a22, 1); g.fillCircle(cx - 3, cy - 3, rnd.between(5, 9));
      } else {
        g.fillStyle(0x5d6168, 1); g.fillCircle(cx, cy, rnd.between(5, 10));
        g.fillStyle(0x777b82, 1); g.fillCircle(cx - 2, cy - 2, 3);
      }
    }
    // spawn portals
    for (const l of CONFIG.map.lanes) {
      const sx = l.spawn.x * T, sy = l.spawn.y * T;
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
        if (!this.spaceHeld) return;
        this.dragPan = { x: pointer.x, y: pointer.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY };
        return;
      }
      if (this.paused) return;
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
        if (this.cursorMode === 'rally') {
          this.allyCommand.setRally(wx, wy);
          this.setCursorMode(null);
          return;
        }
        this.selectAt(wx, wy);
      }
    });

    this.input.on('pointermove', (pointer) => {
      this.pointerInside = true;
      if (this.dragPan) {
        if (!pointer.middleButtonDown() || !this.spaceHeld) { this.dragPan = null; return; }
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
      else if (this.ui.shopOpen) this.ui.toggleShop(false);
      else if (this.build.selected) this.build.select(null);
      else this.togglePause();
      return;
    }
    if (code === 'KeyP') { this.togglePause(); return; }
    if (code === 'KeyM') { Settings.toggle('mute'); this.events.emit('settingsChanged'); return; }
    if (code === 'Space') { this.spaceHeld = true; return; }
    if (this.paused) return;

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
      case 'KeyF':
        if (this.cursorMode === 'rally' || (e.repeat === false && this.lastF && this.time.now - this.lastF < 400)) {
          this.allyCommand.setAuto(); this.setCursorMode(null); this.lastF = 0;
        } else { this.setCursorMode('rally'); this.lastF = this.time.now; }
        break;
      case 'KeyB': this.ui.toggleShop(); break;
      case 'KeyV': this.ui.toggleBuildPanel(); break;
      case 'KeyU': this.upgradeKeep(); break;
      case 'KeyN': case 'Enter': this.waves.startWave(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': {
        const n = code.slice(-1);
        const type = Object.keys(CONFIG.buildings).find(k => CONFIG.buildings[k].key === n);
        if (type) { this.build.startPlacing(type); this.ui.toggleBuildPanel(true); }
        break;
      }
    }
  }

  onKeyUp(e) {
    const code = e.code;
    if (code === 'Space') { this.spaceHeld = false; this.dragPan = null; }
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

  // Camera follows the hero (or the Keep while the hero is dead).
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
    if (!this.spaceHeld) {
      this.jumpToHero();
    } else if (!this.dragPan) {
      // free look while Space is held: edge pan (middle-drag and minimap also work)
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
  spawnEnemy(type, x, y, mods) {
    const e = new Enemy(this, type, x, y, mods);
    this.enemies.push(e);
    if (type === 'boss') {
      this.events.emit('notice', 'BOSS INCOMING!');
      Feel.shake(0.006, 300);
    }
    return e;
  }

  spawnAlly(kind, x, y, tier) {
    const p = this.pathing.nearestWalkable(x, y, 10);
    const a = new Ally(this, kind, p.x, p.y, tier);
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
    this.pathing.building[this.pathing.idx(b.tx, b.ty)] = b;
    this.events.emit('buildingsChanged');
  }

  removeBuilding(b) {
    const i = this.pathing.idx(b.tx, b.ty);
    if (this.pathing.building[i] === b) this.pathing.building[i] = null;
    b.destroy();
    this.buildings = this.buildings.filter(x => x !== b);
    if (this.build.selected === b) this.build.select(null);
    this.events.emit('buildingsChanged');
  }

  onEnemyKilled(e) {
    this.stats.kills++;
    this.economy.add(e.gold, e.x, e.y - e.radius - 4);
    const h = this.hero;
    if (h.alive && Math.hypot(h.x - e.x, h.y - e.y) <= CONFIG.heroCommon.xpRadius) this.leveling.addXp(e.xp);
    else this.leveling.addXp(e.xp * 0.25);
  }

  ping(x, y, color) { this.pings.push({ x, y, color, t: 2.5 }); }

  later(delay, fn) { this.timers.push({ t: delay, fn }); }

  gameOver() {
    if (this.ended) return;
    this.ended = true;
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
    const realDt = Math.min(delta / 1000, 0.05);
    this.updateCamera(realDt);
    this.pings = this.pings.filter(p => (p.t -= realDt) > 0);
    if (this.ended) { this.drawOverlays(); return; }
    if (this.paused) { this.drawOverlays(); return; }
    if (this.hitstop > 0) { this.hitstop -= realDt; this.drawOverlays(); return; }
    const dt = realDt;
    this.stats.time += dt;

    // timers
    if (this.timers.length) {
      const due = [];
      this.timers = this.timers.filter(t => { t.t -= dt; if (t.t <= 0) { due.push(t); return false; } return true; });
      due.forEach(t => t.fn());
    }

    this.waves.update(dt);
    this.allyCommand.update(dt);

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
    this.keep.update(dt);
    for (const p of this.projectiles) p.update(dt);

    separateUnits(this.enemies, 90, dt);
    separateUnits(this.allies, 90, dt);

    if (this.enemies.some(e => !e.alive)) this.enemies = this.enemies.filter(e => e.alive);
    if (this.allies.some(a => !a.alive)) this.allies = this.allies.filter(a => a.alive);
    if (this.projectiles.some(p => !p.alive)) this.projectiles = this.projectiles.filter(p => p.alive);

    this.drawOverlays();
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
      if (e.hp < e.maxHp || e.isBoss) bar(e.x, e.y - e.radius - 8, e.isBoss ? 70 : Math.max(20, e.radius * 2.2), e.isBoss ? 6 : 4, e.hp / e.maxHp, e.isBoss ? 0xff3030 : 0xe04040);
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
    } else if (this.cursorMode === 'rally') {
      ig.lineStyle(2, 0x4a8fe0, 0.9); ig.strokeCircle(w.x, w.y, 30);
      ig.lineBetween(w.x, w.y, w.x, w.y - 28);
      ig.fillStyle(0x4a8fe0, 0.9); ig.fillTriangle(w.x, w.y - 28, w.x + 16, w.y - 23, w.x, w.y - 18);
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
        const T = CONFIG.TILE;
        ig.lineStyle(2, 0xffd23f, 0.9); ig.strokeRect(sel.tx * T - 2, sel.ty * T - 2, T + 4, T + 4);
        if (sel.range) { ig.lineStyle(1.5, 0xffd23f, 0.4); ig.strokeCircle(sel.x, sel.y, sel.range); }
      }
    }
  }
}
