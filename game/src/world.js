// Void Bloom — the rules of the game, with no drawing and no browser in it.
// The Bloom sits at the centre of the field. Swarms fly in from the dark to eat it.
// The player is its keeper: a firefly with a pollen gun, a dash, and ten waves to last.
// Kills pay score (chained into a combo multiplier) and drop light shards; between
// waves the keeper spends nothing but chooses one of three gifts, and the swarm
// answers with a harder wave. The tenth wave brings the Void Maw. Kill it and the
// Bloom survives the night; let the Bloom — or the keeper — fall, and the dark wins.
//
// step() advances one fixed step under a control object
//   { mx, my, aimX, aimY, firing, dash }
// and returns what happened as bit flags, so the shell can play sounds and update
// the screen-reader line without the world knowing either exists. With `harmless`
// set (the title screen's living backdrop) the same rules run, but nothing can be
// hurt: the keeper is steered by a small autopilot and the swarm bursts into
// sparkles at the Bloom instead of biting it. Nothing allocates after createWorld.

import {
  BLOOM, CENTER, COMBO, ENEMY, FIELD, PLAYER, POOLS, SPLITTER_HP_SCALE, WAVES_TOTAL, WAVE_MIX,
} from './config.js';

export const EV_SHOOT = 1;
export const EV_KILL = 2;
export const EV_HURT = 4;
export const EV_BLOOM_HURT = 8;
export const EV_PICKUP = 16;
export const EV_DASH = 32;
export const EV_UPGRADE_OPEN = 64;
export const EV_WAVE = 128;
export const EV_WIN = 256;
export const EV_LOSE = 512;
export const EV_SPORE = 1024;

export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Pollen', desc: 'Fire 18% faster', apply: (s) => { s.stats.fireInterval *= 0.85; } },
  { id: 'heavy', name: 'Heavy Pollen', desc: '+30% bolt damage', apply: (s) => { s.stats.damage *= 1.3; } },
  { id: 'twin', name: 'Twin Pollen', desc: '+1 bolt in every shot', apply: (s) => { s.stats.projectiles += 1; } },
  { id: 'swift', name: 'Swift Wings', desc: '+12% speed, quicker dash', apply: (s) => { s.stats.speedMul *= 1.12; s.stats.dashCd *= 0.9; } },
  { id: 'vital', name: 'Vital Nectar', desc: '+25 max health, heal 50', apply: (s) => { s.player.maxHp += 25; s.player.hp = Math.min(s.player.maxHp, s.player.hp + 50); } },
  { id: 'heart', name: 'Bloom Heart', desc: 'Bloom +40 max health, heal 80', apply: (s) => { s.bloom.maxHp += 40; s.bloom.hp = Math.min(s.bloom.maxHp, s.bloom.hp + 80); } },
  { id: 'thorn', name: 'Thorn Aura', desc: 'Thorns wound moths near the Bloom', apply: (s) => { s.stats.thornDps += 16; } },
  { id: 'magnet', name: 'Magnet Dew', desc: 'Shards fly to you from farther away', apply: (s) => { s.stats.magnetR *= 1.6; } },
  { id: 'dash', name: 'Petal Dash', desc: 'Dash recharges 30% faster', apply: (s) => { s.stats.dashCd *= 0.7; } },
  { id: 'sugar', name: 'Star Sugar', desc: '+15% score from every kill', apply: (s) => { s.stats.scoreMul *= 1.15; } },
];

function makePool(size, make) {
  const pool = [];
  for (let i = 0; i < size; i += 1) pool.push(make());
  return pool;
}
function freeOf(pool) {
  for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
  return null;
}
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const stats = {
    damage: PLAYER.bulletDamage,
    fireInterval: PLAYER.fireInterval,
    projectiles: 1,
    speedMul: 1,
    dashCd: PLAYER.dashCooldown,
    magnetR: 95,
    thornDps: 0,
    scoreMul: 1,
  };
  const player = {
    x: CENTER.x, y: CENTER.y + 190, vx: 0, vy: 0,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    aimX: CENTER.x, aimY: 0, fireTimer: 0,
    dashTimer: 0, dashCdTimer: 0, iframes: 0, hurtFlash: 0, dead: false,
  };
  const bloom = { hp: BLOOM.maxHp, maxHp: BLOOM.maxHp, hurtFlash: 0, chewTimer: 0 };
  const state = {
    time: 0, phase: 'combat', wave: 1, score: 0, kills: 0, shards: 0,
    combo: { count: 0, timer: 0, tier: 1 },
    player, bloom, stats,
    enemies: makePool(POOLS.enemies, () => ({
      active: false, kind: 'moth', splitter: false, x: 0, y: 0, vx: 0, vy: 0,
      hp: 1, maxHp: 1, radius: 10, speed: 0, phase: 0, hitFlash: 0, fireTimer: 0, chew: 0,
    })),
    bullets: makePool(POOLS.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
    spores: makePool(POOLS.spores, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
    particles: makePool(POOLS.particles, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', drag: 1,
    })),
    pickups: makePool(POOLS.pickups, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, phase: 0 })),
    floaters: makePool(POOLS.floaters, () => ({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffffff', size: 16 })),
    queue: [], spawnTimer: 0, spawnInterval: 1,
    upgradeChoices: [], banner: { title: '', sub: '', timer: 0, dur: 0 },
    shake: 0, winBonusPaid: false,
  };

  function burst(x, y, color, n, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      const p = freeOf(state.particles);
      if (!p) return;
      const a = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.9);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.maxLife = life * (0.6 + random() * 0.7);
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
      p.drag = 2.2;
    }
  }

  function floater(x, y, text, color, size) {
    const f = freeOf(state.floaters);
    if (!f) return;
    f.active = true;
    f.x = x + random.range(-8, 8); f.y = y - 10;
    f.life = 0.9; f.text = text; f.color = color; f.size = size;
  }

  function banner(title, sub, dur = 2.4) {
    state.banner.title = title;
    state.banner.sub = sub;
    state.banner.timer = dur;
    state.banner.dur = dur;
  }

  function buildWave(wave) {
    state.queue.length = 0;
    const mix = WAVE_MIX[wave] || WAVE_MIX[WAVES_TOTAL];
    for (const [kind, count] of mix) {
      for (let i = 0; i < count; i += 1) state.queue.push(kind);
    }
    // Shuffle the roster (the Maw always leads its wave, so pull it back out front).
    for (let i = state.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const t = state.queue[i]; state.queue[i] = state.queue[j]; state.queue[j] = t;
    }
    const mawAt = state.queue.indexOf('maw');
    if (mawAt > 0) {
      state.queue.splice(mawAt, 1);
      state.queue.unshift('maw');
    }
    state.spawnInterval = Math.max(0.38, 1.05 - wave * 0.06);
    state.spawnTimer = 0.6;
  }

  function spawnEnemy(kind) {
    const e = freeOf(state.enemies);
    if (!e) return null;
    const base = ENEMY[kind === 'splitter' ? 'moth' : kind];
    // Spawn just outside a random edge, never in a corner clump.
    const side = Math.floor(random() * 4);
    const along = random.range(0.08, 0.92);
    if (side === 0) { e.x = along * FIELD.width; e.y = -36; }
    else if (side === 1) { e.x = along * FIELD.width; e.y = FIELD.height + 36; }
    else if (side === 2) { e.x = -36; e.y = along * FIELD.height; }
    else { e.x = FIELD.width + 36; e.y = along * FIELD.height; }
    e.active = true;
    e.kind = kind;
    e.splitter = kind === 'splitter';
    const hpScale = (e.splitter ? SPLITTER_HP_SCALE : 1) * (1 + (state.wave - 1) * 0.06);
    e.hp = e.maxHp = Math.round(base.hp * hpScale);
    e.radius = base.radius;
    e.speed = base.speed * random.range(0.88, 1.12);
    e.vx = 0; e.vy = 0;
    e.phase = random() * Math.PI * 2;
    e.hitFlash = 0;
    e.fireTimer = random.range(1.6, 2.8);
    e.chew = 0;
    return e;
  }

  function spawnMites(x, y) {
    for (let i = 0; i < 3; i += 1) {
      const e = freeOf(state.enemies);
      if (!e) return;
      const base = ENEMY.mite;
      e.active = true;
      e.kind = 'mite';
      e.splitter = false;
      e.x = x + random.range(-14, 14); e.y = y + random.range(-14, 14);
      e.hp = e.maxHp = base.hp;
      e.radius = base.radius;
      e.speed = base.speed * random.range(0.9, 1.15);
      e.vx = random.range(-90, 90); e.vy = random.range(-90, 90);
      e.phase = random() * Math.PI * 2;
      e.hitFlash = 0; e.fireTimer = 0; e.chew = 0;
    }
  }

  function dropShards(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      const s = freeOf(state.pickups);
      if (!s) return;
      s.active = true;
      s.x = x; s.y = y;
      s.vx = random.range(-70, 70); s.vy = random.range(-70, 70);
      s.phase = random() * Math.PI * 2;
    }
  }

  function hurtBloom(amount, events) {
    bloom.hp -= amount;
    bloom.hurtFlash = 0.25;
    state.shake = Math.max(state.shake, 5);
    floater(CENTER.x, CENTER.y - BLOOM.radius - 14, `-${amount}`, '#ff5d73', 17);
    if (bloom.hp <= 0 && state.phase !== 'lost') {
      bloom.hp = 0;
      state.phase = 'lost';
      burst(CENTER.x, CENTER.y, '#ff7ad9', 90, 320, 1.1, 4);
      burst(CENTER.x, CENTER.y, '#ffe9a8', 50, 200, 1.3, 3);
      state.shake = 16;
      return events | EV_LOSE;
    }
    return events | EV_BLOOM_HURT;
  }

  function hurtPlayer(amount, events) {
    if (player.iframes > 0 || player.dead) return events;
    player.hp -= amount;
    player.iframes = PLAYER.hurtIframes;
    player.hurtFlash = 0.3;
    state.shake = Math.max(state.shake, 5);
    burst(player.x, player.y, '#6ef3ff', 14, 220, 0.5, 3);
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      state.phase = 'lost';
      burst(player.x, player.y, '#6ef3ff', 60, 300, 1, 4);
      state.shake = 16;
      return events | EV_HURT | EV_LOSE;
    }
    return events | EV_HURT;
  }

  function killEnemy(e, events) {
    const base = ENEMY[e.kind === 'splitter' ? 'moth' : e.kind];
    e.active = false;
    state.kills += 1;
    state.combo.count += 1;
    state.combo.timer = COMBO.window;
    state.combo.tier = Math.min(COMBO.maxTier, 1 + Math.floor(state.combo.count / 5));
    const gained = Math.round(base.score * state.combo.tier * stats.scoreMul);
    state.score += gained;
    const colors = { moth: '#b388ff', wisp: '#7dff9a', beetle: '#ff9f68', mite: '#ff6b9d', maw: '#e5534b', splitter: '#b388ff' };
    burst(e.x, e.y, colors[e.kind] || '#ffffff', e.kind === 'maw' ? 120 : 16, e.kind === 'maw' ? 380 : 240, 0.7, 3.4);
    floater(e.x, e.y, `+${gained}`, '#ffe9a8', e.kind === 'maw' ? 26 : 15);
    dropShards(e.x, e.y, base.shards);
    if (e.splitter) spawnMites(e.x, e.y);
    if (e.kind === 'maw') {
      state.shake = 18;
      if (!state.winBonusPaid) {
        state.winBonusPaid = true;
        state.score += Math.round(bloom.hp) * 10 + Math.round(player.hp) * 5;
      }
      state.phase = 'won';
      burst(CENTER.x, CENTER.y, '#ffe9a8', 80, 260, 1.4, 3);
      return events | EV_KILL | EV_WIN;
    }
    return events | EV_KILL;
  }

  function rollUpgrades() {
    const eligible = UPGRADES.filter((u) => u.id !== 'twin' || stats.projectiles < 4);
    const picks = [];
    const bag = eligible.slice();
    while (picks.length < 3 && bag.length > 0) {
      const at = Math.floor(random() * bag.length);
      picks.push(bag.splice(at, 1)[0]);
    }
    state.upgradeChoices = picks;
  }

  function applyUpgrade(index) {
    const choice = state.upgradeChoices[index];
    if (!choice || state.phase !== 'upgrade') return 0;
    choice.apply(state);
    state.upgradeChoices = [];
    state.wave += 1;
    buildWave(state.wave);
    state.phase = 'combat';
    banner(`WAVE ${state.wave}`, state.wave === WAVES_TOTAL ? 'The Void Maw approaches' : '', 2.4);
    return EV_WAVE;
  }

  function reset() {
    stats.damage = PLAYER.bulletDamage;
    stats.fireInterval = PLAYER.fireInterval;
    stats.projectiles = 1;
    stats.speedMul = 1;
    stats.dashCd = PLAYER.dashCooldown;
    stats.magnetR = 95;
    stats.thornDps = 0;
    stats.scoreMul = 1;
    player.x = CENTER.x; player.y = CENTER.y + 190;
    player.vx = 0; player.vy = 0;
    player.maxHp = PLAYER.maxHp; player.hp = PLAYER.maxHp;
    player.aimX = CENTER.x; player.aimY = 0;
    player.fireTimer = 0; player.dashTimer = 0; player.dashCdTimer = 0;
    player.iframes = 0; player.hurtFlash = 0; player.dead = false;
    bloom.maxHp = BLOOM.maxHp; bloom.hp = BLOOM.maxHp; bloom.hurtFlash = 0;
    state.time = 0; state.phase = 'combat'; state.wave = 1;
    state.score = 0; state.kills = 0; state.shards = 0;
    state.combo.count = 0; state.combo.timer = 0; state.combo.tier = 1;
    state.shake = 0; state.winBonusPaid = false;
    for (const pool of [state.enemies, state.bullets, state.spores, state.particles, state.pickups, state.floaters]) {
      for (const item of pool) item.active = false;
    }
    state.upgradeChoices = [];
    buildWave(1);
    banner('WAVE 1', 'Defend the Bloom', 2.4);
  }

  // The title-screen autopilot: circle the Bloom, shoot what comes close.
  function autopilot() {
    let target = null;
    let bestD = Infinity;
    for (const e of state.enemies) {
      if (!e.active) continue;
      const d = dist2(player.x, player.y, e.x, e.y);
      if (d < bestD) { bestD = d; target = e; }
    }
    const orbit = state.time * 0.45;
    const gx = CENTER.x + Math.cos(orbit) * 185;
    const gy = CENTER.y + Math.sin(orbit) * 150;
    const control = { mx: 0, my: 0, aimX: CENTER.x, aimY: 0, firing: false, dash: false };
    const dx = gx - player.x;
    const dy = gy - player.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len > 12) { control.mx = dx / len; control.my = dy / len; }
    if (target) {
      control.aimX = target.x; control.aimY = target.y;
      control.firing = bestD < 520 * 520;
    }
    return control;
  }

  function step(dt, control, harmless = false) {
    let events = 0;
    state.time += dt;
    if (state.banner.timer > 0) state.banner.timer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (bloom.hurtFlash > 0) bloom.hurtFlash -= dt;
    if (player.hurtFlash > 0) player.hurtFlash -= dt;
    if (state.combo.timer > 0) {
      state.combo.timer -= dt;
      if (state.combo.timer <= 0) { state.combo.count = 0; state.combo.tier = 1; }
    }

    const ctl = harmless ? autopilot() : control;
    const inPlay = state.phase === 'combat' || harmless;

    // ---- spawning -------------------------------------------------------
    if (inPlay && state.queue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.queue.shift());
        state.spawnTimer += state.spawnInterval * random.range(0.7, 1.3);
      }
    }
    // The title sky never runs dry: when the backdrop swarm thins out, a few
    // more moths wander in, forever. (Harmless mode only — real waves are finite.)
    if (harmless && state.queue.length === 0) {
      let alive = 0;
      for (const e of state.enemies) if (e.active) alive += 1;
      if (alive < 3) {
        state.queue.push('moth', 'moth', 'wisp', 'moth');
        state.spawnTimer = Math.min(state.spawnTimer, 0.4);
      }
    }

    // ---- player ---------------------------------------------------------
    if (!player.dead) {
      if (player.iframes > 0) player.iframes -= dt;
      if (player.dashCdTimer > 0) player.dashCdTimer -= dt;
      const speed = PLAYER.speed * stats.speedMul;
      if (player.dashTimer > 0) {
        player.dashTimer -= dt;
      } else {
        player.vx += ctl.mx * PLAYER.accel * dt;
        player.vy += ctl.my * PLAYER.accel * dt;
        const damp = Math.max(0, 1 - PLAYER.friction * dt);
        if (ctl.mx === 0) player.vx *= damp;
        if (ctl.my === 0) player.vy *= damp;
        const v = Math.hypot(player.vx, player.vy);
        if (v > speed) { player.vx = (player.vx / v) * speed; player.vy = (player.vy / v) * speed; }
      }
      if (ctl.dash && player.dashCdTimer <= 0 && player.dashTimer <= 0 && !harmless) {
        let dx = ctl.mx; let dy = ctl.my;
        if (dx === 0 && dy === 0) { dx = ctl.aimX - player.x; dy = ctl.aimY - player.y; }
        const len = Math.hypot(dx, dy) || 1;
        player.vx = (dx / len) * PLAYER.dashSpeed;
        player.vy = (dy / len) * PLAYER.dashSpeed;
        player.dashTimer = PLAYER.dashTime;
        player.dashCdTimer = stats.dashCd;
        player.iframes = Math.max(player.iframes, PLAYER.dashTime + 0.05);
        burst(player.x, player.y, '#6ef3ff', 10, 120, 0.35, 2.6);
        events |= EV_DASH;
      }
      player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
      player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
      player.aimX = ctl.aimX;
      player.aimY = ctl.aimY;

      // firing
      if (player.fireTimer > 0) player.fireTimer -= dt;
      if (inPlay && ctl.firing) {
        while (player.fireTimer <= 0) {
          player.fireTimer += stats.fireInterval;
          const baseAngle = Math.atan2(ctl.aimY - player.y, ctl.aimX - player.x);
          const n = stats.projectiles;
          for (let i = 0; i < n; i += 1) {
            const b = freeOf(state.bullets);
            if (!b) break;
            const spread = (i - (n - 1) / 2) * 0.085;
            const a = baseAngle + spread;
            b.active = true;
            b.x = player.x + Math.cos(baseAngle) * 16;
            b.y = player.y + Math.sin(baseAngle) * 16;
            b.vx = Math.cos(a) * PLAYER.bulletSpeed;
            b.vy = Math.sin(a) * PLAYER.bulletSpeed;
            b.life = 1.1;
          }
          events |= EV_SHOOT;
        }
      } else if (player.fireTimer < 0) {
        player.fireTimer = 0;
      }
    }

    // ---- bullets --------------------------------------------------------
    for (const b of state.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of state.enemies) {
        if (!e.active) continue;
        const rr = e.radius + PLAYER.bulletRadius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          b.active = false;
          e.hp -= stats.damage;
          e.hitFlash = 0.12;
          e.vx += b.vx * 0.012;
          e.vy += b.vy * 0.012;
          burst(b.x, b.y, '#aef7ff', 3, 130, 0.3, 2.2);
          if (e.hp <= 0) events = killEnemy(e, events);
          break;
        }
      }
    }

    // ---- enemies --------------------------------------------------------
    let anyEnemy = false;
    for (const e of state.enemies) {
      if (!e.active) continue;
      anyEnemy = true;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      const base = ENEMY[e.kind === 'splitter' ? 'moth' : e.kind];
      let tx = CENTER.x;
      let ty = CENTER.y;
      if (e.kind === 'wisp') { tx = player.x; ty = player.y; }
      const dx = tx - e.x;
      const dy = ty - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(state.time * 3.1 + e.phase) * (e.kind === 'wisp' ? 0.85 : 0.35);
      const px = (-dy / len) * wob;
      const py = (dx / len) * wob;
      e.vx += ((dx / len + px) * e.speed - e.vx) * Math.min(1, dt * 3);
      e.vy += ((dy / len + py) * e.speed - e.vy) * Math.min(1, dt * 3);
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // thorn aura (measured from the Bloom, not from the enemy's target)
      const dc = Math.hypot(e.x - CENTER.x, e.y - CENTER.y);
      if (stats.thornDps > 0 && dc < 130) {
        e.hp -= stats.thornDps * dt;
        if (e.hp <= 0) { events = killEnemy(e, events); continue; }
      }

      // the Maw hangs back and works: spore bursts and moth calls
      if (e.kind === 'maw') {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && len < 560) {
          e.fireTimer = 2.7;
          for (let i = 0; i < 10; i += 1) {
            const s = freeOf(state.spores);
            if (!s) break;
            const a = (i / 10) * Math.PI * 2 + state.time;
            s.active = true;
            s.x = e.x; s.y = e.y;
            s.vx = Math.cos(a) * 148; s.vy = Math.sin(a) * 148;
            s.life = 3.4;
          }
          events |= EV_SPORE;
          if (random() < 0.55) { spawnEnemy('moth'); spawnEnemy('moth'); }
        }
      }

      // reaching the Bloom (centre distance, whatever the enemy is hunting)
      if (dc < BLOOM.contactRange + e.radius * 0.35) {
        if (e.kind === 'maw') {
          e.chew += dt;
          // Hold at the petals instead of drifting through: pin the Maw to the
          // contact ring on the centre's side where it arrived.
          const ring = BLOOM.contactRange + e.radius * 0.35;
          e.x = CENTER.x + ((e.x - CENTER.x) / (dc || 1)) * ring;
          e.y = CENTER.y + ((e.y - CENTER.y) / (dc || 1)) * ring;
          if (e.chew >= 0.85) {
            e.chew = 0;
            if (!harmless) events = hurtBloom(base.damage, events);
            else burst(CENTER.x, CENTER.y, '#ff7ad9', 8, 140, 0.5, 3);
          }
        } else {
          e.active = false;
          burst(e.x, e.y, '#ff7ad9', 10, 170, 0.5, 3);
          if (!harmless) events = hurtBloom(base.damage, events);
          continue;
        }
      }

      // touching the keeper
      if (!player.dead) {
        const rr = e.radius + PLAYER.radius;
        if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
          if (!harmless) events = hurtPlayer(base.touch, events);
          e.vx -= (dx / len) * 120;
          e.vy -= (dy / len) * 120;
        }
      }
    }

    // ---- spores ---------------------------------------------------------
    for (const s of state.spores) {
      if (!s.active) continue;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) { s.active = false; continue; }
      const dc = Math.hypot(s.x - CENTER.x, s.y - CENTER.y);
      if (dc < BLOOM.contactRange) {
        s.active = false;
        if (!harmless) events = hurtBloom(6, events);
        continue;
      }
      if (!player.dead && player.iframes <= 0) {
        const rr = PLAYER.radius + 6;
        if (dist2(s.x, s.y, player.x, player.y) < rr * rr) {
          s.active = false;
          if (!harmless) events = hurtPlayer(9, events);
        }
      }
    }

    // ---- pickups ----------------------------------------------------------
    for (const s of state.pickups) {
      if (!s.active) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.max(0, 1 - 4 * dt);
      s.vy *= Math.max(0, 1 - 4 * dt);
      const d = Math.hypot(player.x - s.x, player.y - s.y);
      if (!player.dead && d < stats.magnetR) {
        const pull = 560 * dt;
        s.vx += ((player.x - s.x) / (d || 1)) * pull * 4;
        s.vy += ((player.y - s.y) / (d || 1)) * pull * 4;
      }
      if (!player.dead && d < PLAYER.radius + 12) {
        s.active = false;
        state.shards += 1;
        state.score += 5;
        events |= EV_PICKUP;
      }
    }

    // ---- particles & floaters --------------------------------------------
    for (const p of state.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of state.floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 44 * dt;
      if (f.life <= 0) f.active = false;
    }

    // ---- wave clear --------------------------------------------------------
    if (!harmless && state.phase === 'combat' && state.queue.length === 0 && !anyEnemy) {
      if (state.wave < WAVES_TOTAL) {
        rollUpgrades();
        state.phase = 'upgrade';
        events |= EV_UPGRADE_OPEN;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, applyUpgrade };
}
