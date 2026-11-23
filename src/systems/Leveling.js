// Hero XP and levels. No max level: past the table each level needs xpGrowth × the previous.

class Leveling {
  constructor(scene, hero) {
    this.scene = scene;
    this.hero = hero;
  }

  xpFor(level) {
    const L = CONFIG.leveling, t = L.xpToNext;
    if (level - 1 < t.length) return t[level - 1];
    return Math.round(t[t.length - 1] * Math.pow(L.xpGrowth, level - t.length));
  }

  xpToNext() { return this.xpFor(this.hero.level); }

  addXp(amount) {
    const h = this.hero;
    h.xp += Math.round(amount);
    while (h.xp >= this.xpToNext()) {
      h.xp -= this.xpToNext();
      this.levelUp();
    }
  }

  levelUp() {
    const h = this.hero;
    h.level++;
    h.recalcStats();
    if (h.alive) {
      h.hp = h.maxHp;
      Feel.ring(h.x, h.y, 120, 0xffd23f, { from: 10, duration: 600, width: 6, fill: true });
      Feel.ring(h.x, h.y, 70, 0xffffff, { from: 10, duration: 400, width: 3 });
      Feel.burst(h.x, h.y, 0xffd23f, 24);
      Feel.floatText(h.x, h.y - 40, 'LEVEL ' + h.level, '#ffd23f', 22, 1200);
      Feel.popScale(h.gfx, 1.5, 140);
    }
    Sfx.play('levelup');
    // milestones reached this level
    const unlocked = [];
    for (const k of ['Q', 'W', 'E', 'R']) {
      for (const m of h.skillDefs[k].milestones || []) if (m.level === h.level) unlocked.push(h.skillDefs[k].name + ': ' + m.text);
    }
    this.scene.events.emit('levelUp', h.level, unlocked);
    this.scene.picks.grant();
  }
}
