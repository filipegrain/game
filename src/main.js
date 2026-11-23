// Boot.

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.VIEW_W,
  height: CONFIG.VIEW_H,
  backgroundColor: '#0b0d12',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  disableContextMenu: true,
  scene: [MenuScene, GameScene, UIScene, GameOverScene, SimSetupScene, SimHudScene, SimReportScene],
});
