/**
 * Weapon definitions.
 *
 * Audio lives in core/Audio.js under named cues, not here — the per-weapon
 * `sound` blocks that used to sit in this table stopped being read when the
 * audio refactor landed and were quietly lying about what you'd hear.
 *
 * Four weapons, four different verbs — an arc projectile, a continuous
 * stream, a returning throw, and a spread burst. Reskinning the pie four
 * times would have been quicker and would have added nothing.
 *
 * Every number here is live-editable through the debug panel (backtick).
 * Tune in the browser, then paste the values back into this file.
 */

export const WEAPONS = {
  pie: {
    id: 'pie',
    name: 'Cream pie',
    kind: 'projectile',
    blurb: 'Reliable. Arcs. Rewards patience.',
    cooldown: 0.34,
    ammoMax: 24,
    ammoStart: 12,
    ammoPerShot: 1,
    damage: 1,
    headshotMult: 3,
    speed: 25,
    aimSpeed: 30,
    spread: 0.03,
    aimSpread: 0.006,
    gravityScale: 0.5,
    knockback: 5.5,
    radius: 0.92,
    life: 3.5,
    trauma: 0.05,
    visual: { shape: 'disc', color: 0xf6f0dc, emissive: 0x5a5442, scale: 1 },
    splat: { color: 0xf6f0dc, count: 9, speed: 4.2, size: 0.09, life: 1.1 },
  },

  seltzer: {
    id: 'seltzer',
    name: 'Seltzer bottle',
    kind: 'stream',
    blurb: 'Crowd control. Shoves, soaks, barely kills.',
    // Stream weapons bypass cooldown entirely and drain while held.
    drainPerSecond: 22,
    ammoMax: 100,
    ammoStart: 100,
    regenPerSecond: 7,       // refills when not firing
    regenDelay: 1.1,
    dps: 1.6,
    range: 6.5,
    coneDegrees: 26,
    knockback: 9,
    slowFactor: 0.45,        // multiplies zombie speed while soaked
    slowDuration: 1.4,
    trauma: 0.012,
    spray: { perStep: 3, color: 0xbfe4f2, speed: 11, size: 0.055, life: 0.32, spread: 0.2 },
  },

  clubs: {
    id: 'clubs',
    name: 'Juggling clubs',
    kind: 'returning',
    blurb: 'Three at once. Catch them or lose them.',
    cooldown: 0.75,
    ammoMax: 9,
    ammoStart: 6,
    ammoPerShot: 3,
    count: 3,
    fanDegrees: 14,
    damage: 2,
    headshotMult: 2,
    speed: 19,
    aimSpeed: 22,
    spread: 0.01,
    aimSpread: 0.004,
    gravityScale: 0.06,
    knockback: 4,
    radius: 0.85,
    life: 4.5,
    returnAfter: 0.55,       // seconds outbound before it turns around
    returnSpeed: 22,
    catchRadius: 1.15,
    trauma: 0.08,
    visual: { shape: 'club', color: 0xe8b21c, emissive: 0x3a2c08, scale: 1 },
    splat: { color: 0xe8b21c, count: 6, speed: 3.4, size: 0.07, life: 0.8 },
  },

  confetti: {
    id: 'confetti',
    name: 'Confetti cannon',
    kind: 'spread',
    blurb: 'Panic button. Enormous shove, terrible range.',
    cooldown: 1.15,
    ammoMax: 12,
    ammoStart: 6,
    ammoPerShot: 1,
    count: 14,
    damage: 1,
    headshotMult: 1,
    speed: 21,
    aimSpeed: 23,
    spread: 0.19,
    aimSpread: 0.13,
    gravityScale: 0.85,
    knockback: 16,
    radius: 0.7,
    life: 0.85,              // short life is what makes it a close-range gun
    trauma: 0.4,
    visual: { shape: 'flake', colors: [0xe8b21c, 0xc8102e, 0x2f7fc4, 0x7a4fa8, 0x8fae6b], scale: 1 },
    splat: { color: 0xe8b21c, count: 3, speed: 2.4, size: 0.05, life: 0.5 },
  },
};

/** Display and hotkey order. Slot N is keyboard key N. */
export const WEAPON_ORDER = ['pie', 'seltzer', 'clubs', 'confetti'];

/** Pickup kind -> what it refills. */
export const AMMO_PICKUPS = {
  pie: { weapon: 'pie', amount: 6, label: '+6 pies' },
  seltzer: { weapon: 'seltzer', amount: 45, label: 'Seltzer recharged' },
  clubs: { weapon: 'clubs', amount: 3, label: '+3 clubs' },
  confetti: { weapon: 'confetti', amount: 3, label: '+3 charges' },
};
