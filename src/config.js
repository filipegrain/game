// All tunable numbers live here.
// Array values inside skills/buildings are indexed by rank/level - 1.

const CONFIG = {
  TILE: 32,
  MAP_W: 80,          // tiles
  MAP_H: 45,          // tiles
  VIEW_W: 1280,
  VIEW_H: 720,

  camera: {             // locked on the hero; hold Space to look around
    edgeSize: 14,       // px from the screen edge that triggers edge pan (Space held)
    edgeSpeed: 1100,    // px/s
    smoothing: 16,      // higher = snappier camera follow
  },

  // ---------------------------------------------------------------- MAP
  // Rectangles are in tiles.
  map: {
    keep: { x: 2, y: 20, w: 5, h: 5 },
    paths: [
      { x: 8, y: 6, w: 72, h: 4 },    // top lane
      { x: 7, y: 20, w: 73, h: 5 },   // mid lane
      { x: 8, y: 35, w: 72, h: 4 },   // bottom lane
      { x: 8, y: 6, w: 4, h: 33 },    // left corridor joining the lanes to the Keep
    ],
    connectors: [                     // always open, never buildable
      { x: 34, y: 10, w: 3, h: 10 }, { x: 34, y: 25, w: 3, h: 10 },
      { x: 58, y: 10, w: 3, h: 10 }, { x: 58, y: 25, w: 3, h: 10 },
    ],
    spawnZoneX: 74,       // lane tiles with x >= this are not buildable
    keepNoBuildX: 9,      // lane tiles with x < this are not buildable (Keep entrance)
    towerAdjacency: 2,    // towers must be within this many tiles of a lane
    lanes: [              // tile coordinates
      { id: 0, name: 'TOP', spawn: { x: 78.5, y: 8 },    post: { x: 13.5, y: 8 } },
      { id: 1, name: 'MID', spawn: { x: 78.5, y: 22.5 }, post: { x: 15.5, y: 22.5 } },
      { id: 2, name: 'BOT', spawn: { x: 78.5, y: 37 },   post: { x: 13.5, y: 37 } },
    ],
    laneSplitTop: 14,     // tile y below which a unit counts as "top lane"
    laneSplitBot: 30,     // tile y above which a unit counts as "bottom lane"
  },

  // ---------------------------------------------------------------- DIFFICULTY
  difficulty: {
    easy:   { label: 'Easy',   enemyMul: 0.75, scaling: 0.75, startGold: 450, buildTime: 30, scoreMul: 0.75 },
    medium: { label: 'Medium', enemyMul: 1.0,  scaling: 1.0,  startGold: 300, buildTime: 25, scoreMul: 1.0 },
    hard:   { label: 'Hard',   enemyMul: 1.3,  scaling: 1.3,  startGold: 200, buildTime: 20, scoreMul: 1.5 },
  },

  // ---------------------------------------------------------------- WAVES
  waves: {
    firstBuildBonus: 10,       // extra seconds before wave 1
    baseCount: 7,
    countPerWave: 2.6,
    hpLinear: 0.12,            // hp mul = (1 + hpLinear*e) * hpExp^e, e = (wave-1) * scaling
    hpExp: 1.075,
    dmgPerWave: 0.07,
    speedPerWave: 0.012,
    speedCap: 1.35,
    bossEvery: 5,
    unlocks: { grunt: 1, runner: 2, brute: 3, archer: 4, sapper: 6, shaman: 8 },
    weights: { grunt: 10, runner: 5, brute: 3, archer: 4, sapper: 2, shaman: 1.5 },
    spawnInterval: 0.9,        // seconds between spawns in one lane
    groupSize: [3, 6],         // spawns come in groups
    groupPause: 2.2,           // pause between groups
    clearGoldBase: 40,
    clearGoldPerWave: 8,
    clearXpBase: 40,
    clearXpPerWave: 14,
    earlyGoldPerSec: 3,
    goldPerWaveScaling: 0.05,  // enemy gold bounty grows by this per wave
  },

  // ---------------------------------------------------------------- ENEMIES
  enemies: {
    grunt:  { name: 'Grunt',  shape: 'circle',   color: 0xd94040, radius: 11, hp: 70,   speed: 92,  damage: 10, range: 22,  rate: 1.0, armor: 0, aggro: 160, gold: 5,   xp: 12 },
    runner: { name: 'Runner', shape: 'triangle', color: 0xff5a5a, radius: 9,  hp: 40,   speed: 155, damage: 6,  range: 20,  rate: 1.4, armor: 0, aggro: 140, gold: 4,   xp: 10 },
    brute:  { name: 'Brute',  shape: 'square',   color: 0x8b1a1a, radius: 16, hp: 280,  speed: 58,  damage: 26, range: 24,  rate: 0.7, armor: 6, aggro: 150, gold: 14,  xp: 30 },
    archer: { name: 'Archer', shape: 'diamond',  color: 0xe0505a, radius: 10, hp: 55,   speed: 84,  damage: 10, range: 220, rate: 0.8, armor: 0, aggro: 240, gold: 7,   xp: 15, ranged: true, projSpeed: 520 },
    sapper: { name: 'Sapper', shape: 'square',   color: 0xe0802a, radius: 11, hp: 95,   speed: 86,  damage: 12, range: 24,  rate: 1.0, armor: 2, aggro: 120, gold: 9,   xp: 18, structureMul: 4, keepBreaker: true },   // ignores hero/allies, rushes the Keep
    shaman: { name: 'Shaman', shape: 'circle',   color: 0x9b4dca, radius: 12, hp: 120,  speed: 70,  damage: 8,  range: 180, rate: 0.7, armor: 1, aggro: 200, gold: 12,  xp: 25, ranged: true, projSpeed: 420,
              healEvery: 2.5, healRadius: 170, healPct: 0.08, hasteMul: 1.25, hasteTime: 3 },
    boss:   { name: 'Boss',   shape: 'hexagon',  color: 0xc81e1e, radius: 30, hp: 2600, speed: 46,  damage: 55, range: 30,  rate: 0.6, armor: 8, aggro: 200, gold: 150, xp: 300,
              structureMul: 2, slamEvery: 6.5, slamRadius: 160, slamDamage: 110, slamWindup: 1.0, slamStun: 0.8 },
  },

  // ---------------------------------------------------------------- HEROES
  heroes: {
    warrior: {
      name: 'Warrior', color: 0x3b82f6, radius: 15,
      hp: 620, hpRegen: 3,
      damage: 34, attackRate: 1.0, windup: 0.16, range: 34, armor: 5,
      speed: 270, accel: 9000, acquireRange: 220,
      perLevel: { hp: 62, damage: 3.5, armor: 0.6 },
      melee: true,
    },
    mage: {
      name: 'Mage', color: 0xa855f7, radius: 13,
      hp: 400, hpRegen: 2,
      damage: 26, attackRate: 0.9, windup: 0.14, range: 360, armor: 1,
      speed: 275, accel: 9000, acquireRange: 400,
      perLevel: { hp: 36, damage: 2.6, armor: 0.3 },
      melee: false, projSpeed: 820,
    },
  },
  heroCommon: {
    critChance: 0.12,
    critMult: 1.8,
    respawnBase: 5,          // respawn = base + level seconds
    xpRadius: 900,           // kills within this distance give XP
    skillBufferTime: 0.4,    // s a skill press is remembered while the hero is busy
    // Skills scale with hero level (per level above 1)
    skillScaling: { damage: 0.08, radius: 0.015, duration: 0.025, cdr: 0.015, cdrCap: 0.3 },
    totalCdrCap: 0.6,        // level cdr + item cdr combined
  },

  // cast: 'aim' = key then left-click at the cursor, 'instant' = fires on key press, 'auto' = autocast (key toggles)
  // damage/dps scale with skillScaling.damage, radius with .radius, durations with .duration.
  // milestones unlock extra effects at a hero level.
  skills: {
    warrior: {
      Q: { name: 'Cleave', cast: 'aim', cd: 4, damage: 60, radius: 115, arc: 100,
           knock: 340, bleedDps: 22, bleedTime: 3,
           milestones: [{ id: 'bleed', level: 5, text: 'Enemies hit bleed for 3s' }],
           desc: 'Wide arc slash toward the cursor. Damage + knockback.' },
      W: { name: 'Charge', cast: 'aim', cd: 9, damage: 50, range: 300, speed: 1500, width: 22,
           milestones: [{ id: 'reset', level: 8, text: 'Cooldown resets on kill' }],
           desc: 'Dash toward the cursor, damaging and pushing enemies.' },
      E: { name: 'War Cry', cast: 'instant', cd: 16, radius: 260, taunt: 2, armor: 10, buffTime: 4,
           allyAtkSpeed: 0.3, allyBuffTime: 5, milestones: [],
           desc: 'Taunt nearby enemies, gain armor. Nearby allies attack faster.' },
      R: { name: 'Earthshatter', cast: 'aim', cd: 60, damage: 200, radius: 170, range: 460, stun: 1.2, leapTime: 0.45,
           shockwaveMul: 0.5, shockwaveRadiusMul: 1.7, shockwaveDelay: 0.22,
           milestones: [{ id: 'shockwave', level: 10, text: 'A second shockwave ring hits farther out (50% dmg)' }],
           desc: 'Leap to a spot and slam down: big AoE damage and stun.' },
    },
    mage: {
      Q: { name: 'Fire Bolt', cast: 'auto', cd: 4, damage: 55, aoe: 70, speed: 950, range: 760,
           milestones: [{ id: 'pierce1', level: 4, text: 'Pierces 1 enemy' }, { id: 'pierce2', level: 8, text: 'Pierces 2 enemies' }],
           desc: 'Autocasts at the enemy you are attacking. Explodes on hit. Q toggles autocast.' },
      W: { name: 'Poison Pool', cast: 'aim', cd: 9, dps: 30, radius: 110, duration: 5, range: 450, tick: 0.5, slow: 0.7,
           milestones: [{ id: 'slow', level: 6, text: 'Pool also slows enemies by 30%' }],
           desc: 'Poison the ground at the cursor: damage per second to enemies inside.' },
      E: { name: 'Deep Freeze', cast: 'aim', cd: 12, damage: 30, radius: 160, range: 500, freeze: 1.5, shatterDamage: 60,
           milestones: [{ id: 'shatter', level: 10, text: 'Frozen enemies shatter when the freeze ends' }],
           desc: 'Freeze enemies in an area at the cursor, rooting them in place.' },
      R: { name: 'Meteor Storm', cast: 'aim', cd: 60, damage: 90, meteors: 6, radius: 200, meteorRadius: 72, range: 620, duration: 3, warn: 0.6,
           bonusMeteorMul: 1.5,
           milestones: [{ id: 'more', level: 10, text: '+50% meteors' }],
           desc: 'Meteors rain on an area over 3s. Each one is telegraphed.' },
    },
  },

  // ---------------------------------------------------------------- LEVELING
  leveling: {                      // no max level
    xpToNext: [100, 160, 230, 310, 400, 500, 610, 730, 860, 1000, 1150],
    xpGrowth: 1.15,                 // past the table, each level needs this × the previous
  },

  // ---------------------------------------------------------------- KEEP & ALLIES
  keep: {
    tiers: [
      { cost: 0,   hp: 1600, spawnEvery: 8,   maxAllies: 4,  attack: null,                                    archers: false, buildRadius: 24, repair: 0 },
      { cost: 300, hp: 2400, spawnEvery: 7.5, maxAllies: 6,  attack: { damage: 22, range: 360, rate: 1.0, shots: 1 }, archers: false, buildRadius: 36, repair: 0 },
      { cost: 550, hp: 3400, spawnEvery: 7,   maxAllies: 8,  attack: { damage: 30, range: 380, rate: 1.2, shots: 1 }, archers: true,  buildRadius: 52, repair: 0 },
      { cost: 900, hp: 4800, spawnEvery: 6,   maxAllies: 10, attack: { damage: 48, range: 420, rate: 1.5, shots: 2 }, archers: true,  buildRadius: 99, repair: 10 },
    ],
    archerEvery: 3,     // every Nth spawn is an archer (tier 3+)
    allyTierScaling: 0.18,
  },
  allies: {
    soldier: { name: 'Soldier', shape: 'circle',  color: 0x4a8fe0, radius: 10, hp: 190, damage: 14, range: 22,  rate: 1.0, armor: 3, speed: 125, aggro: 230 },
    archer:  { name: 'Archer',  shape: 'diamond', color: 0x6fb6ff, radius: 9,  hp: 110, damage: 13, range: 210, rate: 0.9, armor: 1, speed: 125, aggro: 260, ranged: true, projSpeed: 600 },
    leash: 380,          // auto mode: how far from their post allies will chase
    commandLeash: 260,
  },

  // ---------------------------------------------------------------- BUILDINGS
  buildings: {
    arrow:  { name: 'Arrow Tower', key: '1', cost: 100, color: 0x5a6270, core: 0xffffff, tier: 1,
              range: 230, damage: 18, rate: 1.6, projSpeed: 750, desc: 'Fast single-target arrows.' },
    cannon: { name: 'Cannon',      key: '2', cost: 175, color: 0x5a6270, core: 0xff9a3c, tier: 2,
              range: 260, damage: 48, rate: 0.45, aoe: 70, projSpeed: 480, desc: 'Slow, heavy AoE shots.' },
    frost:  { name: 'Frost Tower', key: '3', cost: 150, color: 0x5a6270, core: 0x5ee0ff, tier: 3,
              range: 200, damage: 9, rate: 1.0, aoe: 55, slow: 0.55, slowTime: 1.5, projSpeed: 620, desc: 'Slows enemies in a small area.' },
    barracks: { name: 'Barracks',  key: '4', cost: 200, color: 0x2f5fa8, core: null,     tier: 2,
              allyCap: [2, 3, 4], spawnMul: [0.85, 0.75, 0.65], desc: '+Ally cap and faster ally spawns.' },
    mine:   { name: 'Gold Mine',   key: '5', cost: 150, color: 0xd8b21c, core: null,     tier: 3,
              income: [25, 45, 70], desc: 'Gold every time a wave is cleared.' },
    levelMul: { damage: [1, 1.6, 2.4], range: [0, 20, 40], rate: [1, 1.1, 1.2] },
    upgradeCostMul: [0.8, 1.2],   // cost of level 2, level 3 (× base cost)
    level3KeepTier: 4,
    sellRefund: 0.5,
  },

  // ---------------------------------------------------------------- ITEMS
  items: {
    sword:   { name: 'Iron Sword',      cost: 250, color: 0xc0c6d0, shape: 'triangle', stats: { damage: 12 },               desc: '+12 damage' },
    gloves:  { name: 'Swift Gloves',    cost: 250, color: 0xf2c14e, shape: 'circle',   stats: { attackSpeed: 0.2 },         desc: '+20% attack speed' },
    boots:   { name: 'Leather Boots',   cost: 200, color: 0x9a6b3f, shape: 'square',   stats: { speed: 35 },                desc: '+35 move speed' },
    plate:   { name: 'Plate Armor',     cost: 450, color: 0x7d8696, shape: 'square',   stats: { armor: 8, hp: 150 },        desc: '+8 armor, +150 HP' },
    heart:   { name: 'Heart Crystal',   cost: 300, color: 0xff5a7a, shape: 'diamond',  stats: { hp: 120, hpRegen: 4 },     desc: '+120 HP, +4 HP/s' },
    hourglass: { name: 'Hourglass',     cost: 600, color: 0xe8d9a0, shape: 'hexagon',  stats: { cdr: 0.15 },                desc: '-15% cooldowns' },
    fang:    { name: 'Vampire Fang',    cost: 550, color: 0xb0213a, shape: 'triangle', stats: { lifesteal: 0.15 },          desc: '15% lifesteal on attacks' },
    storm:   { name: 'Storm Blade',     cost: 900, color: 0x7ee8ff, shape: 'diamond',  stats: { damage: 8, chain: 2 },      desc: 'Attacks chain to 2 more enemies (60%)' },
    thorns:  { name: 'Thorn Mail',      cost: 750, color: 0x4f8a3a, shape: 'hexagon',  stats: { armor: 5, thorns: 0.35 },   desc: '+5 armor, reflect 35% melee damage' },
    phoenix: { name: 'Phoenix Feather', cost: 800, color: 0xff7a2a, shape: 'triangle', stats: { revive: 1 },                desc: 'Auto-revive once per level (consumes a level)' },
    focus:   { name: 'Arcane Focus',    cost: 700, color: 0xc77dff, shape: 'circle',   stats: { skillDamage: 0.25 },        desc: '+25% skill damage' },
    cloak:   { name: 'Wind Cloak',      cost: 450, color: 0x9be8c9, shape: 'diamond',  stats: { speed: 15, windCloak: 0.4 },desc: '+15 speed. After W: +40% speed for 2s' },
  },
  itemOrder: ['sword', 'gloves', 'boots', 'plate', 'heart', 'hourglass', 'fang', 'storm', 'thorns', 'phoenix', 'focus', 'cloak'],
  inventorySlots: 6,
  itemSellRefund: 0.5,
  // Buying an owned item levels it up: stats add again each level.
  itemLevelCostMul: 0.5,    // next level costs base × (1 + this × current level)
  itemCaps: { cdr: 0.4, lifesteal: 0.5 },

  // ---------------------------------------------------------------- FEEL
  feel: {
    hitstop: { small: 0.03, charge: 0.055, ult: 0.08, boss: 0.07 },
    damageNumberPool: 70,
  },

  score: { perWave: 100, perKill: 2, perLevel: 50, perSecond: 0.5 },
};

// Convenience tile → pixel helpers
CONFIG.px = (t) => t * CONFIG.TILE;
CONFIG.WORLD_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.WORLD_H = CONFIG.MAP_H * CONFIG.TILE;
