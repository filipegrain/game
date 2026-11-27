// Run summary + best score.

class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  init(data) { this.data_ = data; }

  create() {
    const d = this.data_;
    this.cameras.main.setBackgroundColor('#140b0b');
    this.add.text(640, 110, 'THE KEEP HAS FALLEN', { fontFamily: FONT, fontSize: '52px', color: '#ff5050', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    const mins = Math.floor(d.time / 60), secs = Math.floor(d.time % 60);
    const rows = [
      ['Hero', CONFIG.heroes[d.hero].name],
      ['Waves survived', String(d.waves)],
      ['Time', mins + ':' + String(secs).padStart(2, '0')],
      ['Kills', String(d.kills)],
      ['Hero level', String(d.level)],
    ];
    rows.forEach(([k, v], i) => {
      this.add.text(560, 200 + i * 36, k, { fontFamily: FONT, fontSize: '20px', color: '#9ca3af' }).setOrigin(1, 0);
      this.add.text(590, 200 + i * 36, v, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' });
    });
    const score = this.add.text(640, 445, 'SCORE ' + d.score, { fontFamily: FONT, fontSize: '40px', color: '#ffd23f', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    this.tweens.add({ targets: score, scale: { from: 0.6, to: 1 }, duration: 500, ease: 'Back.easeOut' });
    this.add.text(640, 490, d.newBest ? 'NEW BEST!' : 'Best: ' + d.best,
      { fontFamily: FONT, fontSize: '20px', color: d.newBest ? '#7cf29a' : '#cbd5e1', fontStyle: 'bold' }).setOrigin(0.5);

    const mk = (x, label, color, fn) => {
      const r = this.add.rectangle(x, 560, 200, 50, color).setOrigin(0).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
      this.add.text(x + 100, 585, label, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      r.on('pointerdown', () => { Sfx.play('click'); fn(); });
    };
    mk(420, 'Retry', 0x7a2a2a, () => this.scene.start('GameScene', { hero: d.hero }));
    mk(660, 'Menu', 0x1f2937, () => this.scene.start('MenuScene', { hero: d.hero }));
    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('GameScene', { hero: d.hero }));
  }
}
