/**
 * Enemy archetypes.
 *
 * Designed backwards from the arsenal: every weapon needs a target it is
 * clearly the right answer to, or it's dead weight in the inventory.
 *
 *   Shambler     baseline — the pie's job, and what headshots are tuned on
 *   Tot          tiny, fast, arrives in fours — confetti spread, seltzer cone
 *   Tumbler      dashes, fragile, erratic — knockback and slow, not accuracy
 *   Strongman    heavy, stagger-resistant — clubs punch through, pies bounce
 *   Stiltwalker  long reach, head far above the crosshair — deliberate aim
 *
 * Every number here is live in the tuning panel.
 */

export const ZOMBIE_TYPES = {
  shambler: {
    id: 'shambler',
    navProfile: 'small',
    name: 'Shambler',
    hp: 3,
    speedRange: [1.9, 2.9],
    scaleRange: [0.92, 1.12],
    capsule: { radius: 0.33, halfHeight: 0.57 },
    headHeight: 0.55,
    aggroRange: 15,
    chaseTurnRate: 6.5,
    alertTime: 0.45,
    separation: 1.5,
    knockbackResist: 0,
    staggerThreshold: 0,
    soakResist: 0,
    corpseLinger: 4.2,
    attack: {
      damage: 11, trigger: 1.5, range: 1.9,
      time: 0.75, hitStart: 0.45, hitEnd: 0.62, cooldown: 1.5,
    },
    build: {},
    palette: [
      { suit: 0x5c2a52, skin: 0x7e9c5c, hair: 0x8f3527, shoe: 0x2f231a, nose: 0x6e2a1c },
      { suit: 0x2a4a3a, skin: 0x84a069, hair: 0x8f5f26, shoe: 0x261e16, nose: 0x7d2f20 },
      { suit: 0x4e401d, skin: 0x789260, hair: 0x603963, shoe: 0x2d221e, nose: 0x843025 },
    ],
  },

  tot: {
    id: 'tot',
    navProfile: 'small',
    name: 'Tot',
    hp: 1,
    speedRange: [3.8, 4.6],
    scaleRange: [0.5, 0.62],
    capsule: { radius: 0.2, halfHeight: 0.26 },
    headHeight: 0.3,
    aggroRange: 19,
    chaseTurnRate: 9,
    alertTime: 0.2,
    separation: 0.7,
    knockbackResist: -0.6,      // negative: sent further than normal
    staggerThreshold: 0,
    soakResist: 0,
    corpseLinger: 2.4,
    squad: 4,                   // never spawns alone
    attack: {
      damage: 5, trigger: 1.0, range: 1.3,
      time: 0.45, hitStart: 0.25, hitEnd: 0.36, cooldown: 0.8,
    },
    build: { girth: 1.15, head: 1.3, arm: 0.85, leg: 0.8 },
    palette: [
      { suit: 0xc8102e, skin: 0x8fae6b, hair: 0xe8b21c, shoe: 0x241a14, nose: 0x8f2a1e },
      { suit: 0xe8b21c, skin: 0x86a465, hair: 0x2f7fc4, shoe: 0x241a14, nose: 0x93372a },
    ],
  },

  tumbler: {
    id: 'tumbler',
    navProfile: 'small',
    name: 'Tumbler',
    hp: 2,
    speedRange: [4.4, 5.4],
    scaleRange: [0.86, 0.96],
    capsule: { radius: 0.3, halfHeight: 0.5 },
    headHeight: 0.5,
    aggroRange: 20,
    chaseTurnRate: 4.0,         // fast but turns badly — you can sidestep it
    alertTime: 0.25,
    separation: 1.2,
    knockbackResist: -0.3,
    staggerThreshold: 0,
    soakResist: 0,
    corpseLinger: 3.0,
    dash: { cooldown: 2.6, windUp: 0.3, duration: 0.42, speed: 13, minRange: 4, maxRange: 13 },
    attack: {
      damage: 9, trigger: 1.4, range: 1.8,
      time: 0.5, hitStart: 0.22, hitEnd: 0.36, cooldown: 1.1,
    },
    build: { girth: 0.82, arm: 1.12, leg: 1.12 },
    palette: [
      { suit: 0x7a4fa8, skin: 0x8bb072, hair: 0xd4472e, shoe: 0x1f1a24, nose: 0x7a2a1f },
      { suit: 0x1f6b6b, skin: 0x92ae74, hair: 0xe8b21c, shoe: 0x1f1a24, nose: 0x8a3324 },
    ],
  },

  strongman: {
    id: 'strongman',
    navProfile: 'large',
    name: 'Strongman',
    hp: 14,
    speedRange: [1.3, 1.7],
    scaleRange: [1.3, 1.42],
    capsule: { radius: 0.48, halfHeight: 0.72 },
    headHeight: 0.85,
    aggroRange: 16,
    chaseTurnRate: 2.6,
    alertTime: 0.8,
    separation: 2.2,
    knockbackResist: 0.85,
    staggerThreshold: 3,        // chip damage bounces off; clubs get through
    soakResist: 0.6,
    corpseLinger: 6.0,
    attack: {
      damage: 24, trigger: 2.4, range: 2.9,
      time: 1.25, hitStart: 0.62, hitEnd: 0.8, cooldown: 2.4,
    },
    build: { girth: 1.42, head: 0.88, arm: 1.2, leg: 0.92 },
    palette: [
      { suit: 0x3a2f5c, skin: 0x6f8f52, hair: 0x4a2a18, shoe: 0x211a16, nose: 0x6b241a },
      { suit: 0x5c3320, skin: 0x759257, hair: 0x2c2c2c, shoe: 0x211a16, nose: 0x7a2a1c },
    ],
  },

  stiltwalker: {
    id: 'stiltwalker',
    navProfile: 'small',
    name: 'Stiltwalker',
    hp: 5,
    speedRange: [2.0, 2.5],
    scaleRange: [1.0, 1.08],
    capsule: { radius: 0.3, halfHeight: 1.15 },
    headHeight: 1.7,            // well above where the crosshair rests
    aggroRange: 21,
    chaseTurnRate: 2.2,
    alertTime: 0.6,
    separation: 1.8,
    knockbackResist: 0.3,
    staggerThreshold: 1.5,
    soakResist: 0.2,
    corpseLinger: 5.0,
    attack: {
      damage: 14, trigger: 3.0, range: 3.4,
      time: 0.95, hitStart: 0.5, hitEnd: 0.66, cooldown: 2.0,
    },
    build: { girth: 0.85, head: 0.9, arm: 1.35, leg: 2.4 },
    meshYOffset: 0,
    palette: [
      { suit: 0x243d6b, skin: 0x8aa86c, hair: 0xb8482e, shoe: 0x1a1620, nose: 0x8a2f22 },
      { suit: 0x6b2447, skin: 0x7f9d61, hair: 0xd9d2c0, shoe: 0x1a1620, nose: 0x902f24 },
    ],
  },
};

export const TYPE_ORDER = ['shambler', 'tot', 'tumbler', 'strongman', 'stiltwalker'];

/**
 * Spawn weights by heat tier. Index 0 is calm, 3 is the ringmaster paying
 * full attention. Tots and tumblers show up early to keep pressure on; the
 * strongman is a late-tier problem you have to switch weapons for.
 */
export const HEAT_TIERS = [
  { at: 0,  weights: { shambler: 10, tot: 2, tumbler: 1, strongman: 0, stiltwalker: 0 } },
  { at: 30, weights: { shambler: 8,  tot: 4, tumbler: 4, strongman: 1, stiltwalker: 2 } },
  { at: 60, weights: { shambler: 5,  tot: 5, tumbler: 6, strongman: 3, stiltwalker: 3 } },
  { at: 85, weights: { shambler: 3,  tot: 6, tumbler: 7, strongman: 5, stiltwalker: 4 } },
];

export function tierFor(heat) {
  let tier = HEAT_TIERS[0];
  for (const t of HEAT_TIERS) if (heat >= t.at) tier = t;
  return tier;
}

export function pickType(heat) {
  const weights = tierFor(heat).weights;
  let total = 0;
  for (const id of TYPE_ORDER) total += weights[id] || 0;
  let roll = Math.random() * total;
  for (const id of TYPE_ORDER) {
    roll -= weights[id] || 0;
    if (roll <= 0) return id;
  }
  return 'shambler';
}
