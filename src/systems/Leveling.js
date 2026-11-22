// Hero XP and levels.

class Leveling {
  constructor(scene, hero) {
    this.scene = scene;
    this.hero = hero;
  }

  xpToNext() {
    const t = CONFIG.leveling.xpToNext;
    return t[this.hero.level - 1] || Infinity;
  }

  addXp(amount) {
    const h = this.hero;
    if (h.level >= CONFIG.leveling.maxLevel) return;
    h.xp += Math.round(amount);
    while (h.level < CONFIG.leveling.maxLevel && h.xp >= this.xpToNext()) {
      h.xp -= this.xpToNext();
      this.levelUp();
    }
    if (h.level >= CONFIG.leveling.maxLevel) h.xp = 0;
  }

  levelUp() {
    const h = this.hero;
    h.level++;
    h.skillPoints++;
    h.recalcStats();
    if (h.alive) {
      h.hp = h.maxHp;
      h.mana = h.stats.maxMana;
      Feel.ring(h.x, h.y, 120, 0xffd23f, { from: 10, duration: 600, width: 6, fill: true });
      Feel.ring(h.x, h.y, 70, 0xffffff, { from: 10, duration: 400, width: 3 });
      Feel.burst(h.x, h.y, 0xffd23f, 24);
      Feel.floatText(h.x, h.y - 40, 'LEVEL ' + h.level, '#ffd23f', 22, 1200);
      Feel.popScale(h.gfx, 1.5, 140);
    }
    Sfx.play('levelup');
    this.scene.events.emit('levelUp', h.level);
  }
}
