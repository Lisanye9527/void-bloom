// Void Bloom — every tuning number, colour and string-table in one place.
// The arena is a fixed 1280x720 logical field; the renderer letterboxes it into any
// window, so no rule below ever depends on the player's screen size.

export const FIELD = { width: 1280, height: 720 };
export const CENTER = { x: FIELD.width / 2, y: FIELD.height / 2 };

/** Fixed simulation step (seconds): 60 updates a second at any display rate. */
export const STEP = 1 / 60;

export const BLOOM = {
  maxHp: 300,
  radius: 54, // body the moths chew on; petals reach further, purely visual
  contactRange: 62, // an enemy this close to the centre is eating the Bloom
};

export const PLAYER = {
  maxHp: 100,
  radius: 14,
  speed: 305,
  accel: 2400,
  friction: 6.5,
  fireInterval: 0.21,
  bulletSpeed: 640,
  bulletDamage: 12,
  bulletRadius: 5,
  dashSpeed: 880,
  dashTime: 0.16,
  dashCooldown: 1.6,
  hurtIframes: 0.7,
  touchDamage: 12,
};

export const WAVES_TOTAL = 10;

/** Per-kind enemy tuning. score is paid on death; shards drop as spendable light. */
export const ENEMY = {
  moth: { hp: 22, speed: 74, radius: 15, damage: 8, score: 50, shards: 1, touch: 10 },
  wisp: { hp: 14, speed: 148, radius: 11, damage: 5, score: 80, shards: 1, touch: 8 },
  beetle: { hp: 95, speed: 40, radius: 24, damage: 22, score: 150, shards: 3, touch: 16 },
  mite: { hp: 8, speed: 118, radius: 8, damage: 3, score: 25, shards: 0, touch: 5 },
  maw: { hp: 1500, speed: 26, radius: 58, damage: 40, score: 3000, shards: 25, touch: 24 },
};

/** Wave rosters: [kind, count] pairs; spawnInterval shrinks as waves grow. */
export const WAVE_MIX = [
  null,
  [['moth', 6]],
  [['moth', 9], ['wisp', 2]],
  [['moth', 10], ['wisp', 4]],
  [['moth', 10], ['beetle', 2], ['wisp', 4]],
  [['moth', 12], ['wisp', 6], ['beetle', 3]],
  [['moth', 10], ['splitter', 4], ['wisp', 6], ['beetle', 3]],
  [['moth', 14], ['wisp', 8], ['beetle', 4], ['splitter', 4]],
  [['moth', 12], ['wisp', 10], ['beetle', 5], ['splitter', 5]],
  [['moth', 16], ['wisp', 10], ['beetle', 6], ['splitter', 6]],
  [['maw', 1], ['moth', 8], ['wisp', 6]],
];
// 'splitter' is a moth variant flagged at spawn: it bursts into mites when killed.
export const SPLITTER_HP_SCALE = 1.4;

export const COMBO = { window: 3.0, maxTier: 8 };

export const POOLS = { enemies: 220, bullets: 320, spores: 160, particles: 900, pickups: 160, floaters: 48 };

export const PALETTE = {
  void: '#05060f',
  nebulaA: '#131a4a',
  nebulaB: '#3a1160',
  nebulaC: '#0b3d4f',
  bloomCore: '#ffe9a8',
  bloomPetal: '#ff7ad9',
  bloomPetalDim: '#8a4a86',
  bloomStem: '#57e6a9',
  player: '#6ef3ff',
  playerWing: '#c8fbff',
  bullet: '#aef7ff',
  shard: '#ffd166',
  moth: '#b388ff',
  wisp: '#7dff9a',
  beetle: '#ff9f68',
  mite: '#ff6b9d',
  maw: '#e5534b',
  spore: '#ff5d73',
  text: '#f2f4ff',
  muted: '#9aa3c7',
  panel: 'rgba(13, 16, 38, 0.88)',
  panelEdge: '#3d4a8a',
  danger: '#ff5d73',
  good: '#57e6a9',
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

/** localStorage key for the best score between visits (this browser only). */
export const BEST_KEY = 'void-bloom.best';
