// Hero + difficulty select.

class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  init(data) {
    this.choice = { hero: (data && data.hero) || this.choice?.hero || 'warrior', difficulty: (data && data.difficulty) || this.choice?.difficulty || 'medium' };
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f1a12');
    this.input.mouse.disableContextMenu();
    const bg = this.add.graphics();
    // decorative lanes
    bg.fillStyle(0x86754f, 0.25);
    bg.fillRect(0, 150, 1280, 40); bg.fillRect(0, 360, 1280, 50); bg.fillRect(0, 560, 1280, 40);
    bg.fillRect(560, 150, 30, 450);

    this.add.text(640, 70, 'CASTLE DEFENSE', { fontFamily: FONT, fontSize: '56px', color: '#ffd23f', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(640, 118, 'Hold the Keep. Three lanes. Endless waves.', { fontFamily: FONT, fontSize: '18px', color: '#cbd5e1' }).setOrigin(0.5);

    this.add.text(640, 160, 'CHOOSE YOUR HERO', { fontFamily: FONT, fontSize: '16px', color: '#9ca3af', fontStyle: 'bold' }).setOrigin(0.5);
    this.heroCards = {};
    this.makeHeroCard('warrior', 340, 180);
    this.makeHeroCard('mage', 660, 180);

    this.add.text(640, 470, 'DIFFICULTY', { fontFamily: FONT, fontSize: '16px', color: '#9ca3af', fontStyle: 'bold' }).setOrigin(0.5);
    this.diffBtns = {};
    ['easy', 'medium', 'hard'].forEach((d, i) => {
      const x = 400 + i * 170, y = 490;
      const r = this.add.rectangle(x, y, 150, 44, 0x1f2937).setOrigin(0).setStrokeStyle(2, 0x4b5563).setInteractive({ useHandCursor: true });
      const label = CONFIG.difficulty[d].label;
      let best = 0;
      try { best = parseInt(localStorage.getItem('cd_best_' + d) || '0', 10) || 0; } catch (e) { /* ignore */ }
      this.add.text(x + 75, y + 15, label, { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      this.add.text(x + 75, y + 34, 'Best: ' + best, { fontFamily: FONT, fontSize: '11px', color: '#ffd23f' }).setOrigin(0.5);
      r.on('pointerdown', () => { Sfx.resume(); Sfx.play('click'); this.choice.difficulty = d; this.refresh(); });
      this.diffBtns[d] = r;
    });

    const start = this.add.rectangle(540, 570, 200, 54, 0x7a2a2a).setOrigin(0).setStrokeStyle(3, 0xff6060).setInteractive({ useHandCursor: true });
    this.add.text(640, 597, 'START', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    start.on('pointerover', () => start.setFillStyle(0x9a3a3a));
    start.on('pointerout', () => start.setFillStyle(0x7a2a2a));
    start.on('pointerdown', () => this.startGame());
    this.input.keyboard.on('keydown-ENTER', () => this.startGame());

    // balance simulation
    const small = (x, label, fn) => {
      const r = this.add.rectangle(x, 577, 170, 40, 0x1f2937).setOrigin(0).setStrokeStyle(2, 0x4b5563).setInteractive({ useHandCursor: true });
      this.add.text(x + 85, 597, label, { fontFamily: FONT, fontSize: '15px', color: '#cbd5e1', fontStyle: 'bold' }).setOrigin(0.5);
      r.on('pointerover', () => r.setFillStyle(0x374151));
      r.on('pointerout', () => r.setFillStyle(0x1f2937));
      r.on('pointerdown', () => { Sfx.resume(); Sfx.play('click'); fn(); });
    };
    small(330, 'Simulate', () => this.scene.start('SimSetupScene'));
    if (SimReport.load()) small(780, 'Last report', () => this.scene.start('SimReportScene'));

    this.add.text(640, 660, 'Right-click move · QWER skills · V build · U upgrade Keep · F rally · hold Space look around · P pause',
      { fontFamily: FONT, fontSize: '13px', color: '#6b7280' }).setOrigin(0.5);
    this.add.text(640, 684, 'All skills unlocked from the start and grow stronger every level.   Sound: M.', { fontFamily: FONT, fontSize: '13px', color: '#6b7280' }).setOrigin(0.5);
    this.refresh();
  }

  makeHeroCard(key, x, y) {
    const d = CONFIG.heroes[key], sk = CONFIG.skills[key];
    const W = 280, H = 270;
    const r = this.add.rectangle(x, y, W, H, 0x111827).setOrigin(0).setStrokeStyle(3, 0x4b5563).setInteractive({ useHandCursor: true });
    r.on('pointerdown', () => { Sfx.resume(); Sfx.play('click'); this.choice.hero = key; this.refresh(); });
    const g = this.add.graphics();
    g.fillStyle(d.color, 1); g.fillCircle(x + 50, y + 50, 26);
    g.lineStyle(3, 0xffffff, 1); g.strokeCircle(x + 50, y + 50, 26);
    g.fillStyle(0xffffff, 1); g.fillTriangle(x + 84, y + 50, x + 72, y + 42, x + 72, y + 58);
    this.add.text(x + 96, y + 26, d.name, { fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold' });
    this.add.text(x + 96, y + 58, key === 'warrior' ? 'Melee · tanky brawler' : 'Ranged · fragile · area damage', { fontFamily: FONT, fontSize: '13px', color: '#9ca3af' });
    const lines = ['Q', 'W', 'E', 'R'].map(k => k + '  ' + sk[k].name + ' — ' + sk[k].desc.split('.')[0]);
    this.add.text(x + 16, y + 96, lines.join('\n'), { fontFamily: FONT, fontSize: '12px', color: '#e5e7eb', lineSpacing: 5, wordWrap: { width: W - 30 } });
    this.add.text(x + 16, y + H - 26, 'HP ' + d.hp + '   Damage ' + d.damage + '   Range ' + d.range, { fontFamily: FONT, fontSize: '12px', color: '#9ca3af' });
    this.heroCards[key] = r;
  }

  refresh() {
    for (const k in this.heroCards) this.heroCards[k].setStrokeStyle(3, this.choice.hero === k ? 0xffd23f : 0x4b5563);
    for (const k in this.diffBtns) this.diffBtns[k].setStrokeStyle(2, this.choice.difficulty === k ? 0xffd23f : 0x4b5563).setFillStyle(this.choice.difficulty === k ? 0x374151 : 0x1f2937);
  }

  startGame() {
    Sfx.resume();
    Sfx.play('wave');
    this.scene.start('GameScene', { hero: this.choice.hero, difficulty: this.choice.difficulty });
  }
}
