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
      // cast 'passive' = no key press; the key only names the HUD slot.
      // cdStat: hero stat (from items) subtracted from the base cd, floored at minCd.
      Q: { name: 'Whirl', cast: 'passive', cd: 1, chance: 0.35, radius: 90, knock: 140,
           desc: 'Basic attacks have a chance to hit every enemy around you for your attack damage. 1s internal cooldown.' },
      W: { name: 'Rage', cast: 'passive', cd: 80, minCd: 30, cdStat: 'rageCd', threshold: 0.05, duration: 5,
           lifesteal: 1, damageMul: 2, critBonus: 1.0, fxInterval: 0.08,
           desc: 'Below 5% HP (or on a killing blow): 5s of 100% lifesteal, double damage, +100% crit damage. Cannot die meanwhile.' },
      E: { name: 'Bloodthirst', cast: 'passive', perKill: 0.1,
           desc: 'Gain 0.1 attack damage for every enemy you kill. Kept for the whole run.' },
      R: { name: 'Dash', cast: 'instant', cd: 12, minCd: 4, cdStat: 'dashCd', range: 200, speed: 1500, width: 22, windCloak: true,
           desc: 'Dash toward the cursor. Enemies you pass and enemies around the landing spot take a critical Whirl.' },
    },
    mage: {
      Q: { name: 'Fire Bolt', cast: 'auto', cd: 4, damage: 55, aoe: 70, speed: 950, range: 760,
           milestones: [{ id: 'pierce1', level: 4, text: 'Pierces 1 enemy' }, { id: 'pierce2', level: 8, text: 'Pierces 2 enemies' }],
           desc: 'Autocasts at the enemy you are attacking. Explodes on hit. Q toggles autocast.' },
      W: { name: 'Poison Pool', cast: 'aim', windCloak: true, cd: 9, dps: 30, radius: 110, duration: 5, range: 450, tick: 0.5, slow: 0.7,
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
  // Gained on level-up: pick 1 of itemPickCount random items. Picking an owned item levels it up (stats add again).
  // `hero` limits an item to one hero's pool.
  items: {
    sword:   { name: 'Iron Sword',      color: 0xc0c6d0, shape: 'triangle', stats: { damage: 12 },               desc: '+12 damage' },
    gloves:  { name: 'Swift Gloves',    color: 0xf2c14e, shape: 'circle',   stats: { attackSpeed: 0.2 },         desc: '+20% attack speed' },
    boots:   { name: 'Leather Boots',   color: 0x9a6b3f, shape: 'square',   stats: { speed: 35 },                desc: '+35 move speed' },
    plate:   { name: 'Plate Armor',     color: 0x7d8696, shape: 'square',   stats: { armor: 8, hp: 150 },        desc: '+8 armor, +150 HP' },
    heart:   { name: 'Heart Crystal',   color: 0xff5a7a, shape: 'diamond',  stats: { hp: 120, hpRegen: 4 },     desc: '+120 HP, +4 HP/s' },
    hourglass: { name: 'Hourglass',     color: 0xe8d9a0, shape: 'hexagon',  stats: { cdr: 0.15 },                desc: '-15% cooldowns' },
    fang:    { name: 'Vampire Fang',    color: 0xb0213a, shape: 'triangle', stats: { lifesteal: 0.15 },          desc: '15% lifesteal on attacks' },
    storm:   { name: 'Storm Blade',     color: 0x7ee8ff, shape: 'diamond',  stats: { damage: 8, chain: 2 },      desc: 'Attacks chain to 2 more enemies (60%)' },
    thorns:  { name: 'Thorn Mail',      color: 0x4f8a3a, shape: 'hexagon',  stats: { armor: 5, thorns: 0.35 },   desc: '+5 armor, reflect 35% melee damage' },
    phoenix: { name: 'Phoenix Feather', color: 0xff7a2a, shape: 'triangle', stats: { revive: 1 },                desc: 'Revive at 50% HP instead of dying. Cooldown 180s / level' },
    focus:   { name: 'Arcane Focus',    color: 0xc77dff, shape: 'circle',   stats: { skillDamage: 0.25 },        desc: '+25% skill damage' },
    cloak:   { name: 'Wind Cloak',      color: 0x9be8c9, shape: 'diamond',  stats: { speed: 15, windCloak: 0.4 },desc: '+15 speed. After Dash (Warrior) / Poison Pool (Mage): +40% speed for 2s' },
    whirl:   { name: 'Whirl Edge',      color: 0x9cc8ff, shape: 'circle',   hero: 'warrior', stats: { whirlChance: 0.1, whirlRadius: 0.1 }, desc: 'Whirl: +10% chance, +10% radius' },
    greaves: { name: 'Charger Greaves', color: 0x6a8fd0, shape: 'square',   hero: 'warrior', stats: { dashRange: 0.15, dashCd: 1 },     desc: 'Dash: +15% range, -1s cooldown (min 4s)' },
    trophy:  { name: 'Trophy Belt',     color: 0xd8a03a, shape: 'hexagon',  hero: 'warrior', stats: { killDamage: 0.05 },               desc: 'Bloodthirst: +0.05 damage per kill' },
    mask:    { name: 'Berserker Mask',  color: 0xd02020, shape: 'triangle', hero: 'warrior', stats: { rageTime: 1, rageCd: 8 },         desc: 'Rage: +1s duration, -8s cooldown (min 30s)' },
  },
  itemOrder: ['sword', 'gloves', 'boots', 'plate', 'heart', 'hourglass', 'fang', 'storm', 'thorns', 'phoenix', 'focus', 'cloak', 'whirl', 'greaves', 'trophy', 'mask'],
  itemPickCount: 3,
  itemPickOwnedWeight: 1,   // pick weight = 1 + item level x this (owned items show up more)
  itemCaps: { cdr: 0.4, lifesteal: 0.5 },
  phoenixCooldown: 180,     // s, divided by Phoenix level
  windCloakTime: 2,         // s of Wind Cloak speed after a windCloak skill

  // ---------------------------------------------------------------- FEEL
  feel: {
    hitstop: { small: 0.03, charge: 0.055, ult: 0.08, boss: 0.07 },
    damageNumberPool: 70,
  },

  score: { perWave: 100, perKill: 2, perLevel: 50, perSecond: 0.5 },

  // ---------------------------------------------------------------- BALANCE SIMULATION
  // Menu → Simulate. A bot plays every selected hero × difficulty × strategy × seed in the real GameScene.
  sim: {
    step: 1 / 30,            // fixed sim tick (s). Kept below the game's 0.05 clamp so Charge/skillshots don't tunnel.
    frameBudgetMs: 14,       // real ms per frame spent stepping the simulation (at 60 fps)
    maxFrameBudgetMs: 200,   // when frames are throttled (background tab), step up to this long per frame
    defaultSeeds: 3,
    defaultWaveCap: 40,
    baseSeed: 1000,          // seed index i uses baseSeed + i (same seeds for every combination)
    waveTimeout: 300,        // s of game time; a wave lasting longer ends the run as 'stalled'
    storageKey: 'cd_sim_last',

    bot: {
      thinkEvery: 0.25,      // s between movement decisions
      skillEvery: 0.1,       // s between skill checks
      retreatHp: 0.3,        // fall back to the Keep below this HP fraction...
      resumeHp: 0.65,        // ...and return to the fight above this one
      warrior: {
        dashMinDist: 120,      // Dash toward the focus enemy when it is farther than this...
        dashCluster: 3,        // ...or through a cluster this big
      },
      mage: {
        poolMin: 3,
        freezeKeepDist: 260,   // freeze enemies this close to the Keep...
        freezeHeroDist: 130,   // ...or this close to the hero
        ultMin: 6,
      },
    },

    // Item pick priority per hero: on level-up the bot takes the first offered item in this list (else the first offered).
    itemBuilds: {
      warrior: ['sword', 'whirl', 'plate', 'gloves', 'fang', 'trophy', 'heart', 'mask', 'thorns', 'greaves', 'storm', 'hourglass', 'focus', 'phoenix', 'boots', 'cloak'],
      mage: ['focus', 'gloves', 'hourglass', 'heart', 'sword', 'storm', 'fang', 'plate', 'phoenix', 'boots', 'thorns', 'cloak'],
    },

    // Spending policies. The bot runs `opening` once, then repeats `loop`, saving up for each step.
    // Steps: 'keep' | 'arrow' | 'cannon' | 'frost' (upgrade an existing one of that type if possible, else build)
    //        | 'barracks' | 'mine' (build, else upgrade). Locked / impossible steps are skipped.
    strategies: {
      carry:    { label: 'Hero only',  hero: 'active', opening: [], loop: [] },
      turtle:   { label: 'Turtle',     hero: 'active', opening: ['arrow', 'arrow', 'keep', 'cannon'], loop: ['arrow', 'cannon', 'keep', 'frost', 'cannon', 'arrow'] },
      economy:  { label: 'Economy',    hero: 'active', opening: ['arrow', 'keep', 'keep', 'mine', 'mine', 'mine'], loop: ['arrow', 'mine', 'cannon', 'keep', 'frost'] },
      keepRush: { label: 'Keep rush',  hero: 'active', opening: ['keep', 'keep', 'keep', 'barracks', 'barracks'], loop: ['barracks', 'arrow', 'cannon'] },
      balanced: { label: 'Balanced',   hero: 'active', opening: ['arrow', 'keep', 'arrow'], loop: ['cannon', 'keep', 'arrow', 'frost'] },
      idle:     { label: 'Idle hero',  hero: 'idle',   opening: ['arrow', 'arrow', 'keep', 'cannon'], loop: ['arrow', 'cannon', 'keep', 'frost', 'cannon', 'arrow'] },
    },

    // Report flags
    flags: {
      heroRatio: 1.3,          // one hero survives this × longer than the other (same difficulty)
      strategyRatio: 1.5,      // best strategy vs median strategy (same hero + difficulty)
      idleShare: 0.85,         // idle hero reaches this fraction of the best active strategy → hero matters little
      towerValueRatio: 2,      // tower damage-per-gold this × above/below the median tower
      lowSkillShare: 0.04,     // a skill doing less than this share of hero damage
      keepDamageShare: 0.5,    // one enemy type dealing more than this share of Keep damage
      earlyLossWave: 5,        // any run lost before this wave
    },
  },
};

// Convenience tile → pixel helpers
CONFIG.px = (t) => t * CONFIG.TILE;
CONFIG.WORLD_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.WORLD_H = CONFIG.MAP_H * CONFIG.TILE;
