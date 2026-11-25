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
  // Generated from docs/map-sketch.png by tools/sketch2map.mjs (one char per 32px tile):
  //   '.' grass   ':' dirt   '=' bridge   '~' river   '#' rock   'T' trees
  // Grass, dirt and bridges are walkable. Rocks, trees and the river block everything.
  // Buildings go on grass or dirt. Marker positions below are in tiles (centres).
  map: {
    grid: [
      '##########TT##############TTTT##===============......######################:::::::::################TTTTTTTTTTTTTTTT####',
      '##########TTT############TTTTT::================:::::...###################::::::::::#############...TTTTTTTTTTTTTTT####',
      '###:######TTTTTT########TTT:::::=======:========:::::::::::################::::::::::##########......TTTTTTTTTTTTTTT####',
      '##::::###TTTTTTT.#######TT::::::================:::::::::::::......########::::::::::######...........TTTTTTTTT.:::::###',
      '##::::::.TTTTTTT..#####TT:::::::================::::::::::::::::...........::::::::::...........................::::::##',
      '##::::::.TTTTTTT..#####TT::::::TTTTTT~~~~~~~~~........:::::::::::::.........:::::::............::::::::::::::::::::::::#',
      '##:::::::TTTTTTT..#####T:::::::TTTTTT~~~~~~~~~...........:::::::::::::........:::.............:::::::::::::::::::::::::#',
      '##:::::::###TTTT..#####T:::::::TTTTTT~~~~~~~~~~............:::::::::::::.....::::............:::::::::::::::::::::::::##',
      '###:.::::###TTTT..#####:::::::TTTTTTT~~~~~~~~~~...TTT......::::::::::::::::::::::...........::::::::::::::::::::::::::##',
      '#####::::###TTTT.######::::::.TTTTTT~~~~~~~~~~~~..TTTT....::::::.::::::::::::::::..........:::::::::............::::::##',
      '#####::::###TTT.#######::::::.TTTTTT~~~~~~~~~~~~~.TTTTTT.::::::.....:::::::::::::..........::::::.....TTTTTTTT..:::::###',
      '#####::::###...########::::::.TTTTTTT~~~~~~~~~~~~.TTTTTT.:::::..........:::::::::.........::::::......TTTTTTTTT......###',
      'TTT..#:::###..########T::::::.TTTTTTTT~~~~~~~~~~~~TTTTTT.:::::.............:::::::.......::::::.......TTTTTTTTTT.....###',
      'TTTT.###:::..########TT:::::..TTTTTTTT~~~~~~~~~~~~.......::::...............:::::::......:::::........TTTTTTTTTTTT...###',
      'TTTT####::::.########TT:::::...TTTTTTTT~~~~~~~~~~~.......:::.................::::::::..:::::::..........TTTTTTTTTT.TTTTT',
      'TTTTT###:::::########TT:::::...TTTTTTTT.~~~~~~~~~~~.....::::...................::::::::::::::...........TTTTTTTTTTTTTTTT',
      'TTTTTT..:::::########TTT:::::::TTTTTTTT.~~~~~~~~~~~~....::::.....TTTTTT.........::::::::::::.............TTTTTTTTTTTTTTT',
      '.TTTTT...::::#####::#TTT:::::::TTTTTTTTT.~~~~~~~~~~~....::::.....TTTTTTT.........::::::::::...............TTTTTTTTTTT###',
      '####.....::::###::::###::::::::::TTTTTTT.~~~~~~~~~~~....::::.....T:::::T...........:::::::..TTTTTTTTTT.......TTTTTTTT###',
      '#####....::::###::::::::::::::::::TTTTTTT~~~~~~~~~~~...::::......T:::::T............:::::::TTTTTTTTTTTTT.............###',
      '######..:::::::::::::::::::::::::::TTTTTT~~~~~~~~~~~..:::::......T:::::T............::::::::TTTT:::::::::............###',
      '##########::::::::::::::::::::::::::TTTTTT~~~~~~~~~~~.:::::......T:::::T...........:::::::::::::::::::::::...........###',
      '##########:::::::###::::::::::###::::TTTTT~~~~~~~~~~~:::::........:::::T...........:::::::::::::::::::::::..........####',
      '##########:::::::###::::::::::####::#TTTTT~~~~~~~~~~::::::........::::.............:::::T:::::::::::::::::..........####',
      '##########:::::::####:::::::::########TTTT~~~~~~~~~::::::........:::::.............::::.TTT:::::::::::::::........######',
      '########:::::::::##TTT::::::::########TTTTTT~~~~~~~:::::.........:::::............:::::.TTTTTTTT::::::::::........######',
      '##::####:::###:::##TTT::::::::::######TTTT=========:::::.........::::.............::::..TTTTTTTTT:::::::::........######',
      '##:::###:::###:::##TTT::::::::::::::::TT===========::::::::::::::::::.............::::..TTTTTTTTT::::::::.........######',
      '##:::###:::###:::#TTTT::::::::::::::::::=====:=====:::::::::::::::::.............:::::............::::::........:::::###',
      '##:::###::####:::TTTTT::::::::::::::::::=====:=====:::::::::::::::::.....TTTT....:::::.........................::::::###',
      '##::::::::###::::TTTTT::::::::::::::::::===========:::...:::::::::::.....TTTT....::::..........:::::::::::::::::::::::##',
      '##::::::::###::::TTT::::::::::::::::::::==========::::.........:::::.....TTTT...:::::.........::::::::::::::::::::::::##',
      '##:::::::####::::::::::::::::::::::::::::TTTT~~~~~::::...TTT....:::::.....TT....::::.........:::::::::::::::::::::::::##',
      '#####...###::::::::::::::::::::::::::::TTTTT~~~~~~::::...TTT....:::::...........::::........:::::::::::::::....:::::::##',
      '###########::::::::::::::::::::::::::::TTTTT~~~~~~.::::..TTT.....:::::.........:::::.......:::::::.............:::::::##',
      '###########::::::::::::::::::::::::::::TTTTT~~~~~~~::::..TTT.....:::::.........:::::......:::::::..............::::::###',
      '#########:::::::::::::::::::::::::::::TTTTTT~~~~~~~::::...........:::::.TTTT..:::::.......::::::.................::::###',
      '#########:::::::::::::::::::::::::::::TTTTTT~~~~~~~::::...........:::::.TTTT..:::::......::::::.....................####',
      '##########::::::::::::::####:::::::::TTTTTTT~~~~~~~::::............::::.TTTT.:::::.......:::::.....................#####',
      '##############::::::::::####:::::::::TTTTTTT~~~~~~~::::............::::......:::::.......:::::.....................#####',
      '##############::::::::::#####:::::::TTTTTTT~~~~~~~~::::............::::......::::.......:::::.......TTTTTTTTTT.....####.',
      '###TTTT.::####::::::::::#####:::::TTTTTTTT~~~~~~~~~::::............:::::.....::::......:::::......TTTTTTTTTTTTT....##TTT',
      '##TTTT:::::::::::::::::::####::::TTTTTTTT.~~~~~~~~.:::.....TTTTT....::::.....::::......:::::::::..TTTTTTTTTTTTT....TTTTT',
      '##TTTT:::::::::::::::::::####TTTTTTTTTTT..~~~~~~~~.:::.....TTTTTT..::::::....::::...::::::::::::::::TTTTTTTTTTTT..TTTTTT',
      '#TTTT:::::::#:TTT:::::::::###TTTTTTTTTT..~~~~~~~~~.:::....TTTTTTTT.:::::::...:::::::::::::::::::::::::TTTTTTTTTTTTTTTTTT',
      'TTTT::::::####TTT::..::::###TTTTTTTTTT...~~~~~~~~~.::::...TTTTTTTT::::::::::::::::::::::::.::::::::::::::::TTTTTTTTTTTTT',
      'TTT:::::######TTT##T.:::..##TTTTTTTTT...~~~~~~~~~~.::::...TTTTTTT:::::::::::::::::::::::.......T:::::::::::TTTTTTTTTTTTT',
      'TTT::#########TTTTTTT:::..TTTTTTTTT....~~~~~~~~~~~.::::...TTT:::::::::::::::::::::::...........TTT:::::::::TTTTTTTTTTTTT',
      '##:::############TTTT:::..TTTTTTT......~~~~~~~~~~~.::::...TT::::::::::.:::::.:::::............TTTTT::::::::TTTTTTTTTTTTT',
      '##:::############TTTT:::..TTTTTTT......~~~~~~~~~~..::::...TT:::::::::.........::::............TTTTTT:::::::TTTTTTTTTTTTT',
      '##:::..###########TTT:::..TTTTTTT.....~~~~~~~~~~~..::::...TT:::::::T..........:::::...........TTTTTT:::::::TTTTTTTTTTTTT',
      '##:::..###########TTT:::..TTTTTTT.....~~~~~~~~~~...::::...TT:::::::T..........:::::...........TTTTTTT:::::TTTTTT.....###',
      '##::::.###########TTT:::..TTTTTTT....~~~~~~~~~~~...::::...TTT:::::TT...........:::::..........TTTTTTTT:::TTTTTT......###',
      '##::::.###########TTT:::..TTTTTTTT...~~~~~~~~~~....::::...TTTTTTTTTT...........:::::..........TTTTTTTTTTTTTTTT.......###',
      '###:::.###########TTT::::.TTTTTTTT...~~~~~~~~~~....::::....TTTTTTTTT............:::::.........TTTTTTTTTTTTTTT........###',
      '###::::.##########TTT::::..TTTTTTT...~~~~~~~~~....:::::....TTTTTTTT.............:::::.........TTTTTTTTTTTTT..........###',
      '###:::::.######...TTTT:::..TTTTTTT...~~~~~~~~~...::::::.....TTTTTTT..............:::::..........TTTTTT................##',
      '##TTT:::TTTT###...TTTT::::.TTTTTTT...~~~~~~~~..:::::::.......TTTTT...............:::::..........................:::::::#',
      'TTTTTT::TTTT####..TTTTT:::..TTTTTT...~~~~~~~~:::::::::............................::::..........................::::::::',
      'TTTTTT::TTTT#####.TTTTT::::..TTTTTTTTT~~~~=====::::::..........................:::::::::::::::::::::::::::::::::::::::::',
      'TTTTTT::TTTT#######.TT::::::::TTT==============::::.......................::::::::::::::::::::::::::::::::::::::::::::::',
      '#.:::::::..#########...::::::::::==============::::::...............:::::::::::::::::::::::::::::::::::::::::::::::::::#',
      '#::::::::.############.::::::::::======::======::::::::::::::::::::::::::::::::::::::::.::::::::::::::::...::::::::::::#',
      '#:::::::.################::::::::=============:::::::::::::::::::::::::::::::::.................######..........::::::##',
      ':::::::..###################......===========~...:::::::::##############:#........###########################...:::::###',
      ':::::::.###########################TTT~~~~~~~~##########################################################################',
      '#:::::#############################TTT~~~~~~~~##########################################################################',
      '####################################~~~~~~~~~~##########################################################################',
    ],
    keep: { x: 22, y: 27, w: 5, h: 5 },
    spawns: [                       // enemy spawns, one per lane
      { name: 'TOP', x: 115.5, y: 6.5 },
      { name: 'MID', x: 114.5, y: 32 },
      { name: 'BOT', x: 115.5, y: 60.5 },
    ],
    towers: [                       // allied lane towers, per lane ordered from the Keep outward. Creeps spawn at the first one.
      [{ x: 24, y: 23.5 }, { x: 26, y: 9 }, { x: 39.5, y: 2.5 }],
      [{ x: 29.5, y: 29.5 }, { x: 45.5, y: 28.5 }],
      [{ x: 24, y: 36 }, { x: 24, y: 57.5 }, { x: 40, y: 62.5 }],
    ],
    camps: [                        // neutral camps
      { x: 4.5, y: 6, kind: 'weak' }, { x: 3.5, y: 31, kind: 'weak' }, { x: 3, y: 63.5, kind: 'weak' },
      { x: 79.5, y: 2, kind: 'strong' }, { x: 69, y: 20, kind: 'strong' }, { x: 101, y: 24, kind: 'strong' },
      { x: 63.5, y: 49.5, kind: 'strong' }, { x: 103.5, y: 49, kind: 'strong' },
    ],
    grassCost: 3,                   // flow-field cost of a grass tile (dirt/bridge = 1): waves keep to the lanes
    spawnClear: 4,                  // no building within this many tiles of an enemy spawn
    campClear: 3,                   // ...or of a camp centre
  },

  // ---------------------------------------------------------------- DIFFICULTY
  difficulty: {
    easy:   { label: 'Easy',   enemyMul: 0.75, scaling: 0.75, startGold: 450, scoreMul: 0.75 },
    medium: { label: 'Medium', enemyMul: 1.0,  scaling: 1.0,  startGold: 300, scoreMul: 1.0 },
    hard:   { label: 'Hard',   enemyMul: 1.3,  scaling: 1.3,  startGold: 200, scoreMul: 1.5 },
  },

  // ---------------------------------------------------------------- WAVES
  // A wave tick every `interval` s (the first after `firstDelay`): enemies spawn at every enemy spawn,
  // creeps at every lane whose first tower stands, cleared neutral camps refill, and gold is paid out.
  waves: {
    firstDelay: 30,
    interval: 60,
    baseCount: 15,             // enemies in wave 1 (all spawns together)
    countPerWave: 5,           // + this many per wave after
    hpLinear: 0.12,            // hp mul = (1 + hpLinear*e) * hpExp^e, e = (wave-1) * scaling
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
    defaultWaveCap: 30,      // waves are one minute apart: the cap is roughly minutes survived
    baseSeed: 1000,          // seed index i uses baseSeed + i (same seeds for every combination)
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
CONFIG.MAP_W = CONFIG.map.grid[0].length;
CONFIG.MAP_H = CONFIG.map.grid.length;
CONFIG.WORLD_W = CONFIG.MAP_W * CONFIG.TILE;
CONFIG.WORLD_H = CONFIG.MAP_H * CONFIG.TILE;
