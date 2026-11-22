// Item shop: open anytime, 6 inventory slots, sell for 50%.

class Shop {
  constructor(scene, hero) {
    this.scene = scene;
    this.hero = hero;
  }

  buy(key) {
    const item = CONFIG.items[key];
    const slot = this.hero.items.indexOf(null);
    if (slot < 0) { Sfx.play('error'); this.scene.events.emit('notice', 'Inventory full'); return false; }
    if (!this.scene.economy.spend(item.cost)) return false;
    this.hero.items[slot] = key;
    this.hero.recalcStats();
    Sfx.play('buy');
    if (this.hero.alive) Feel.burst(this.hero.x, this.hero.y, item.color, 10);
    this.scene.events.emit('inventoryChanged');
    return true;
  }

  sell(slot) {
    const key = this.hero.items[slot];
    if (!key) return false;
    const item = CONFIG.items[key];
    this.hero.items[slot] = null;
    this.hero.recalcStats();
    this.scene.economy.add(Math.floor(item.cost * CONFIG.itemSellRefund));
    Sfx.play('gold');
    this.scene.events.emit('inventoryChanged');
    return true;
  }
}
