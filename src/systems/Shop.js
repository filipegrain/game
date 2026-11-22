// Item shop: open anytime, 6 inventory slots (one per item type).
// Buying an owned item levels it up; selling refunds a share of everything spent on it.

class Shop {
  constructor(scene, hero) {
    this.scene = scene;
    this.hero = hero;
  }

  level(key) { return this.hero.itemLevels[key] || 0; }

  costOf(key) {
    return Math.round(CONFIG.items[key].cost * (1 + CONFIG.itemLevelCostMul * this.level(key)));
  }

  sellValue(key) { return Math.floor((this.hero.itemSpent[key] || 0) * CONFIG.itemSellRefund); }

  buy(key) {
    const item = CONFIG.items[key], h = this.hero;
    const owned = this.level(key) > 0;
    const slot = owned ? h.items.indexOf(key) : h.items.indexOf(null);
    if (slot < 0) { Sfx.play('error'); this.scene.events.emit('notice', 'Inventory full'); return false; }
    const cost = this.costOf(key);
    if (!this.scene.economy.spend(cost)) return false;
    h.items[slot] = key;
    h.itemLevels[key] = this.level(key) + 1;
    h.itemSpent[key] = (h.itemSpent[key] || 0) + cost;
    h.recalcStats();
    Sfx.play('buy');
    if (h.alive) {
      Feel.burst(h.x, h.y, item.color, 10);
      if (owned) Feel.floatText(h.x, h.y - 30, item.name + ' Lv ' + h.itemLevels[key], '#ffd23f', 14, 900);
    }
    this.scene.events.emit('inventoryChanged');
    return true;
  }

  sell(slot) {
    const h = this.hero, key = h.items[slot];
    if (!key) return false;
    this.scene.economy.add(this.sellValue(key));
    h.items[slot] = null;
    delete h.itemLevels[key];
    delete h.itemSpent[key];
    h.recalcStats();
    Sfx.play('gold');
    this.scene.events.emit('inventoryChanged');
    return true;
  }
}
