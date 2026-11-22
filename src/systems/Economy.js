// Gold and run statistics.

class Economy {
  constructor(scene, startGold) {
    this.scene = scene;
    this.gold = startGold;
    this.kills = 0;
    this.totalEarned = 0;
  }

  add(amount, x, y) {
    amount = Math.round(amount);
    if (amount <= 0) return;
    this.gold += amount;
    this.totalEarned += amount;
    if (x != null) Feel.floatText(x, y, '+' + amount + 'g', '#ffd23f', 13, 700);
    this.scene.events.emit('goldChanged', amount);
  }

  canAfford(cost) { return this.gold >= cost; }

  spend(cost) {
    if (this.gold < cost) {
      Sfx.play('error');
      this.scene.events.emit('notice', 'Not enough gold');
      return false;
    }
    this.gold -= cost;
    this.scene.events.emit('goldChanged', -cost);
    return true;
  }
}
