// Hero select, then the skill card: pick CONFIG.heroCommon.skillPicks of the hero's nine skills (Q/W/E in pick order).

const LOADOUT_KEY = 'cd_loadouts';   // localStorage: last picks per hero

class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  init(data) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LOADOUT_KEY) || '{}'); } catch (e) { /* ignore */ }
    const valid = (h) => Array.isArray(saved[h]) && saved[h].every(id => CONFIG.skills[h][id]) ? saved[h].slice(0, CONFIG.heroCommon.skillPicks) : [];
    this.choice = { hero: (data && data.hero) || this.choice?.hero || 'warrior', skills: {} };
    for (const h in CONFIG.heroes) this.choice.skills[h] = valid(h);
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f1a12');
    this.input.mouse.disableContextMenu();
    const bg = this.add.graphics();
    bg.fillStyle(0x86754f, 0.25);
    bg.fillRect(0, 150, 1280, 40); bg.fillRect(0, 360, 1280, 50); bg.fillRect(0, 560, 1280, 40);
    bg.fillRect(560, 150, 30, 450);
    this.add.text(640, 48, 'CASTLE DEFENSE', { fontFamily: FONT, fontSize: '48px', color: '#ffd23f', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);

    this.input.keyboard.on('keydown-ENTER', () => this.skillLayer ? this.startGame() : this.showSkills());
    this.input.keyboard.on('keydown-ESC', () => { if (this.skillLayer) this.showHeroes(); });
    this.showHeroes();
  }

  layer() { return this.add.container(0, 0); }

  btn(layer, x, y, w, h, label, fn, color = 0x1f2937, stroke = 0x4b5563, size = 15) {
    const r = this.add.rectangle(x, y, w, h, color).setOrigin(0).setStrokeStyle(2, stroke).setInteractive({ useHandCursor: true });
    const t = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: size + 'px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    r.on('pointerover', () => r.setFillStyle(Phaser.Display.Color.ValueToColor(color).lighten(12).color));
    r.on('pointerout', () => r.setFillStyle(color));
    r.on('pointerdown', () => { Sfx.resume(); Sfx.play('click'); fn(); });
    layer.add([r, t]);
    return { r, t };
  }

  // ---------------------------------------------------------------- hero select
  showHeroes() {
    if (this.skillLayer) { this.skillLayer.destroy(); this.skillLayer = null; }
    const L = this.heroLayer = this.layer();
    L.add(this.add.text(640, 92, 'Hold the Keep. Three lanes. Endless waves.', { fontFamily: FONT, fontSize: '17px', color: '#cbd5e1' }).setOrigin(0.5));
    L.add(this.add.text(640, 150, 'CHOOSE YOUR HERO', { fontFamily: FONT, fontSize: '16px', color: '#9ca3af', fontStyle: 'bold' }).setOrigin(0.5));
    this.heroCards = {};
    Object.keys(CONFIG.heroes).forEach((key, i) => this.makeHeroCard(L, key, 170 + i * 320, 180));

    let best = 0;
    try { best = parseInt(localStorage.getItem(CONFIG.score.bestKey) || '0', 10) || 0; } catch (e) { /* ignore */ }
    L.add(this.add.text(640, 520, 'BEST SCORE  ' + best, { fontFamily: FONT, fontSize: '18px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5));
    this.btn(L, 540, 570, 200, 54, 'SKILLS ▸', () => this.showSkills(), 0x7a2a2a, 0xff6060, 24);
    this.btn(L, 780, 577, 170, 40, 'Map Editor', () => this.scene.start('MapEditorScene'));
    L.add(this.add.text(640, 660, 'Right-click move · QWE skills · V build · U upgrade Keep · hold Space look around · P pause · M sound',
      { fontFamily: FONT, fontSize: '13px', color: '#6b7280' }).setOrigin(0.5));
    L.add(this.add.text(640, 684, 'Pick 3 of 9 skills before the run. Clear a wave for its XP; level-ups grow your stats and offer items.',
      { fontFamily: FONT, fontSize: '13px', color: '#6b7280' }).setOrigin(0.5));
    this.refreshHeroes();
  }

  makeHeroCard(L, key, x, y) {
    const d = CONFIG.heroes[key], W = 300, H = 300;
    const r = this.add.rectangle(x, y, W, H, 0x111827).setOrigin(0).setStrokeStyle(3, 0x4b5563).setInteractive({ useHandCursor: true });
    r.on('pointerdown', () => { Sfx.resume(); Sfx.play('click'); this.choice.hero = key; this.refreshHeroes(); });
    const g = this.add.graphics();
    g.fillStyle(d.color, 1); g.fillCircle(x + 50, y + 50, 26);
    g.lineStyle(3, 0xffffff, 1); g.strokeCircle(x + 50, y + 50, 26);
    g.fillStyle(0xffffff, 1); g.fillTriangle(x + 84, y + 50, x + 72, y + 42, x + 72, y + 58);
    L.add([r, g]);
    L.add(this.add.text(x + 96, y + 26, d.name, { fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold' }));
    L.add(this.add.text(x + 96, y + 58, d.tagline, { fontFamily: FONT, fontSize: '12px', color: '#9ca3af', wordWrap: { width: W - 106 } }));
    // stat bars, relative to the best hero in each column (level 1 value + growth)
    const rows = [
      ['Health', h => h.hp + h.perLevel.hp * 10],
      ['Regen', h => h.hpRegen + h.perLevel.hpRegen * 10],
      ['Attack speed', h => h.attackRate * (1 + h.perLevel.attackSpeed * 10)],
      ['Move speed', h => h.speed * (1 + Math.min(CONFIG.heroCommon.speedGrowthCap, h.perLevel.speed * 10))],
      ['Damage', h => h.damage + h.perLevel.damage * 10],
    ];
    const all = Object.values(CONFIG.heroes);
    rows.forEach(([label, f], i) => {
      const yy = y + 104 + i * 26, frac = f(d) / Math.max(...all.map(f));
      L.add(this.add.text(x + 16, yy, label, { fontFamily: FONT, fontSize: '12px', color: '#cbd5e1' }));
      g.fillStyle(0x1f2937, 1); g.fillRect(x + 120, yy + 3, 160, 10);
      g.fillStyle(d.color, 1); g.fillRect(x + 120, yy + 3, 160 * frac, 10);
    });
    L.add(this.add.text(x + 16, y + 240, d.attackDesc + '\nRange ' + d.range + '   Armor ' + d.armor, { fontFamily: FONT, fontSize: '12px', color: '#9ca3af', lineSpacing: 4, wordWrap: { width: W - 30 } }));
    this.heroCards[key] = r;
  }

  refreshHeroes() {
    for (const k in this.heroCards) this.heroCards[k].setStrokeStyle(3, this.choice.hero === k ? 0xffd23f : 0x4b5563);
  }

  // ---------------------------------------------------------------- skill card
  showSkills() {
    if (this.heroLayer) { this.heroLayer.destroy(); this.heroLayer = null; }
    if (this.skillLayer) this.skillLayer.destroy();
    const L = this.skillLayer = this.layer(), hero = this.choice.hero, d = CONFIG.heroes[hero];
    const n = CONFIG.heroCommon.skillPicks;
    L.add(this.add.text(640, 92, d.name.toUpperCase() + ' — PICK ' + n + ' SKILLS', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
    L.add(this.add.text(640, 118, 'Your picks go to ' + SKILL_KEYS.slice(0, n).join(' / ') + ' in the order you choose them. Click a picked skill to drop it.',
      { fontFamily: FONT, fontSize: '13px', color: '#9ca3af' }).setOrigin(0.5));
    this.skillCards = {};
    Object.keys(CONFIG.skills[hero]).forEach((id, i) => this.makeSkillCard(L, hero, id, 40 + (i % 3) * 405, 140 + Math.floor(i / 3) * 136));
    this.btn(L, 330, 577, 170, 40, '◂ Heroes', () => this.showHeroes());
    this.startBtn = this.btn(L, 540, 570, 200, 54, 'START', () => this.startGame(), 0x7a2a2a, 0xff6060, 26);
    this.pickText = this.add.text(640, 646, '', { fontFamily: FONT, fontSize: '14px', color: '#fde68a', fontStyle: 'bold' }).setOrigin(0.5);
    L.add(this.pickText);
    this.refreshSkills();
  }

  makeSkillCard(L, hero, id, x, y) {
    const def = CONFIG.skills[hero][id], W = 395, H = 126;
    const r = this.add.rectangle(x, y, W, H, 0x111827).setOrigin(0).setStrokeStyle(3, 0x374151).setInteractive({ useHandCursor: true });
    r.on('pointerdown', () => { Sfx.resume(); this.toggleSkill(id); });
    const g = this.add.graphics();
    g.fillStyle(0x1a2030, 1); g.fillRoundedRect(x + 12, y + 12, 48, 48, 6);
    drawSkillIcon(g, def, x + 36, y + 36, 14);
    const how = def.cast === 'aim' ? 'Aimed' : 'Instant';
    const badge = this.add.text(x + 36, y + 84, '', { fontFamily: FONT, fontSize: '22px', color: '#0f131a', fontStyle: 'bold', backgroundColor: '#ffd23f', padding: { x: 7, y: 1 } }).setOrigin(0.5);
    L.add([r, g, badge]);
    L.add(this.add.text(x + 74, y + 12, def.name, { fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold' }));
    L.add(this.add.text(x + W - 12, y + 15, how + ' · ' + def.cd + 's', { fontFamily: FONT, fontSize: '12px', color: '#9ca3af' }).setOrigin(1, 0));
    L.add(this.add.text(x + 74, y + 38, def.desc, { fontFamily: FONT, fontSize: '13px', color: '#d1d5db', lineSpacing: 3, wordWrap: { width: W - 88 } }));
    this.skillCards[id] = { r, badge };
  }

  toggleSkill(id) {
    const picks = this.choice.skills[this.choice.hero];
    const i = picks.indexOf(id);
    if (i >= 0) picks.splice(i, 1);
    else if (picks.length < CONFIG.heroCommon.skillPicks) picks.push(id);
    else { Sfx.play('error'); return; }
    Sfx.play('click');
    this.refreshSkills();
  }

  refreshSkills() {
    const hero = this.choice.hero, picks = this.choice.skills[hero], n = CONFIG.heroCommon.skillPicks;
    for (const id in this.skillCards) {
      const c = this.skillCards[id], i = picks.indexOf(id);
      c.r.setStrokeStyle(3, i >= 0 ? 0xffd23f : 0x374151);
      c.badge.setText(i >= 0 ? SKILL_KEYS[i] : '').setVisible(i >= 0);
    }
    const ready = picks.length === n;
    this.startBtn.r.setAlpha(ready ? 1 : 0.4); this.startBtn.t.setAlpha(ready ? 1 : 0.4);
    this.pickText.setText(ready ? picks.map((id, i) => SKILL_KEYS[i] + ' ' + CONFIG.skills[hero][id].name).join('   ·   ') : 'Pick ' + (n - picks.length) + ' more');
  }

  startGame() {
    const hero = this.choice.hero, skills = this.choice.skills[hero];
    Sfx.resume();
    if (skills.length !== CONFIG.heroCommon.skillPicks) { Sfx.play('error'); return; }
    try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(this.choice.skills)); } catch (e) { /* ignore */ }
    Sfx.play('wave');
    this.scene.start('GameScene', { hero, skills: skills.slice() });
  }
}
