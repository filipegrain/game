// Level-up item picks: each level-up offers CONFIG.itemPickCount distinct items from the hero's pool.
// Picking an owned item levels it up. Owned items are weighted up by level. GameScene pauses while a pick is open.

class ItemPicks {
  constructor(scene, hero) {
    this.scene = scene;
    this.hero = hero;
    this.pending = 0;      // level-ups not yet picked
    this.choices = null;   // item keys on offer, or null
  }

  level(key) { return this.hero.itemLevels[key] || 0; }

  pool() {
    return CONFIG.itemOrder.filter(k => !CONFIG.items[k].hero || CONFIG.items[k].hero === this.hero.heroKey);
  }

  grant() {
    this.pending++;
    if (!this.choices) this.offer();
  }

  offer() {
    const pool = this.pool(), out = [];
    while (out.length < CONFIG.itemPickCount && pool.length) {
      const w = pool.map(k => 1 + this.level(k) * CONFIG.itemPickOwnedWeight);
      let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
      while (i < pool.length - 1 && (r -= w[i]) > 0) i++;
      out.push(pool.splice(i, 1)[0]);
    }
    this.choices = out;
    if (this.scene.bot) { this.pick(this.scene.bot.chooseItem(out)); return; }
    Sfx.play('ready');
    this.scene.events.emit('itemChoices', out);
  }

  pick(key) {
    if (!this.choices || !this.choices.includes(key)) return false;
    const h = this.hero, item = CONFIG.items[key];
    h.itemLevels[key] = this.level(key) + 1;
    h.recalcStats();
    if (this.scene.recorder) this.scene.recorder.spent('items', 0, 'item', key, h.itemLevels[key]);
    Sfx.play('buy');
    if (h.alive) {
      Feel.burst(h.x, h.y, item.color, 10);
      Feel.floatText(h.x, h.y - 30, item.name + ' Lv ' + h.itemLevels[key], '#ffd23f', 14, 900);
    }
    this.choices = null;
    this.pending--;
    this.scene.events.emit('inventoryChanged');
    if (this.pending > 0) this.offer();
    return true;
  }
}
