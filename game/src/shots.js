// Void Bloom — the screenshot scenes behind ?shot=start|play|upgrade|end.
// Each scene plays the real rules forward from a fresh world with a fixed seed,
// steered by the pilots below, so the frame is what a real game looks like and
// the same seed always stages the same frame. The maker's screenshot script
// (shots.json at the repository root) loads these scenes in a browser and
// photographs them; nothing here is drawn by hand or composited.

import { CENTER, PLAYER, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const IDLE = { mx: 0, my: 0, aimX: CENTER.x, aimY: 0, firing: false, dash: false };

/** A competent keeper: kite the nearest enemy at bolt range and shoot it. */
function pilotControl(state) {
  const p = state.player;
  let target = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bestD) { bestD = d; target = e; }
  }
  const control = { mx: 0, my: 0, aimX: p.x, aimY: p.y - 100, firing: false, dash: false };
  if (!target) {
    const orbit = state.time * 0.5;
    const gx = CENTER.x + Math.cos(orbit) * 200;
    const gy = CENTER.y + Math.sin(orbit) * 160;
    const dx = gx - p.x;
    const dy = gy - p.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len > 16) { control.mx = dx / len; control.my = dy / len; }
    return control;
  }
  const dx = p.x - target.x;
  const dy = p.y - target.y;
  const dist = Math.hypot(dx, dy) || 1;
  const radial = dist < 215 ? 1 : dist > 300 ? -1 : 0;
  const strafe = target.phase > Math.PI ? 1 : -1;
  let mx = (dx / dist) * radial + (-dy / dist) * strafe * 0.7;
  let my = (dy / dist) * radial + (dx / dist) * strafe * 0.7;
  const mlen = Math.hypot(mx, my) || 1;
  control.mx = mx / mlen;
  control.my = my / mlen;
  const lead = dist / PLAYER.bulletSpeed;
  control.aimX = target.x + target.vx * lead;
  control.aimY = target.y + target.vy * lead;
  control.firing = dist < 580;
  control.dash = dist < 95;
  return control;
}

function runUntil(world, seconds, controlFor, stopWhen) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, controlFor(world.state), false);
    if (stopWhen && stopWhen(world.state)) return true;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. Any name other than play/upgrade/end stages the title.
 */
export function stageShot(name, world) {
  const { state } = world;
  world.reset();

  if (name === 'play') {
    // Fight honestly through the early waves, taking gifts in turn, and freeze
    // in wave 5 — the first wave where the swarm is thick — at a busy moment:
    // a crowd of enemies on screen with bolts in the air.
    let gifts = 0;
    while (state.wave < 5 && state.phase !== 'lost' && state.phase !== 'won') {
      runUntil(world, 150, pilotControl, (s) => s.phase === 'upgrade');
      if (state.phase === 'upgrade') {
        world.applyUpgrade(gifts % 3);
        gifts += 1;
      } else break;
    }
    const busy = (s) => s.phase !== 'combat'
      || (s.enemies.filter((e) => e.active).length >= 7 && s.bullets.filter((b) => b.active).length >= 3);
    runUntil(world, 24, pilotControl, busy);
    if (state.phase === 'upgrade') world.applyUpgrade(0);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'upgrade') {
    runUntil(world, 180, pilotControl, (s) => s.phase === 'upgrade');
    return { screen: SCREEN_UPGRADE, best: 0 };
  }

  if (name === 'end') {
    // Play properly for two waves so the final tally is a real one, then the
    // keeper is overwhelmed: it retreats to a corner and stops firing, and the
    // swarm finishes either it or the Bloom.
    runUntil(world, 150, pilotControl, (s) => s.phase === 'upgrade');
    if (state.phase === 'upgrade') world.applyUpgrade(0);
    runUntil(world, 150, pilotControl, (s) => s.phase === 'upgrade');
    if (state.phase === 'upgrade') world.applyUpgrade(2);
    const doomed = (s) => {
      const dx = 70 - s.player.x;
      const dy = 650 - s.player.y;
      const len = Math.hypot(dx, dy) || 1;
      if (len < 14) return IDLE;
      return { mx: dx / len, my: dy / len, aimX: CENTER.x, aimY: 0, firing: false, dash: false };
    };
    runUntil(world, 240, doomed, (s) => s.phase === 'lost');
    // Let the death burst settle for a second before the photograph.
    if (state.phase === 'lost') runUntil(world, 1.1, () => IDLE, null);
    if (state.phase !== 'lost') {
      // The swarm took the Bloom while the keeper cowered: stage the aftermath.
      state.bloom.hp = 0;
      state.phase = 'lost';
    }
    return { screen: SCREEN_OVER, best: state.score };
  }

  // start: the title over a living sky — the harmless autopilot keeps the
  // backdrop game running behind the lettering.
  for (let i = 0; i < 7 / STEP; i += 1) world.step(STEP, IDLE, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
