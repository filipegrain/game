// All tunable numbers live here.
// Array values inside skills/buildings are indexed by rank/level - 1.

const CONFIG = {
  TILE: 32,
  VIEW_W: 1280,
  VIEW_H: 720,

  camera: {             // free camera; hold Space to follow the hero
    edgeSize: 14,       // px from the screen edge that triggers edge pan
    edgeSpeed: 1100,    // px/s
    smoothing: 16,      // higher = snappier camera follow
  },

  // ---------------------------------------------------------------- MAP
  // Terrain and markers live in src/map.js (MAP), edited with the map editor. Buildings go on grass or dirt.
  map: {
    ...MAP,
    grassCost: 3,                   // flow-field cost of a grass tile (dirt/bridge = 1): waves keep to the lanes
    spawnClear: 4,                  // no building within this many tiles of an enemy spawn
    campClear: 3,                   // ...or of a camp centre
  },

  startGold: 200,

  // ---------------------------------------------------------------- WAVES
  // Wave 1 comes after `firstDelay` s; each next wave `clearDelay` s after the last one is wiped out (all
  // spawned, none alive). Clearing a wave pays its enemies' XP. Separately, a tick every `tickInterval` s
  // (the first also at `firstDelay`) spawns creeps at every lane whose first tower stands, refills cleared
  // neutral camps and pays tick gold plus Gold Mine income.
  waves: {
    firstDelay: 10,
    clearDelay: 5,
    tickInterval: 60,
    baseCount: 15,             // enemies in wave 1 (all spawns together)
    countPerWave: 5,           // + this many per wave after
    enemyMul: 1.3,             // flat multiplier on enemy hp and damage
    scaling: 1.3,              // how fast waves ramp: e = (wave-1) * scaling
    hpLinear: 0.12,            // hp mul = enemyMul * (1 + hpLinear*e) * hpExp^e
    hpExp: 1.115,
    dmgPerWave: 0.10,
    speedPerWave: 0.012,
    speedCap: 1.35,
    bossEvery: 5,
    bossGrowEvery: 15,         // one more boss per boss wave every this many waves
    bossReplaces: 10,          // regular enemies removed from the wave per boss
    unlocks: { grunt: 1, runner: 2, brute: 3, archer: 4, sapper: 6, shaman: 8 },
    weights: { grunt: 10, runner: 5, brute: 3, archer: 4, sapper: 2, shaman: 1.5 },
    spawnInterval: 0.35,       // seconds between spawns at one spawn point
    tickGoldBase: 60,          // gold paid every wave tick...
    tickGoldPerWave: 8,        // ...growing per wave
    goldPerWaveScaling: 0.05,  // enemy gold bounty grows by this per wave
    xpPerWaveScaling: 0.06,    // enemy xp grows by this per wave
  },

  // ---------------------------------------------------------------- ENEMIES
  enemies: {
    grunt:  { name: 'Grunt',  shape: 'circle',   color: 0xd94040, radius: 11, hp: 35,   speed: 138, damage: 3,  range: 22,  rate: 1.0, armor: 0, aggro: 160, gold: 2,   xp: 8 },
    runner: { name: 'Runner', shape: 'triangle', color: 0xff5a5a, radius: 9,  hp: 20,   speed: 233, damage: 2,  range: 20,  rate: 1.4, armor: 0, aggro: 140, gold: 1,   xp: 6 },
    brute:  { name: 'Brute',  shape: 'square',   color: 0x8b1a1a, radius: 16, hp: 140,  speed: 87,  damage: 9,  range: 24,  rate: 0.7, armor: 6, aggro: 150, gold: 5,   xp: 20 },
    archer: { name: 'Archer', shape: 'diamond',  color: 0xe0505a, radius: 10, hp: 28,   speed: 126, damage: 3,  range: 220, rate: 0.8, armor: 0, aggro: 240, gold: 2,   xp: 10, ranged: true, projSpeed: 520 },
    sapper: { name: 'Sapper', shape: 'square',   color: 0xe0802a, radius: 11, hp: 48,   speed: 129, damage: 4,  range: 24,  rate: 1.0, armor: 2, aggro: 120, gold: 3,   xp: 12, structureMul: 4, structureBreaker: 520 },   // ignores hero/creeps, rushes structures within this range (else the Keep)
    shaman: { name: 'Shaman', shape: 'circle',   color: 0x9b4dca, radius: 12, hp: 60,   speed: 105, damage: 3,  range: 180, rate: 0.7, armor: 1, aggro: 200, gold: 4,   xp: 16, ranged: true, projSpeed: 420,
              healEvery: 2.5, healRadius: 170, healPct: 0.08, hasteMul: 1.25, hasteTime: 3 },
    boss:   { name: 'Boss',   shape: 'hexagon',  color: 0xc81e1e, radius: 30, hp: 2600, speed: 82,  damage: 55, range: 30,  rate: 0.6, armor: 8, aggro: 200, gold: 150, xp: 400,
              structureMul: 2, slamEvery: 6.5, slamRadius: 160, slamDamage: 110, slamWindup: 1.0, slamStun: 0.8 },
  },

  // ---------------------------------------------------------------- HEROES
  // perLevel: flat hp / hpRegen / damage per level; attackSpeed and speed are fractions of the base per level
  // (speed growth capped at heroCommon.speedGrowthCap). Armor does not grow.
  // attack: 'cleave' = every enemy in the half circle toward the target, out to cleaveReach px from the hero's edge;
  //         'splash' = a fireball that explodes in splashRadius; 'arrow' = a fast single-target arrow.
  heroes: {
    warrior: {
      name: 'Warrior', tagline: 'Melee · tank · cleaves everything in front', color: 0x3b82f6, radius: 15,
      hp: 780, hpRegen: 5,
      damage: 30, attackRate: 0.8, windup: 0.16, range: 34, armor: 6,
      speed: 255, accel: 9000, acquireRange: 220,
      perLevel: { hp: 95, hpRegen: 0.6, damage: 3.4, attackSpeed: 0.03, speed: 0.008 },
      attack: 'cleave', cleaveReach: 60, cleaveKnock: 60, attackDesc: 'Attack: cleaves every enemy in a half circle',
    },
    mage: {
      name: 'Mage', tagline: 'Ranged · fragile · fast · exploding fireballs', color: 0xa855f7, radius: 13,
      hp: 380, hpRegen: 1.5,
      damage: 24, attackRate: 0.9, windup: 0.14, range: 340, armor: 1,
      speed: 290, accel: 9000, acquireRange: 380,
      perLevel: { hp: 34, hpRegen: 0.2, damage: 2.6, attackSpeed: 0.04, speed: 0.015 },
      attack: 'splash', splashRadius: 46, projSpeed: 820, attackDesc: 'Attack: fireball that explodes in a small area',
    },
    archer: {
      name: 'Archer', tagline: 'Ranged · rapid single-target arrows', color: 0x22c55e, radius: 13,
      hp: 500, hpRegen: 2.5,
      damage: 16, attackRate: 1.5, windup: 0.08, range: 420, armor: 3,
      speed: 270, accel: 9000, acquireRange: 460,
      perLevel: { hp: 50, hpRegen: 0.33, damage: 1.7, attackSpeed: 0.045, speed: 0.011 },
      attack: 'arrow', projSpeed: 1800, attackDesc: 'Attack: very fast single-target arrow',
    },
  },
  heroCommon: {
    critChance: 0.12,
    critMult: 1.8,
    speedGrowthCap: 0.3,     // move speed gained from levels stops at +30%
    respawnBase: 5,          // respawn = base + level seconds
    skillBufferTime: 0.4,    // s a skill press is remembered while the hero is busy
    skillPicks: 3,           // skills chosen before the run, bound to SKILL_KEYS in pick order
    // Skills scale with hero level (per level above 1)
    skillScaling: { damage: 0.08, radius: 0.015, duration: 0.025, cdr: 0.015, cdrCap: 0.3 },
    totalCdrCap: 0.6,        // level cdr + item cdr combined
  },

  // Nine active skills per hero; the player takes heroCommon.skillPicks of them before the run (Q/W/E in pick order).
  // cast: 'aim' = key then left-click at the cursor, 'instant' = fires on key press (toward the cursor).
  // aim: indicator while aiming: 'circle' (range + radius), 'line' (range + width), 'cone' (range + arc),
  //      'wall' (range + length), 'target' (an enemy near the cursor within range), 'dash' (range).
  // Damage = skillDamage(damage) + adMul × attack damage. radius scales with skillScaling.radius, durations with .duration.
  // icon: [shape, colour] for the HUD and the skill card. move: a movement skill (triggers Wind Cloak).
  // utility: deals little or no damage of its own (the sim report doesn't flag its low damage share).
  // knock values are knockback forces.
  skills: {
    warrior: {
      charge:    { name: 'Charge', cast: 'aim', aim: 'dash', cd: 10, range: 320, speed: 1400, width: 26, minDist: 80, damage: 30, adMul: 1, stun: 1, knock: 260, move: true,
                   icon: ['triangle', 0x9cc8ff], desc: 'Rush toward the cursor. The first enemy hit is stunned for 1s; everyone in the way is hit and shoved aside.' },
      leap:      { name: 'Leap Slam', cast: 'aim', aim: 'circle', cd: 12, range: 300, radius: 110, airTime: 0.45, damage: 50, adMul: 1.2, knock: 300, move: true,
                   icon: ['hexagon', 0xffb347], desc: 'Jump to a spot. The landing hits everything around and knocks it away.' },
      whirlwind: { name: 'Whirlwind', cast: 'instant', cd: 14, duration: 3, radius: 95, tick: 0.3, adMul: 0.5, moveMul: 0.75, knock: 40,
                   icon: ['circle', 0x7ee8ff], desc: 'Spin for 3s, hitting everything around you several times a second. You can move, slowly.' },
      warcry:    { name: 'War Cry', cast: 'instant', cd: 18, radius: 230, duration: 3, reduction: 0.5, utility: true,
                   icon: ['diamond', 0xff6040], desc: 'Taunt every enemy nearby for 3s and take 50% less damage meanwhile.' },
      hook:      { name: 'Chain Hook', cast: 'aim', aim: 'line', cd: 9, range: 420, width: 12, speed: 1300, damage: 50, adMul: 1, stun: 0.6, pullStun: 0.25, bossSlow: 0.5, bossSlowTime: 2,
                   pullSpeed: 1400, pullTime: 0.5, utility: true,
                   icon: ['triangle', 0xc0c6d0], desc: 'Throw a chain. The first enemy hit is dragged to you and stunned (bosses are only slowed).' },
      fissure:   { name: 'Fissure', cast: 'aim', aim: 'line', cd: 11, range: 460, width: 42, speed: 900, damage: 55, adMul: 0.8, slow: 0.5, slowTime: 2, knock: 60, fade: 1.2,
                   icon: ['square', 0x9a6b3f], desc: 'A shockwave runs along the ground, hitting and slowing everything it crosses.' },
      riposte:   { name: 'Riposte', cast: 'instant', cd: 15, duration: 1.5, range: 190, arc: 2.1, damage: 40, adMul: 1, reflect: 2, knock: 220,
                   icon: ['diamond', 0xe8d9a0], desc: 'Block all damage for 1.5s, then release a cone blast: base damage plus twice what you blocked.' },
      execute:   { name: 'Execute', cast: 'aim', aim: 'target', cd: 8, range: 260, speed: 1500, damage: 40, adMul: 2, missingMul: 3, overshoot: 60, knock: 120,
                   icon: ['triangle', 0xd02020], desc: 'Leap at an enemy for one huge strike, up to 4x stronger at low HP. A kill resets the cooldown.' },
      banner:    { name: 'War Banner', cast: 'aim', aim: 'circle', cd: 25, range: 400, radius: 190, duration: 8, atkSpeed: 0.4, vuln: 0.25, utility: true,
                   icon: ['square', 0xffd23f], desc: 'Plant a banner for 8s: you and your creeps inside attack 40% faster, enemies inside take 25% more damage.' },
    },
    mage: {
      blink:     { name: 'Blink', cast: 'aim', aim: 'dash', cd: 8, range: 300, radius: 120, damage: 60, slow: 0.5, slowTime: 2, move: true,
                   icon: ['diamond', 0xc77dff], desc: 'Teleport a short distance. The spot you left bursts in a frost nova that hits and slows.' },
      freeze:    { name: 'Deep Freeze', cast: 'aim', aim: 'circle', cd: 12, range: 500, radius: 150, damage: 35, freeze: 1.5,
                   icon: ['hexagon', 0x5ee0ff], desc: 'Freeze enemies in an area, rooting them in place.' },
      meteor:    { name: 'Meteor', cast: 'aim', aim: 'circle', cd: 16, range: 620, radius: 130, warn: 1, damage: 190, knock: 220, burnDps: 35, burnTime: 3, tick: 0.5,
                   icon: ['circle', 0xff5030], desc: 'One meteor, telegraphed for 1s. Huge area damage, and the ground burns for 3s.' },
      lightning: { name: 'Chain Lightning', cast: 'aim', aim: 'target', cd: 7, range: 560, damage: 95, jumps: 6, jumpRange: 230, falloff: 0.85,
                   icon: ['triangle', 0x7ee8ff], desc: 'A bolt that jumps between up to 7 enemies, a little weaker with each jump.' },
      pool:      { name: 'Poison Pool', cast: 'aim', aim: 'circle', cd: 10, range: 450, radius: 110, duration: 5, dps: 30, tick: 0.5, slow: 0.7,
                   icon: ['circle', 0x7cd63c], desc: 'Poison the ground for 5s: damage over time and a 30% slow.' },
      gravity:   { name: 'Gravity Well', cast: 'aim', aim: 'circle', cd: 20, range: 520, radius: 210, duration: 2.5, pull: 230, implodeRadius: 120, damage: 120,
                   icon: ['hexagon', 0x6b4dca], desc: 'A singularity pulls enemies to its centre for 2.5s, then implodes.' },
      flamewall: { name: 'Flame Wall', cast: 'aim', aim: 'wall', cd: 14, range: 480, length: 280, width: 30, duration: 4, dps: 85, tick: 0.25,
                   icon: ['square', 0xff7a2a], desc: 'Raise a wall of fire across the cursor for 4s. Enemies crossing it burn.' },
      orb:       { name: 'Arcane Orb', cast: 'aim', aim: 'line', cd: 9, range: 720, width: 26, speed: 360, damage: 80, burstRadius: 120, burstDamage: 130, burstKnock: 160,
                   icon: ['circle', 0xd8b4fe], desc: 'A slow orb pierces everything in a line, then bursts. Press the key again to burst it early.' },
      polymorph: { name: 'Polymorph', cast: 'aim', aim: 'circle', cd: 18, range: 480, radius: 95, duration: 2.5, bossDuration: 1, critterSpeed: 60, utility: true,
                   icon: ['circle', 0xff9ad5], desc: 'Turn enemies in a small area into harmless critters for 2.5s (bosses 1s).' },
    },
    archer: {
      tumble:    { name: 'Tumble', cast: 'aim', aim: 'dash', cd: 6, range: 170, speed: 1100, critWindow: 3, move: true, utility: true,
                   icon: ['triangle', 0x86efac], desc: 'Roll toward the cursor. Your next attack within 3s is a guaranteed critical hit.' },
      volley:    { name: 'Volley', cast: 'aim', aim: 'cone', cd: 8, range: 520, arc: 0.9, arrows: 9, speed: 1300, damage: 30, adMul: 0.8,
                   icon: ['triangle', 0xfacc15], desc: 'Fire a fan of 9 arrows in a cone.' },
      pierce:    { name: 'Piercing Shot', cast: 'aim', aim: 'line', cd: 9, range: 950, width: 10, speed: 2400, damage: 90, adMul: 1.5, knock: 90,
                   icon: ['diamond', 0xe5e7eb], desc: 'A long-range arrow that hits every enemy in a line.' },
      rain:      { name: 'Arrow Rain', cast: 'aim', aim: 'circle', cd: 14, range: 560, radius: 140, duration: 3, dps: 40, tick: 0.25, slow: 0.6,
                   icon: ['hexagon', 0xa3e635], desc: 'Arrows rain on an area for 3s, hitting and slowing everything inside.' },
      trap:      { name: 'Explosive Trap', cast: 'aim', aim: 'circle', cd: 6, range: 420, radius: 110, trigger: 34, arm: 0.5, life: 45, max: 3, damage: 110, root: 1.5,
                   icon: ['square', 0xf97316], desc: 'Place a trap (up to 3). The first enemy to step on it sets off an explosion that roots everything nearby.' },
      mark:      { name: "Hunter's Mark", cast: 'aim', aim: 'target', cd: 12, range: 700, duration: 8, vuln: 0.3, jumpRange: 320, utility: true,
                   icon: ['diamond', 0xef4444], desc: 'Mark an enemy: it takes 30% more damage from everything. If it dies, the mark jumps to the nearest enemy.' },
      rapid:     { name: 'Rapid Fire', cast: 'instant', cd: 16, duration: 4, atkSpeed: 1, utility: true,
                   icon: ['circle', 0xfde047], desc: '4s of double attack speed, and you can shoot while moving.' },
      net:       { name: 'Net Shot', cast: 'aim', aim: 'line', cd: 10, range: 460, width: 14, speed: 1500, damage: 60, adMul: 1, root: 2, netRadius: 60, splashRoot: 0.6, recoil: 220, recoilSpeed: 1100, move: true,
                   icon: ['hexagon', 0xd6d3d1], desc: 'Fire a net that roots the first enemy hit (and those next to it) and throws you backward.' },
      snipe:     { name: 'Snipe', cast: 'aim', aim: 'target', cd: 20, range: 1400, channel: 1, damage: 260, adMul: 6, knock: 200,
                   icon: ['triangle', 0xffffff], desc: 'Aim for 1s, then a massive shot at one enemy from very far away.' },
    },
  },

  // ---------------------------------------------------------------- LEVELING
  leveling: {                      // no max level
    xpToNext: [100, 160, 230, 310, 400, 500, 610, 730, 860, 1000, 1150],
    xpGrowth: 1.15,                 // past the table, each level needs this × the previous
  },

  // ---------------------------------------------------------------- KEEP, TOWERS & CREEPS
  // Keep tiers make the lane towers and creeps stronger (tierScaling per tier above 1).
  keep: {
    tiers: [
      { cost: 0,   hp: 1600, attack: null,                                         repair: 0 },
      { cost: 300, hp: 2400, attack: { damage: 66, range: 1080, rate: 1.0, shots: 1 },  repair: 0 },
      { cost: 550, hp: 3400, attack: { damage: 90, range: 1140, rate: 1.2, shots: 1 },  repair: 0 },
      { cost: 900, hp: 4800, attack: { damage: 144, range: 1260, rate: 1.5, shots: 2 }, repair: 10 },
    ],
    tierScaling: 0.15,   // tower and creep hp/damage per Keep tier above 1
    repairRadius: 1200,  // a repairing Keep also repairs structures this close (px), same HP/s
  },
  tower: {               // allied lane tower (fixed on the map; destroyed for good)
    hp: 1400, armor: 6, range: 260, damage: 30, rate: 1.0, projSpeed: 750,
  },
  allies: {              // lane creeps: spawned at a lane's first tower every wave tick, push toward the enemy spawn
    perLane: 5,
    archersPerLane: [1, 1, 2, 2],   // archers among them, by Keep tier
    soldier: { name: 'Soldier', shape: 'circle',  color: 0x4a8fe0, radius: 10, hp: 160, damage: 11, range: 22,  rate: 1.0, armor: 3, speed: 110, aggro: 230 },
    archer:  { name: 'Archer',  shape: 'diamond', color: 0x6fb6ff, radius: 9,  hp: 90,  damage: 10, range: 210, rate: 0.9, armor: 1, speed: 110, aggro: 260, ranged: true, projSpeed: 600 },
  },

  // ---------------------------------------------------------------- NEUTRALS
  // Camps of neutral monsters. They fight back only when the hero hits them; only the hero can damage them.
  // A cleared camp refills on the next wave tick. Stats scale with the current wave like enemies.
  neutrals: {
    perCamp: 3,
    leash: 320,          // px from the camp before they give up and walk home (healing)
    weak:   { name: 'Wolf',  shape: 'circle',  color: 0x5fb3a8, radius: 12, hp: 160, speed: 150, damage: 10, range: 24, rate: 1.0, armor: 2, gold: 12, xp: 25 },
    strong: { name: 'Golem', shape: 'hexagon', color: 0x3f8f86, radius: 16, hp: 420, speed: 120, damage: 22, range: 28, rate: 0.8, armor: 6, gold: 30, xp: 60 },
  },

  // ---------------------------------------------------------------- BUILDINGS
  buildings: {
    footprint: 2,   // each building occupies footprint x footprint tiles (top-left = placement tile). Buildings block movement and can be destroyed.
    arrow:  { name: 'Arrow Tower', key: '1', cost: 100, color: 0x5a6270, core: 0xffffff, tier: 1, hp: 700,
              range: 230, damage: 18, rate: 1.6, projSpeed: 750, desc: 'Fast single-target arrows.' },
    cannon: { name: 'Cannon',      key: '2', cost: 175, color: 0x5a6270, core: 0xff9a3c, tier: 2, hp: 900,
              range: 260, damage: 48, rate: 0.45, aoe: 70, projSpeed: 480, desc: 'Slow, heavy AoE shots.' },
    frost:  { name: 'Frost Tower', key: '3', cost: 150, color: 0x5a6270, core: 0x5ee0ff, tier: 3, hp: 700,
              range: 200, damage: 9, rate: 1.0, aoe: 55, slow: 0.55, slowTime: 1.5, projSpeed: 620, desc: 'Slows enemies in a small area.' },
    mine:   { name: 'Gold Mine',   key: '4', cost: 150, color: 0xd8b21c, core: null,     tier: 3, hp: 400,
              income: [25, 45, 70], desc: 'Gold every wave tick.' },
    levelMul: { damage: [1, 1.6, 2.4], range: [0, 20, 40], rate: [1, 1.1, 1.2], hp: [1, 1.5, 2.2] },
    armor: 4,
    upgradeCostMul: [0.8, 1.2],   // cost of level 2, level 3 (× base cost)
    level3KeepTier: 4,
    sellRefund: 0.5,
  },

  // ---------------------------------------------------------------- ITEMS
  // Gained on level-up: pick 1 of itemPickCount random items. Picking an owned item levels it up (stats add again).
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
    cloak:   { name: 'Wind Cloak',      color: 0x9be8c9, shape: 'diamond',  stats: { speed: 15, windCloak: 0.4 },desc: '+15 speed. After a movement skill: +40% speed for 2s' },
  },
  itemOrder: ['sword', 'gloves', 'boots', 'plate', 'heart', 'hourglass', 'fang', 'storm', 'thorns', 'phoenix', 'focus', 'cloak'],
  itemPickCount: 3,
  itemPickOwnedWeight: 1,   // pick weight = 1 + item level x this (owned items show up more)
  itemCaps: { cdr: 0.4, lifesteal: 0.5 },
  phoenixCooldown: 180,     // s, divided by Phoenix level
  windCloakTime: 2,         // s of Wind Cloak speed after a movement skill

  // ---------------------------------------------------------------- FEEL
  feel: {
    hitstop: { small: 0.03, charge: 0.055, ult: 0.08, boss: 0.07 },
    damageNumberPool: 70,
  },

  score: { perWave: 150, perKill: 3, perLevel: 75, perSecond: 0.75, bestKey: 'cd_best_hard' },   // key name kept so best scores from the old Hard mode carry over

  // ---------------------------------------------------------------- BALANCE SIMULATION
  // Headless only (tools/simpar.mjs). A bot plays every selected hero × loadout × strategy × seed in the real GameScene.
  sim: {
    step: 1 / 30,            // fixed sim tick (s). Kept below the game's 0.05 clamp so Charge/skillshots don't tunnel.
    frameBudgetMs: 14,       // real ms per frame spent stepping the simulation (at 60 fps)
    defaultSeeds: 3,
    defaultWaveCap: 30,      // a run that clears this many waves ends as "cap"
    baseSeed: 1000,          // seed index i uses baseSeed + i (same seeds for every combination)
    stallTime: 240,          // a wave still alive after this many s ends the run as "stalled"

    bot: {
      thinkEvery: 0.25,      // s between movement decisions
      skillEvery: 0.1,       // s between skill checks
      retreatHp: 0.3,        // fall back to the Keep below this HP fraction...
      resumeHp: 0.65,        // ...and return to the fight above this one
      clusterMin: 3,         // area skills wait for this many enemies (or a boss)
      scanRange: 900,        // skill rules consider hostiles within this many px
      lineMin: 2,            // line skills wait for this many enemies in a lane (or a boss, or the focus in range)
      lineCluster: 3,        // ...this many for the wide line skills (Charge, Fissure, Arcane Orb, Volley)
      chargeMinDist: 120,    // Charge at the focus enemy when it is farther than this
      retreatDashThreat: 140,  // while retreating, dash home when a threat is this close
      hookMinDist: 90,       // Chain Hook only pulls enemies farther than this
      warcryHp: 0.6,         // War Cry with any enemy near once below this HP fraction
      riposteThreat: 120, riposteMin: 2, riposteBossRange: 200,
      executeHp: 0.6,        // Execute targets below this HP fraction
      blinkThreat: 110,      // Blink away from threats this close...
      tumbleThreat: 130,     // ...Tumble away from these
      polyThreat: 160,       // Polymorph a pack this close to the hero
      netThreat: 160,        // Net Shot the nearest threat this close
      trapLead: 0.6,         // s of the lead enemy's movement to place a trap ahead of it
      snipeMinHp: 150,       // Snipe only bosses or enemies with this much max HP
    },

    // Skill loadouts the bot plays (every job runs once per loadout). Skill ids from CONFIG.skills[hero], Q/W/E in order.
    loadouts: {
      warrior: { bruiser: ['charge', 'whirlwind', 'execute'], control: ['hook', 'warcry', 'fissure'], leader: ['leap', 'banner', 'riposte'] },
      mage: { burst: ['meteor', 'lightning', 'orb'], control: ['freeze', 'gravity', 'pool'], zone: ['blink', 'flamewall', 'polymorph'] },
      archer: { hunter: ['mark', 'snipe', 'rapid'], skirmish: ['tumble', 'volley', 'net'], siege: ['pierce', 'rain', 'trap'] },
    },

    // Item pick priority per hero: on level-up the bot takes the first offered item in this list (else the first offered).
    itemBuilds: {
      warrior: ['sword', 'plate', 'gloves', 'fang', 'heart', 'thorns', 'storm', 'hourglass', 'focus', 'phoenix', 'boots', 'cloak'],
      mage: ['focus', 'gloves', 'hourglass', 'heart', 'sword', 'storm', 'fang', 'plate', 'phoenix', 'boots', 'thorns', 'cloak'],
      archer: ['gloves', 'sword', 'storm', 'fang', 'heart', 'hourglass', 'focus', 'plate', 'phoenix', 'boots', 'thorns', 'cloak'],
    },

    // Spending policies. The bot runs `opening` once, then repeats `loop`, saving up for each step.
    // Steps: 'keep' | 'arrow' | 'cannon' | 'frost' (upgrade an existing one of that type if possible, else build)
    //        | 'mine' (build, else upgrade). Locked / impossible steps are skipped.
    strategies: {
      carry:    { label: 'Hero only',  hero: 'active', opening: [], loop: [] },
      turtle:   { label: 'Turtle',     hero: 'active', opening: ['arrow', 'arrow', 'keep', 'cannon'], loop: ['arrow', 'cannon', 'keep', 'frost', 'cannon', 'arrow'] },
      economy:  { label: 'Economy',    hero: 'active', opening: ['arrow', 'keep', 'keep', 'mine', 'mine', 'mine'], loop: ['arrow', 'mine', 'cannon', 'keep', 'frost'] },
      keepRush: { label: 'Keep rush',  hero: 'active', opening: ['keep', 'keep', 'keep'], loop: ['arrow', 'cannon', 'arrow', 'frost'] },
      balanced: { label: 'Balanced',   hero: 'active', opening: ['arrow', 'keep', 'arrow'], loop: ['cannon', 'keep', 'arrow', 'frost'] },
      idle:     { label: 'Idle hero',  hero: 'idle',   opening: ['arrow', 'arrow', 'keep', 'cannon'], loop: ['arrow', 'cannon', 'keep', 'frost', 'cannon', 'arrow'] },
    },

    // Report flags
    flags: {
      heroRatio: 1.1,          // one class (median loadout) survives this × longer than another
      strategyRatio: 1.5,      // best strategy vs median strategy (same hero)
      idleShare: 0.85,         // idle hero reaches this fraction of the best active strategy → hero matters little
      towerValueRatio: 2,      // tower damage-per-gold this × above/below the median tower
      lowSkillShare: 0.04,     // a skill doing less than this share of hero damage (in the runs that took it)
      keepDamageShare: 0.5,    // one enemy type dealing more than this share of Keep damage
      earlyLossWave: 5,        // any run lost before this wave
    },
  },
};

// Each skill def knows its own id (damage tags, the sim report)
for (const hero in CONFIG.skills) for (const id in CONFIG.skills[hero]) CONFIG.skills[hero][id].id = id;

// Convenience tile → pixel helpers
CONFIG.px = (t) => t * CONFIG.TILE;
CONFIG.MAP_W = CONFIG.map.grid[0].length;
CONFIG.MAP_H = CONFIG.map.grid.length;
CONFIG.WORLD_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.WORLD_H = CONFIG.MAP_H * CONFIG.TILE;
