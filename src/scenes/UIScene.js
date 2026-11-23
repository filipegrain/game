// HUD overlay: top bar, hero panel, minimap, build panel, level-up item picks, tooltips, notices.

const FONT = 'Arial, Helvetica, sans-serif';
const UI_DEPTH = { panel: 10, content: 20, window: 50, tooltip: 100 };
const SKILL_KEYS = ['Q', 'W', 'E', 'R'];
const BUILD_TYPES = ['arrow', 'cannon', 'frost', 'barracks', 'mine'];
const PCT = (v) => Math.round(v * 100) + '%';
const STAT_FMT = {
  damage: v => '+' + +v.toFixed(2) + ' damage', hp: v => '+' + v + ' HP', armor: v => '+' + v + ' armor', speed: v => '+' + v + ' move speed',
  hpRegen: v => '+' + v + ' HP/s', attackSpeed: v => '+' + PCT(v) + ' attack speed', cdr: v => '-' + PCT(v) + ' cooldowns',
  lifesteal: v => PCT(v) + ' lifesteal', chain: v => 'attacks chain to ' + v + ' enemies', thorns: v => 'reflect ' + PCT(v) + ' melee damage',
  revive: v => 'revive, cooldown ' + Math.round(CONFIG.phoenixCooldown / v) + 's', skillDamage: v => '+' + PCT(v) + ' skill damage',
  windCloak: v => '+' + PCT(v) + ' speed for ' + CONFIG.windCloakTime + 's after Dash / Poison Pool', whirlChance: v => '+' + PCT(v) + ' Whirl chance', whirlRadius: v => '+' + PCT(v) + ' Whirl radius',
  dashRange: v => '+' + PCT(v) + ' Dash range', dashCd: v => '-' + v + 's Dash cooldown', killDamage: v => '+' + +v.toFixed(2) + ' damage per kill',
  rageTime: v => '+' + v + 's Rage', rageCd: v => '-' + v + 's Rage cooldown',
};
const ITEM_GRID = 16;   // owned-item icons shown (2 rows of 8)

class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  init(data) { this.gs = data.game; }

  create() {
    this.hero = this.gs.hero;
    this.regions = [];
    this.listeners = [];
    this.buildOpen = false;
    this.vignette = 0;
    this.lastKeepPing = 0;
    this.cache = {};
    this.input.mouse.disableContextMenu();

    this.createTopBar();
    this.createBottomPanel();
    this.createMinimap();
    this.createRightColumn();
    this.createBuildPanel();
    this.createSelectionPanel();
    this.createPicks();
    this.createOverlays();
    this.createTooltip();

    const on = (name, fn) => { this.gs.events.on(name, fn, this); this.listeners.push([name, fn]); };
    on('notice', (msg) => this.notice(msg));
    on('waveStart', (n, plan) => this.banner('WAVE ' + n, plan.bosses ? 'BOSS WAVE — ' + plan.lanes.map(l => CONFIG.map.lanes[l].name).join(' · ') : plan.lanes.map(l => CONFIG.map.lanes[l].name).join(' · '), plan.bosses ? '#ff5050' : '#ffffff'));
    on('waveCleared', (n, gold) => this.banner('WAVE ' + n + ' CLEARED', '+' + gold + ' gold', '#7cf29a'));
    on('levelUp', (lv, unlocked) => {
      if (unlocked && unlocked.length) this.notice(unlocked.join('\n'), 3000);   // the pick panel is the level-up banner
      Feel.popScale(this.portraitLevel, 1.6, 150);
    });
    on('goldChanged', (amt) => { if (amt > 0) Feel.popScale(this.goldText, 1.25, 80); });
    on('keepHit', () => {
      this.vignette = Math.min(0.55, this.vignette + 0.25);
      if (this.time.now - this.lastKeepPing > 2500) { this.lastKeepPing = this.time.now; this.gs.ping(this.gs.keep.x, this.gs.keep.y, 0xff3030); }
    });
    on('skillReady', (k) => { this.skillPulse[k] = 0.35; if (CONFIG.skills[this.hero.heroKey][k].cast !== 'passive') Sfx.play('ready'); });
    on('skillDenied', (k) => { this.skillDenied[k] = 0.25; });
    on('pauseChanged', (p) => this.pauseLayer.setVisible(p));
    on('selectionChanged', () => this.refreshSelection());
    on('itemChoices', () => this.refreshPicks());
    on('inventoryChanged', () => this.refreshPicks());
    on('cursorMode', () => { });
    on('keepUpgraded', () => this.refreshBuildPanel());
    on('settingsChanged', () => this.refreshToggles());
    this.events.once('shutdown', () => {
      for (const [n, f] of this.listeners) this.gs.events.off(n, f, this);
      this.listeners = [];
    });

    this.time.delayedCall(400, () => this.notice(this.hero.heroKey === 'warrior'
      ? 'Warrior: Q, W and E are passive. R dashes toward the cursor. Level up to pick items.'
      : 'Skills: press W/E/R to aim, left-click to cast (right-click / Esc cancels). Level up to pick items.', 5000));
  }

  // ------------------------------------------------------------------ helpers
  region(x, y, w, h, visibleFn) { const r = { x, y, w, h, visible: visibleFn || (() => true) }; this.regions.push(r); return r; }

  isOverUI(x, y) {
    for (const r of this.regions) if (r.visible() && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    return false;
  }

  text(x, y, str, size = 14, color = '#ffffff', opts = {}) {
    return this.add.text(x, y, str, Object.assign({ fontFamily: FONT, fontSize: size + 'px', color }, opts)).setDepth(UI_DEPTH.content);
  }

  setText(obj, key, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    obj.setText(val);
  }

  button(x, y, w, h, label, onClick, opts = {}) {
    const color = opts.color || 0x2a3140;
    const bg = this.add.rectangle(x, y, w, h, color, opts.alpha || 1).setOrigin(0).setStrokeStyle(2, opts.stroke || 0x4b5563)
      .setInteractive({ useHandCursor: true }).setDepth(opts.depth || UI_DEPTH.content);
    const txt = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: (opts.size || 13) + 'px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5).setDepth((opts.depth || UI_DEPTH.content) + 1);
    const btn = { bg, txt, color, enabled: true };
    bg.on('pointerdown', (p) => {
      if (!p.leftButtonDown()) return;
      Sfx.resume();
      if (!btn.enabled && !opts.clickDisabled) { Sfx.play('error'); return; }
      Sfx.play('click');
      onClick(p);
    });
    bg.on('pointerover', () => { bg.setFillStyle(opts.hover || 0x3b4557, opts.alpha || 1); if (opts.tip) this.showTip(opts.tip()); });
    bg.on('pointerout', () => { bg.setFillStyle(btn.color, opts.alpha || 1); this.hideTip(); });
    btn.setVisible = (v) => { bg.setVisible(v); txt.setVisible(v); return btn; };
    btn.setColor = (c) => { btn.color = c; bg.setFillStyle(c, opts.alpha || 1); };
    return btn;
  }

  panelBg(x, y, w, h, alpha = 0.88) {
    const g = this.add.graphics().setDepth(UI_DEPTH.panel);
    g.fillStyle(0x0f131a, alpha); g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(2, 0x3a4252, 1); g.strokeRoundedRect(x, y, w, h, 8);
    return g;
  }

  // ------------------------------------------------------------------ top bar
  createTopBar() {
    const g = this.add.graphics().setDepth(UI_DEPTH.panel);
    g.fillStyle(0x0f131a, 0.9); g.fillRect(0, 0, 1280, 40);
    g.lineStyle(2, 0x3a4252, 1); g.lineBetween(0, 40, 1280, 40);
    g.fillStyle(0xffd23f, 1); g.fillCircle(22, 20, 8); g.lineStyle(2, 0xb8920a, 1); g.strokeCircle(22, 20, 8);
    this.region(0, 0, 1280, 42);
    this.goldText = this.text(36, 20, '0', 18, '#ffd23f', { fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.waveText = this.text(130, 20, 'Wave 0', 16, '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.phaseText = this.text(230, 20, '', 14, '#cbd5e1').setOrigin(0, 0.5);
    this.nextText = this.text(450, 20, '', 14, '#ff8a8a').setOrigin(0, 0.5);
    this.startBtn = this.button(640, 6, 180, 28, 'Start Next Wave (N)', () => this.gs.waves.startWave(), {
      color: 0x7a2a2a, hover: 0x9a3a3a, stroke: 0xff6060,
      tip: () => 'Start the next wave now.\nBonus: ' + CONFIG.waves.earlyGoldPerSec + ' gold per second remaining.',
    });
    this.text(845, 20, 'KEEP', 13, '#9ca3af', { fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.keepBarG = this.add.graphics().setDepth(UI_DEPTH.content);
    this.keepHpText = this.text(990, 20, '', 12, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.muteBtn = this.button(1132, 6, 44, 28, '', () => { Settings.toggle('mute'); this.refreshToggles(); }, { size: 11, tip: () => 'Sound on/off (M)' });
    this.shakeBtn = this.button(1180, 6, 50, 28, '', () => { Settings.toggle('shake'); this.refreshToggles(); }, { size: 11, tip: () => 'Screen shake on/off' });
    this.pauseBtn = this.button(1234, 6, 40, 28, 'II', () => this.gs.togglePause(), { size: 13, tip: () => 'Pause (P / Esc)' });
    this.refreshToggles();
  }

  refreshToggles() {
    this.muteBtn.txt.setText(Settings.data.mute ? 'SND\noff' : 'SND\non').setFontSize(10);
    this.shakeBtn.txt.setText(Settings.data.shake ? 'SHAKE\non' : 'SHAKE\noff').setFontSize(10);
  }

  // ------------------------------------------------------------------ bottom panel
  createBottomPanel() {
    const X = 230, Y = 606, W = 820, H = 110;
    this.panelBg(X, Y, W, H);
    this.region(X, Y, W, H);
    // portrait
    const pg = this.add.graphics().setDepth(UI_DEPTH.content);
    pg.fillStyle(0x1a2030, 1); pg.fillRoundedRect(X + 10, Y + 10, 84, 84, 6);
    pg.lineStyle(2, 0x4b5563, 1); pg.strokeRoundedRect(X + 10, Y + 10, 84, 84, 6);
    const hd = CONFIG.heroes[this.hero.heroKey];
    pg.fillStyle(hd.color, 1); pg.fillCircle(X + 52, Y + 46, 24);
    pg.lineStyle(3, 0xffffff, 1); pg.strokeCircle(X + 52, Y + 46, 24);
    pg.fillStyle(0xffffff, 1); pg.fillTriangle(X + 84, Y + 46, X + 72, Y + 38, X + 72, Y + 54);
    this.portraitLevel = this.text(X + 52, Y + 84, 'Lv 1', 14, '#ffd23f', { fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    // bars
    this.barsG = this.add.graphics().setDepth(UI_DEPTH.content);
    this.hpText = this.text(X + 236, Y + 20, '', 12, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(UI_DEPTH.content + 2);
    this.xpText = this.text(X + 106, Y + 62, '', 10, '#d8b4fe').setOrigin(0, 0);
    this.statText = this.text(X + 106, Y + 80, '', 11, '#9ca3af');
    // skills
    this.skillG = this.add.graphics().setDepth(UI_DEPTH.content);
    this.skillPulse = { Q: 0, W: 0, E: 0, R: 0 };
    this.skillDenied = { Q: 0, W: 0, E: 0, R: 0 };
    this.skillUI = {};
    SKILL_KEYS.forEach((k, i) => {
      const sx = X + 386 + i * 66, sy = Y + 22;
      const def = CONFIG.skills[this.hero.heroKey][k];
      const zone = this.add.zone(sx, sy, 58, 58).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(UI_DEPTH.content);
      zone.on('pointerdown', (p) => { if (p.leftButtonDown() && def.cast === 'auto') { this.hero.kit.toggleAuto(k); this.showTip(this.skillTip(k)); } });
      zone.on('pointerover', () => this.showTip(this.skillTip(k)));
      zone.on('pointerout', () => this.hideTip());
      const keyT = this.text(sx + 4, sy + 2, k, 13, '#ffffff', { fontStyle: 'bold' }).setDepth(UI_DEPTH.content + 3);
      const nameT = this.text(sx + 29, sy + 30, def.name.split(' ')[0], 10, '#e5e7eb').setOrigin(0.5).setDepth(UI_DEPTH.content + 3);
      const cdT = this.text(sx + 29, sy + 29, '', 18, '#ffffff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(UI_DEPTH.content + 4);
      const autoT = this.text(sx + 29, sy + 66, '', 10, '#7cf29a', { fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(UI_DEPTH.content + 3);
      this.skillUI[k] = { sx, sy, keyT, nameT, cdT, autoT };
    });
    // owned items: 2 rows of 8
    this.itemG = this.add.graphics().setDepth(UI_DEPTH.content);
    this.itemSlots = [];
    for (let i = 0; i < ITEM_GRID; i++) {
      const ix = X + 664 + (i % 8) * 19, iy = Y + 14 + Math.floor(i / 8) * 42;
      this.ownedItemZone(ix, iy, 18, 32, i).setDepth(UI_DEPTH.content);
      const lvT = this.text(ix + 9, iy + 19, '', 10, '#ffd23f', { fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 0).setDepth(UI_DEPTH.content + 3);
      this.itemSlots.push({ x: ix, y: iy, lvT });
    }
    this.text(X + 664, Y + 102, 'ITEMS', 9, '#6b7280').setOrigin(0, 1);
  }

  ownedItems() { return CONFIG.itemOrder.filter(k => this.hero.itemLevels[k]); }

  // hover zone over the i-th owned item icon (HUD row and pick panel)
  ownedItemZone(x, y, w, h, i) {
    const z = this.add.zone(x, y, w, h).setOrigin(0).setInteractive();
    z.on('pointerover', () => { const key = this.ownedItems()[i]; if (key) this.showTip(this.itemTip(key)); });
    z.on('pointerout', () => this.hideTip());
    return z;
  }

  skillTip(k) {
    const h = this.hero, def = CONFIG.skills[h.heroKey][k];
    const how = { aim: 'Press ' + k + ', then left-click to cast', instant: 'Press ' + k + ' to cast', passive: 'Passive', auto: 'Autocasts while attacking — ' + k + ' toggles (' + (h.kit.autoQ ? 'ON' : 'OFF') + ')' }[def.cast];
    const sc = CONFIG.heroCommon.skillScaling, lv = h.level - 1;
    let str = def.name + '  [' + k + ']\n' + def.desc + '\n' + how +
      (def.cd ? '\nCooldown ' + h.skillCooldown(k).toFixed(1) + 's' : '') +
      (lv > 0 ? '\nLevel bonus: +' + Math.round(sc.damage * lv * 100) + '% power, +' + Math.round(sc.radius * lv * 100) + '% area, +' + Math.round(sc.duration * lv * 100) + '% duration' : '');
    for (const m of def.milestones || []) str += '\n' + (h.level >= m.level ? '[x] ' : '[ ] ') + 'Lv ' + m.level + ': ' + m.text;
    return str;
  }

  statLines(key, lv) {
    const st = CONFIG.items[key].stats;
    return Object.keys(st).map(k => STAT_FMT[k] ? STAT_FMT[k](st[k] * lv) : '+' + st[k] * lv + ' ' + k);
  }

  itemTip(key) {
    const it = CONFIG.items[key], lv = this.gs.picks.level(key);
    return it.name + '  Lv ' + lv + '\n' + this.statLines(key, lv).join('\n');
  }

  // ------------------------------------------------------------------ minimap
  createMinimap() {
    const X = 8, Y = 598, W = 208, H = 117;
    this.mm = { X, Y, W, H, s: W / CONFIG.WORLD_W };
    this.region(X - 4, Y - 4, W + 8, H + 8);
    const bg = this.add.graphics().setDepth(UI_DEPTH.panel);
    bg.fillStyle(0x0f131a, 0.95); bg.fillRect(X - 4, Y - 4, W + 8, H + 8);
    bg.fillStyle(0x223a21, 1); bg.fillRect(X, Y, W, H);
    const p = this.gs.pathing, s = this.mm.s, T = CONFIG.TILE;
    for (let y = 0; y < CONFIG.MAP_H; y++) for (let x = 0; x < CONFIG.MAP_W; x++) {
      const t = p.tileType(x, y);
      if (t === TILE_T.TERRAIN) continue;
      bg.fillStyle(t === TILE_T.KEEP ? 0x9ca3af : t === TILE_T.CONNECTOR ? 0xa8976f : 0x8d7b58, 1);
      bg.fillRect(X + x * T * s, Y + y * T * s, T * s + 0.5, T * s + 0.5);
    }
    bg.lineStyle(2, 0x3a4252, 1); bg.strokeRect(X - 4, Y - 4, W + 8, H + 8);
    this.mmG = this.add.graphics().setDepth(UI_DEPTH.content);
    const zone = this.add.zone(X, Y, W, H).setOrigin(0).setInteractive().setDepth(UI_DEPTH.content);
    const toWorld = (p) => ({ x: (p.x - X) / s, y: (p.y - Y) / s });
    zone.on('pointerdown', (ptr) => {
      Sfx.resume();
      const w = toWorld(ptr);
      if (ptr.rightButtonDown()) {
        if (this.gs.hero.alive) {
          const dest = this.gs.hero.commandMove(w.x, w.y);
          if (dest) Feel.clickRing(dest.x, dest.y, 0x44ff66);
          this.gs.ping(dest.x, dest.y, 0x44ff66);
        }
      } else if (ptr.leftButtonDown() && this.gs.spaceHeld) { this.mmDrag = true; this.gs.jumpCameraTo(w.x, w.y); }
    });
    zone.on('pointermove', (ptr) => { if (this.mmDrag && ptr.leftButtonDown() && this.gs.spaceHeld) { const w = toWorld(ptr); this.gs.jumpCameraTo(w.x, w.y); } });
    this.input.on('pointerup', () => { this.mmDrag = false; });
  }

  drawMinimap(dt) {
    const g = this.mmG, { X, Y, W, H, s } = this.mm, gs = this.gs;
    g.clear();
    for (const b of gs.buildings) {
      g.fillStyle(b.type === 'mine' ? 0xffd23f : b.type === 'barracks' ? 0x4a8fe0 : 0xffffff, 1);
      g.fillRect(X + b.tx * CONFIG.TILE * s - 0.5, Y + b.ty * CONFIG.TILE * s - 0.5, 3, 3);
    }
    g.fillStyle(0x60a5fa, 1);
    for (const a of gs.allies) g.fillRect(X + a.x * s - 1, Y + a.y * s - 1, 2.5, 2.5);
    for (const e of gs.enemies) {
      g.fillStyle(e.isBoss ? 0xff0000 : 0xff5050, 1);
      const r = e.isBoss ? 3 : 1.5;
      g.fillRect(X + e.x * s - r, Y + e.y * s - r, r * 2, r * 2);
    }
    const h = gs.hero;
    if (h.alive) { g.fillStyle(0xffffff, 1); g.fillCircle(X + h.x * s, Y + h.y * s, 3.5); g.fillStyle(h.color, 1); g.fillCircle(X + h.x * s, Y + h.y * s, 2.2); }
    if (gs.allyCommand.rally) { g.fillStyle(0x4a8fe0, 1); g.fillTriangle(X + gs.allyCommand.rally.x * s, Y + gs.allyCommand.rally.y * s - 6, X + gs.allyCommand.rally.x * s + 5, Y + gs.allyCommand.rally.y * s - 4, X + gs.allyCommand.rally.x * s, Y + gs.allyCommand.rally.y * s - 2); }
    // next/active lanes
    const blink = (Math.sin(this.time.now / 180) + 1) / 2;
    for (const l of gs.waves.nextLanes || []) {
      const sp = gs.waves.spawnPoint(l);
      g.lineStyle(2, 0xff3030, 0.4 + blink * 0.6); g.strokeCircle(X + sp.x * s, Y + sp.y * s, 5);
    }
    for (const p of gs.pings) {
      const prog = 1 - (p.t % 1);
      g.lineStyle(2, p.color, 1 - prog); g.strokeCircle(X + p.x * s, Y + p.y * s, 3 + prog * 10);
    }
    const cam = gs.cameras.main;
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.strokeRect(X + cam.scrollX * s, Y + cam.scrollY * s, CONFIG.VIEW_W * s, CONFIG.VIEW_H * s);
  }

  // ------------------------------------------------------------------ right column + build panel
  createRightColumn() {
    const X = 1206, W = 68;
    this.region(X - 2, 48, W + 4, 192);
    this.colBtns = {
      build: this.button(X, 50, W, 56, 'BUILD\n(V)', () => this.toggleBuildPanel(), { size: 12, tip: () => 'Build panel (V)\nHotkeys 1-5 place buildings' }),
      keep: this.button(X, 110, W, 66, 'KEEP\n(U)', () => this.gs.upgradeKeep(), { size: 12, color: 0x4a3a10, hover: 0x6a5418, stroke: 0xffd23f, tip: () => this.keepTip() }),
      rally: this.button(X, 180, W, 56, 'RALLY\n(F)', () => {
        if (this.gs.cursorMode === 'rally') { this.gs.allyCommand.setAuto(); this.gs.setCursorMode(null); }
        else this.gs.setCursorMode('rally');
      }, { size: 12, color: 0x1e3a66, hover: 0x2a4f88, stroke: 0x4a8fe0, tip: () => 'Rally allies (F), then left-click a spot.\nF twice: back to automatic.\nMode: ' + this.gs.allyCommand.mode }),
    };
  }

  keepTip() {
    const k = this.gs.keep, n = k.nextTierDef;
    if (!n) return 'Keep tier ' + k.tier + ' (max)';
    const perks = {
      2: '+HP, Keep shoots arrows, 6 allies,\nunlocks Cannon + Barracks',
      3: '+HP, spawns Archers, 8 allies,\nunlocks Frost Tower + Gold Mine',
      4: '+HP, stronger Keep attack, 10 allies,\nbuilding level 3, Keep auto-repair',
    }[k.tier + 1];
    return 'Upgrade Keep to tier ' + (k.tier + 1) + ' (U) — ' + n.cost + 'g\n' + perks + '\nBuild area grows.';
  }

  createBuildPanel() {
    const X = 1126, W = 76;
    this.buildRegion = this.region(X - 2, 48, W + 4, BUILD_TYPES.length * 62 + 4, () => this.buildOpen);
    this.buildBtns = {};
    this.buildIconG = this.add.graphics().setDepth(UI_DEPTH.content + 2);
    BUILD_TYPES.forEach((type, i) => {
      const def = CONFIG.buildings[type];
      const y = 50 + i * 62;
      const b = this.button(X, y, W, 58, '', () => {
        if (this.gs.build.placing === type) this.gs.build.cancel(); else this.gs.build.startPlacing(type);
      }, { clickDisabled: true, tip: () => def.name + ' — ' + def.cost + 'g  [' + def.key + ']\n' + def.desc + (this.gs.build.isUnlocked(type) ? '' : '\nRequires Keep tier ' + def.tier) });
      b.txt.setPosition(X + W / 2, y + 44).setFontSize(10);
      b.costT = this.text(X + W - 4, y + 3, def.cost + 'g', 10, '#ffd23f').setOrigin(1, 0).setDepth(UI_DEPTH.content + 3);
      b.keyT = this.text(X + 4, y + 3, def.key, 10, '#9ca3af').setDepth(UI_DEPTH.content + 3);
      b.y = y;
      this.buildBtns[type] = b;
    });
    this.refreshBuildPanel();
  }

  refreshBuildPanel() {
    const g = this.buildIconG;
    g.clear();
    const X = 1126, W = 76;
    BUILD_TYPES.forEach((type) => {
      const b = this.buildBtns[type], def = CONFIG.buildings[type];
      const vis = this.buildOpen;
      b.setVisible(vis); b.costT.setVisible(vis); b.keyT.setVisible(vis);
      const unlocked = this.gs.build.isUnlocked(type);
      b.txt.setText(unlocked ? def.name : 'Tier ' + def.tier);
      b.txt.setColor(unlocked ? '#ffffff' : '#6b7280');
      const selected = this.gs.build.placing === type;
      b.bg.setStrokeStyle(2, selected ? 0x44ff66 : 0x4b5563);
      if (!vis) return;
      const cx = X + W / 2, cy = b.y + 22;
      const a = unlocked ? 1 : 0.35;
      if (type === 'barracks') { g.fillStyle(def.color, a); g.fillRect(cx - 14, cy - 9, 28, 18); }
      else if (type === 'mine') { g.fillStyle(def.color, a); g.fillRect(cx - 11, cy - 11, 22, 22); }
      else { g.fillStyle(def.color, a); g.fillRect(cx - 12, cy - 12, 24, 24); g.fillStyle(def.core, a); g.fillCircle(cx, cy, 6); }
    });
  }

  toggleBuildPanel(force) {
    this.buildOpen = force != null ? force : !this.buildOpen;
    if (!this.buildOpen) this.gs.build.cancel();
    this.refreshBuildPanel();
  }

  // ------------------------------------------------------------------ selection panel
  createSelectionPanel() {
    const X = 1056, Y = 600, W = 218, H = 116;
    this.selVisible = false;
    this.region(X, Y, W, H, () => this.selVisible);
    this.selBg = this.panelBg(X, Y, W, H).setVisible(false);
    this.selTitle = this.text(X + 10, Y + 8, '', 14, '#ffd23f', { fontStyle: 'bold' }).setVisible(false);
    this.selInfo = this.text(X + 10, Y + 28, '', 11, '#cbd5e1', { lineSpacing: 2 }).setVisible(false);
    this.selUp = this.button(X + 8, Y + 80, 98, 28, 'Upgrade', () => this.gs.build.upgradeSelected(), { size: 11, color: 0x24563a, hover: 0x2f7049, tip: () => this.selUpTip() });
    this.selSell = this.button(X + 112, Y + 80, 98, 28, 'Sell', () => this.gs.build.sellSelected(), { size: 11, color: 0x5a2a2a, hover: 0x7a3a3a, tip: () => 'Sell for 50% of total invested' });
    this.refreshSelection();
  }

  selUpTip() {
    const s = this.gs.build.selected;
    if (!s) return '';
    if (s === this.gs.keep) return this.keepTip();
    if (s.level >= 3) return 'Max level';
    if (!s.canUpgradeTier()) return 'Level 3 requires Keep tier ' + CONFIG.buildings.level3KeepTier;
    return 'Upgrade to level ' + (s.level + 1) + ' — ' + s.upgradeCost() + 'g\n+damage, +range, +fire rate';
  }

  refreshSelection() {
    const s = this.gs.build.selected;
    this.selVisible = !!(s && s.alive);
    [this.selBg, this.selTitle, this.selInfo].forEach(o => o.setVisible(this.selVisible));
    this.selUp.setVisible(this.selVisible);
    const isKeep = s === this.gs.keep;
    this.selSell.setVisible(this.selVisible && !isKeep);
  }

  updateSelection() {
    if (!this.selVisible) return;
    const s = this.gs.build.selected;
    if (!s || !s.alive) { this.refreshSelection(); return; }
    if (s === this.gs.keep) {
      const n = s.nextTierDef;
      this.setText(this.selTitle, 'selT', 'Keep — Tier ' + s.tier);
      this.setText(this.selInfo, 'selI', 'HP ' + Math.ceil(s.hp) + ' / ' + s.maxHp + '\nAllies ' + this.gs.allies.length + ' / ' + s.maxAllies() + '   Build radius ' + s.buildRadius +
        (s.tierDef.attack ? '\nArrows: ' + s.tierDef.attack.damage + ' dmg' : ''));
      this.setText(this.selUp.txt, 'selU', n ? 'Upgrade ' + n.cost + 'g' : 'Max tier');
      this.selUp.bg.setFillStyle(n && this.gs.economy.canAfford(n.cost) ? 0x24563a : 0x2a3140);
      return;
    }
    const d = s.def;
    this.setText(this.selTitle, 'selT', d.name + '  Lv ' + s.level);
    let info = '';
    if (d.range) info += 'DMG ' + Math.round(s.damage) + '  Range ' + s.range + '  Rate ' + s.rate.toFixed(1) + '/s';
    if (s.type === 'barracks') info += '+' + d.allyCap[s.level - 1] + ' ally cap, spawns ×' + d.spawnMul[s.level - 1];
    if (s.type === 'mine') info += '+' + d.income[s.level - 1] + ' gold per wave';
    info += '\nCannot be damaged';
    this.setText(this.selInfo, 'selI', info);
    const uc = s.upgradeCost();
    this.setText(this.selUp.txt, 'selU', uc == null ? 'Max' : (!s.canUpgradeTier() ? 'Need T4' : 'Up ' + uc + 'g'));
    this.setText(this.selSell.txt, 'selS', 'Sell +' + s.sellValue());
  }

  // ------------------------------------------------------------------ level-up item picks
  // Shown while GameScene offers choices (the game is paused until one is picked). No close button.
  createPicks() {
    const X = 330, Y = 70, W = 620, H = 470;
    this.region(X, Y, W, H, () => !!this.gs.picks.choices);
    const c = this.add.container(0, 0).setDepth(UI_DEPTH.window);
    this.picksC = c;
    const bg = this.add.graphics();
    bg.fillStyle(0x0f131a, 0.96); bg.fillRoundedRect(X, Y, W, H, 10);
    bg.lineStyle(2, 0xffd23f, 0.8); bg.strokeRoundedRect(X, Y, W, H, 10);
    c.add(bg);
    this.picksTitle = this.add.text(X + 20, Y + 14, '', { fontFamily: FONT, fontSize: '22px', color: '#ffd23f', fontStyle: 'bold' });
    c.add(this.picksTitle);
    this.picksMore = this.add.text(X + W - 20, Y + 20, '', { fontFamily: FONT, fontSize: '14px', color: '#9ca3af' }).setOrigin(1, 0);
    c.add(this.picksMore);
    this.pickIconG = this.add.graphics();
    this.pickCards = [];
    for (let i = 0; i < CONFIG.itemPickCount; i++) {
      const cx = X + 18 + i * 197, cy = Y + 56, cw = 188, ch = 290;
      const r = this.add.rectangle(cx, cy, cw, ch, 0x1a2030).setOrigin(0).setStrokeStyle(2, 0x3a4252).setInteractive({ useHandCursor: true });
      const card = { r, cx, cy, cw, key: null };
      r.on('pointerdown', (p) => { if (p.leftButtonDown() && card.key) { Sfx.resume(); this.hideTip(); this.gs.picks.pick(card.key); } });
      r.on('pointerover', () => r.setStrokeStyle(2, 0xffd23f));
      r.on('pointerout', () => r.setStrokeStyle(2, 0x3a4252));
      card.name = this.add.text(cx + cw / 2, cy + 76, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: cw - 16 } }).setOrigin(0.5, 0);
      card.lv = this.add.text(cx + cw / 2, cy + 102, '', { fontFamily: FONT, fontSize: '14px', color: '#7cf29a', fontStyle: 'bold' }).setOrigin(0.5, 0);
      card.stats = this.add.text(cx + 12, cy + 132, '', { fontFamily: FONT, fontSize: '13px', color: '#e5e7eb', lineSpacing: 4, wordWrap: { width: cw - 24 } });
      card.now = this.add.text(cx + 12, cy + 220, '', { fontFamily: FONT, fontSize: '11px', color: '#9ca3af', lineSpacing: 2, wordWrap: { width: cw - 24 } });
      c.add([r, card.name, card.lv, card.stats, card.now]);
      this.pickCards.push(card);
    }
    c.add(this.pickIconG);
    c.add(this.add.text(X + 20, Y + 360, 'OWNED — picking an owned item levels it up. Higher-level items show up more often.', { fontFamily: FONT, fontSize: '12px', color: '#9ca3af' }));
    this.pickInv = [];
    for (let i = 0; i < ITEM_GRID; i++) {
      const sx = X + 20 + (i % 8) * 72, sy = Y + 382 + Math.floor(i / 8) * 42;
      const z = this.ownedItemZone(sx, sy, 68, 38, i);
      const lvT = this.add.text(sx + 40, sy + 19, '', { fontFamily: FONT, fontSize: '12px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0, 0.5);
      c.add([z, lvT]);
      this.pickInv.push({ x: sx, y: sy, lvT });
    }
    c.setVisible(false);
  }

  refreshPicks() {
    const picks = this.gs.picks, choices = picks.choices;
    this.picksC.setVisible(!!choices);
    if (!choices) { this.hideTip(); return; }
    this.picksTitle.setText('LEVEL ' + (this.hero.level - picks.pending + 1) + ' — choose an item');
    this.picksMore.setText(picks.pending > 1 ? (picks.pending - 1) + ' more after this' : '');
    const g = this.pickIconG;
    g.clear();
    this.pickCards.forEach((card, i) => {
      const key = choices[i];
      card.key = key || null;
      [card.r, card.name, card.lv, card.stats, card.now].forEach(o => o.setVisible(!!key));
      if (!key) return;
      const it = CONFIG.items[key], lv = picks.level(key);
      card.name.setText(it.name);
      card.lv.setText(lv ? 'Lv ' + lv + '  →  ' + (lv + 1) : 'NEW');
      card.stats.setText(this.statLines(key, lv + 1).join('\n'));
      card.now.setText(lv ? 'Now:\n' + this.statLines(key, lv).join('\n') : '');
      this.drawItemIcon(g, card.cx + card.cw / 2, card.cy + 40, it, 22);
    });
    const owned = this.ownedItems();
    this.pickInv.forEach((slot, i) => {
      const k = owned[i];
      if (k) this.drawItemIcon(g, slot.x + 18, slot.y + 19, CONFIG.items[k], 13);
      slot.lvT.setText(k ? 'Lv ' + picks.level(k) : '');
    });
  }

  drawItemIcon(g, x, y, it, r) {
    g.fillStyle(0x000000, 0.3); g.fillCircle(x + 2, y + 2, r + 3);
    const pts = shapePoints(it.shape, r);
    g.fillStyle(it.color, 1);
    if (pts) g.fillPoints(pts.map(p => ({ x: p.x + x, y: p.y + y })), true);
    else g.fillCircle(x, y, r);
    g.lineStyle(1.5, 0xffffff, 0.6);
    if (pts) g.strokePoints(pts.map(p => ({ x: p.x + x, y: p.y + y })), true); else g.strokeCircle(x, y, r);
  }

  // ------------------------------------------------------------------ overlays
  createOverlays() {
    this.noticeText = this.text(640, 64, '', 16, '#ffffff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setDepth(UI_DEPTH.window + 5).setAlpha(0);
    this.bannerText = this.text(640, 170, '', 44, '#ffffff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(UI_DEPTH.window + 5).setAlpha(0);
    this.bannerSub = this.text(640, 214, '', 18, '#e5e7eb', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(UI_DEPTH.window + 5).setAlpha(0);
    this.hintText = this.text(640, 584, '', 14, '#ffffff', { stroke: '#000', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setDepth(UI_DEPTH.window);
    this.deathText = this.text(640, 300, '', 30, '#ff6b6b', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6, align: 'center' }).setOrigin(0.5).setDepth(UI_DEPTH.window);
    this.edgeG = this.add.graphics().setDepth(UI_DEPTH.panel - 1);
    this.edgeLabels = [0, 1, 2].map(() => this.text(0, 0, '', 12, '#ff8a8a', { fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(UI_DEPTH.panel - 1));
    this.vigG = this.add.graphics().setDepth(UI_DEPTH.panel - 2);

    this.pauseLayer = this.add.container(0, 0).setDepth(UI_DEPTH.window + 20).setVisible(false);
    const dim = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0);
    const pt = this.add.text(640, 120, 'PAUSED', { fontFamily: FONT, fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const help = this.add.text(640, 360, [
      'Right-click: move / attack (hold to follow cursor)      A + left-click: attack-move      S: stop',
      'Q W E R: aim a skill, then left-click to cast (right-click / Esc cancels). Warrior: Q/W/E passive, R dashes.',
      'Self-cast skills fire on key press. Mage Fire Bolt autocasts at your attack target (Q toggles).',
      'V: build panel   1-5: place building   Right-click / Esc: cancel',
      'Left-click building or Keep: select (upgrade / sell)   U: upgrade Keep   Buildings cannot be damaged',
      'Level up: pick 1 of 3 items (game pauses)   F: rally allies (F twice: auto)   N: start next wave early',
      'Camera follows the hero. Hold Space to look around (screen edges, middle-drag, minimap)',
      'P / Esc: pause   M: mute',
    ].join('\n'), { fontFamily: FONT, fontSize: '15px', color: '#e5e7eb', align: 'center', lineSpacing: 10 }).setOrigin(0.5);
    const resume = this.button(560, 540, 160, 40, 'Resume', () => this.gs.togglePause(false), { size: 16, depth: UI_DEPTH.window + 21 });
    const quit = this.button(560, 590, 160, 36, 'Quit to Menu', () => {
      this.gs.ended = true;
      this.gs.togglePause(false);
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    }, { size: 14, color: 0x5a2a2a, depth: UI_DEPTH.window + 21 });
    this.pauseLayer.add([dim, pt, help, resume.bg, resume.txt, quit.bg, quit.txt]);
    this.region(0, 0, 1280, 720, () => this.gs.paused);
  }

  notice(msg, dur = 2200) {
    this.noticeText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.noticeText);
    this.tweens.add({ targets: this.noticeText, alpha: 0, delay: dur, duration: 500 });
  }

  banner(title, sub, color = '#ffffff', dur = 1600) {
    this.bannerText.setText(title).setColor(color).setAlpha(1).setScale(1.4);
    this.bannerSub.setText(sub || '').setAlpha(1);
    this.tweens.killTweensOf([this.bannerText, this.bannerSub]);
    this.tweens.add({ targets: this.bannerText, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [this.bannerText, this.bannerSub], alpha: 0, delay: dur, duration: 500 });
  }

  createTooltip() {
    this.tipBg = this.add.graphics().setDepth(UI_DEPTH.tooltip).setVisible(false);
    this.tipText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', lineSpacing: 3 }).setDepth(UI_DEPTH.tooltip + 1).setVisible(false);
  }

  showTip(str) {
    if (!str) return;
    this.tipText.setText(str).setVisible(true);
    this.tipBg.setVisible(true);
    this.tipShown = true;
    this.positionTip();
  }

  hideTip() { this.tipShown = false; this.tipText.setVisible(false); this.tipBg.setVisible(false); }

  positionTip() {
    const p = this.input.activePointer;
    const w = this.tipText.width + 16, h = this.tipText.height + 12;
    let x = p.x + 16, y = p.y - h - 10;
    if (x + w > 1276) x = p.x - w - 10;
    if (y < 44) y = p.y + 20;
    if (y + h > 716) y = 716 - h;
    this.tipBg.clear();
    this.tipBg.fillStyle(0x0b0e14, 0.95); this.tipBg.fillRoundedRect(x, y, w, h, 6);
    this.tipBg.lineStyle(1.5, 0x6b7280, 1); this.tipBg.strokeRoundedRect(x, y, w, h, 6);
    this.tipText.setPosition(x + 8, y + 6);
  }

  // ------------------------------------------------------------------ per-frame
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    const gs = this.gs, h = this.hero, wv = gs.waves;
    if (!gs.sys.isActive() && !gs.ended) return;

    // top bar
    this.setText(this.goldText, 'gold', String(gs.economy.gold));
    this.setText(this.waveText, 'wave', 'Wave ' + wv.wave);
    if (wv.phase === 'build') {
      this.setText(this.phaseText, 'phase', 'Build phase  ' + Math.ceil(wv.timer) + 's');
      this.setText(this.nextText, 'next', 'Next: ' + wv.next.lanes.map(l => CONFIG.map.lanes[l].name).join(' · ') + (wv.next.bosses ? '  (BOSS)' : ''));
      this.startBtn.setVisible(true);
      this.setText(this.startBtn.txt, 'startT', 'Start Wave ' + wv.next.n + '  +' + Math.floor(wv.timer) * CONFIG.waves.earlyGoldPerSec + 'g');
    } else {
      const left = gs.enemies.length + (wv.toSpawn - wv.spawned);
      this.setText(this.phaseText, 'phase', 'Enemies left: ' + left);
      this.setText(this.nextText, 'next', 'Lanes: ' + (wv.curLanes || []).map(l => CONFIG.map.lanes[l].name).join(' · '));
      this.startBtn.setVisible(false);
    }
    const k = gs.keep;
    const kb = this.keepBarG;
    kb.clear();
    kb.fillStyle(0x000000, 0.6); kb.fillRect(890, 12, 200, 16);
    const kf = Math.max(0, k.hp / k.maxHp);
    kb.fillStyle(kf > 0.5 ? 0x22c55e : kf > 0.25 ? 0xeab308 : 0xef4444, 1); kb.fillRect(890, 12, 200 * kf, 16);
    kb.lineStyle(1, 0x6b7280, 1); kb.strokeRect(890, 12, 200, 16);
    this.setText(this.keepHpText, 'khp', Math.ceil(k.hp) + ' / ' + k.maxHp + '  T' + k.tier);
    const n = k.nextTierDef;
    this.setText(this.colBtns.keep.txt, 'keepbtn', n ? 'KEEP T' + k.tier + '\n(U) ' + n.cost + 'g' : 'KEEP T' + k.tier + '\nMAX');
    this.colBtns.rally.bg.setStrokeStyle(2, gs.allyCommand.mode === 'command' || gs.cursorMode === 'rally' ? 0x8fc3ff : 0x4a8fe0);
    this.colBtns.build.bg.setStrokeStyle(2, this.buildOpen ? 0x44ff66 : 0x4b5563);

    this.drawHeroPanel(dt);
    this.drawMinimap(dt);
    this.updateSelection();
    if (this.buildOpen && this.cache.buildGoldVal !== gs.economy.gold) {
      this.cache.buildGoldVal = gs.economy.gold;
      BUILD_TYPES.forEach(t => this.buildBtns[t].costT.setColor(gs.economy.canAfford(CONFIG.buildings[t].cost) ? '#ffd23f' : '#ef4444'));
    }
    if (this.cache.placing !== gs.build.placing) { this.cache.placing = gs.build.placing; this.refreshBuildPanel(); }

    // hints
    let hint = '';
    if (gs.build.placing) {
      const d = CONFIG.buildings[gs.build.placing];
      hint = 'Placing ' + d.name + ' (' + d.cost + 'g) — left-click to place. Right-click / Esc to cancel.';
      if (gs.build.ghostReason) hint += '\n' + gs.build.ghostReason;
    } else if (gs.cursorMode === 'attack') hint = 'ATTACK-MOVE: left-click a destination (right-click / Esc cancels)';
    else if (gs.cursorMode === 'rally') hint = 'RALLY: left-click where allies should go. Press F again for automatic mode.';
    else if (h.aiming) hint = CONFIG.skills[h.heroKey][h.aiming].name.toUpperCase() + ': left-click to cast (right-click / Esc cancels)';
    this.setText(this.hintText, 'hint', hint);

    // death
    if (!h.alive && !gs.ended) this.setText(this.deathText, 'death', 'HERO DOWN\nRespawn in ' + Math.ceil(h.respawnT));
    else this.setText(this.deathText, 'death', '');

    this.drawEdgeIndicators();
    // keep hit vignette
    this.vignette = Math.max(0, this.vignette - dt * 0.8);
    const vg = this.vigG;
    vg.clear();
    if (h.alive && h.rage) { vg.fillStyle(0xff0000, 0.1 + 0.05 * Math.sin(this.time.now / 90)); vg.fillRect(0, 0, 1280, 720); }   // Warrior Rage tint
    if (this.vignette > 0.01) {
      for (let i = 0; i < 6; i++) {
        const a = this.vignette * (1 - i / 6) * 0.5, t = 6 + i * 6;
        vg.fillStyle(0xff0000, a);
        vg.fillRect(0, 0, 1280, t); vg.fillRect(0, 720 - t, 1280, t);
        vg.fillRect(0, 0, t, 720); vg.fillRect(1280 - t, 0, t, 720);
      }
    }
    if (this.tipShown) this.positionTip();
  }

  drawHeroPanel(dt) {
    const h = this.hero, X = 230, Y = 606;
    const g = this.barsG;
    g.clear();
    const bx = X + 106, bw = 260;
    g.fillStyle(0x000000, 0.6); g.fillRect(bx, Y + 12, bw, 17);
    g.fillStyle(0x22c55e, 1); g.fillRect(bx, Y + 12, bw * Math.max(0, h.hp / h.maxHp), 17);
    const xpNeed = this.gs.leveling.xpToNext();
    g.fillStyle(0x000000, 0.6); g.fillRect(bx, Y + 36, bw, 10);
    g.fillStyle(0xa855f7, 1); g.fillRect(bx, Y + 36, bw * Math.min(1, h.xp / xpNeed), 10);
    this.setText(this.hpText, 'hp', Math.ceil(h.hp) + ' / ' + h.maxHp);
    this.setText(this.xpText, 'xp', 'XP ' + h.xp + ' / ' + xpNeed);
    this.setText(this.statText, 'stats', 'DMG ' + Math.round(h.stats.damage) + '   ARM ' + Math.round(h.getArmor()) + '   SPD ' + Math.round(h.moveSpeed) + '   AS ' + (h.def.attackRate * h.stats.attackSpeed).toFixed(2) + (h.stats.cdr ? '   CDR ' + Math.round(h.stats.cdr * 100) + '%' : ''));
    this.setText(this.portraitLevel, 'lvl', 'Lv ' + h.level);

    // skills
    const sg = this.skillG;
    sg.clear();
    for (const k of SKILL_KEYS) {
      const u = this.skillUI[k], def = CONFIG.skills[h.heroKey][k];
      const cd = h.cooldowns[k];
      const learned = true;
      const autoOff = def.cast === 'auto' && !h.kit.autoQ;
      this.skillPulse[k] = Math.max(0, this.skillPulse[k] - dt);
      this.skillDenied[k] = Math.max(0, this.skillDenied[k] - dt);
      const x = u.sx, y = u.sy, S = 58;
      let base = learned ? 0x2a3a5c : 0x161a22;
      sg.fillStyle(base, 1); sg.fillRoundedRect(x, y, S, S, 6);
      // icon
      if (learned) this.drawSkillIcon(sg, h.heroKey, k, x + S / 2, y + S / 2 - 6);
      if (learned && cd > 0) {
        const frac = cd / h.cdMax[k];
        this.sweep(sg, x, y, S, frac);
      }
      if (autoOff && cd <= 0) { sg.fillStyle(0x000000, 0.45); sg.fillRoundedRect(x, y, S, S, 6); }
      if (h.aiming === k) { sg.lineStyle(3, 0xffffff, 1); sg.strokeRoundedRect(x - 1, y - 1, S + 2, S + 2, 6); }
      const pulse = this.skillPulse[k];
      sg.lineStyle(2, this.skillDenied[k] > 0 ? 0xef4444 : pulse > 0 ? 0xffffff : learned ? 0x5b7bb5 : 0x3a4252, 1);
      sg.strokeRoundedRect(x, y, S, S, 6);
      if (pulse > 0) { sg.lineStyle(4, 0xffffff, pulse / 0.35); sg.strokeRoundedRect(x - 4 * (1 - pulse / 0.35), y - 4 * (1 - pulse / 0.35), S + 8 * (1 - pulse / 0.35), S + 8 * (1 - pulse / 0.35), 8); }
      this.setText(u.cdT, 'cd' + k, learned && cd > 0 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : '');
      u.nameT.setAlpha(learned ? 1 : 0.4);
      if (def.cast === 'auto') {
        this.setText(u.autoT, 'auto' + k, autoOff ? 'AUTO OFF' : 'AUTO');
        u.autoT.setColor(autoOff ? '#ef4444' : '#7cf29a');
      } else if (h.kit.skillLabel) {
        this.setText(u.autoT, 'auto' + k, h.kit.skillLabel(k));
        u.autoT.setColor(k === 'W' && h.rage ? '#ff5050' : '#9ca3af');
      }
    }

    // items
    const ig = this.itemG, owned = this.ownedItems();
    ig.clear();
    this.itemSlots.forEach((sl, i) => {
      const key = owned[i];
      if (key) this.drawItemIcon(ig, sl.x + 9, sl.y + 9, CONFIG.items[key], 7);
      else { ig.fillStyle(0x161a22, 1); ig.fillRect(sl.x + 1, sl.y + 1, 16, 16); }
      this.setText(sl.lvT, 'ilv' + i, key ? String(this.gs.picks.level(key)) : '');
    });
  }

  // cooldown sweep clipped to a square
  sweep(g, x, y, S, frac) {
    const cx = x + S / 2, cy = y + S / 2, half = S / 2;
    const start = -Math.PI / 2, end = start + Math.PI * 2 * frac;
    const pts = [{ x: cx, y: cy }];
    const steps = Math.max(2, Math.ceil(frac * 40));
    for (let i = 0; i <= steps; i++) {
      const a = start + (end - start) * (i / steps);
      const c = Math.cos(a), s = Math.sin(a);
      const t = half / Math.max(Math.abs(c), Math.abs(s));
      pts.push({ x: cx + c * t, y: cy + s * t });
    }
    // sweep shows the remaining part: draw from end around to start
    g.fillStyle(0x000000, 0.65);
    g.fillPoints(pts, true);
  }

  drawSkillIcon(g, heroKey, k, x, y) {
    const icons = {
      warrior: {
        Q: () => { g.lineStyle(3, 0x9cc8ff, 1); g.strokeCircle(x, y, 12); g.fillStyle(0xffffff, 1); g.fillCircle(x, y, 4); g.fillTriangle(x + 12, y - 6, x + 18, y, x + 8, y + 2); },
        W: () => { g.fillStyle(0xff3030, 1); g.fillTriangle(x, y - 14, x + 10, y + 8, x - 10, y + 8); g.fillStyle(0xffd23f, 1); g.fillTriangle(x, y - 4, x + 4, y + 6, x - 4, y + 6); },
        E: () => { g.fillStyle(0xb0213a, 1); g.fillCircle(x, y + 3, 9); g.fillTriangle(x - 8, y, x + 8, y, x, y - 14); },
        R: () => { g.fillStyle(0x9cc8ff, 1); g.fillTriangle(x + 12, y, x - 6, y - 9, x - 6, y + 9); g.fillRect(x - 14, y - 2, 8, 4); },
      },
      mage: {
        Q: () => { g.fillStyle(0xff7a2a, 1); g.fillCircle(x + 4, y, 7); g.fillStyle(0xffd23f, 1); g.fillTriangle(x - 3, y - 5, x - 15, y, x - 3, y + 5); },
        W: () => { g.fillStyle(0x4f9a2a, 1); g.fillEllipse(x, y + 4, 30, 14); g.fillStyle(0x9be86a, 1); g.fillCircle(x - 6, y + 2, 3); g.fillCircle(x + 5, y - 3, 4); g.fillCircle(x + 1, y - 9, 2.5); },
        E: () => { g.lineStyle(3, 0x9fe9ff, 1); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; g.lineBetween(x - Math.cos(a) * 13, y - Math.sin(a) * 13, x + Math.cos(a) * 13, y + Math.sin(a) * 13); } g.fillStyle(0xffffff, 1); g.fillCircle(x, y, 3); },
        R: () => { g.fillStyle(0xff5030, 1); g.fillCircle(x - 6, y + 4, 5); g.fillCircle(x + 6, y - 2, 6); g.fillCircle(x, y - 10, 4); },
      },
    };
    icons[heroKey][k]();
  }

  drawEdgeIndicators() {
    const g = this.edgeG, gs = this.gs, cam = gs.cameras.main;
    g.clear();
    this.edgeLabels.forEach(t => t.setVisible(false));
    const lanes = gs.waves.nextLanes || [];
    const blink = 0.55 + 0.45 * Math.sin(this.time.now / 160);
    lanes.forEach((l, i) => {
      const sp = gs.waves.spawnPoint(l);
      const sx = sp.x - cam.scrollX, sy = sp.y - cam.scrollY;
      const label = this.edgeLabels[i];
      const name = CONFIG.map.lanes[l].name;
      const minX = 30, maxX = 1250, minY = 70, maxY = 580;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        g.lineStyle(3, 0xff3030, blink); g.strokeCircle(sx, sy, 48);
        label.setPosition(sx, sy - 60).setText((gs.waves.phase === 'build' ? 'NEXT: ' : '') + name).setVisible(true);
        return;
      }
      const cx = 640, cy = 325;
      const dx = sx - cx, dy = sy - cy;
      const t = Math.min((dx > 0 ? (maxX - cx) / dx : dx < 0 ? (minX - cx) / dx : Infinity), (dy > 0 ? (maxY - cy) / dy : dy < 0 ? (minY - cy) / dy : Infinity));
      const ex = cx + dx * t, ey = cy + dy * t;
      const a = Math.atan2(dy, dx);
      const tip = { x: ex + Math.cos(a) * 14, y: ey + Math.sin(a) * 14 };
      const l1 = { x: ex + Math.cos(a + 2.5) * 14, y: ey + Math.sin(a + 2.5) * 14 };
      const l2 = { x: ex + Math.cos(a - 2.5) * 14, y: ey + Math.sin(a - 2.5) * 14 };
      g.fillStyle(0xff3030, blink); g.fillTriangle(tip.x, tip.y, l1.x, l1.y, l2.x, l2.y);
      label.setPosition(ex - Math.cos(a) * 26, ey - Math.sin(a) * 18).setText(name).setVisible(true);
    });
  }
}
