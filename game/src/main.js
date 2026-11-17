// Void Bloom — boot and the one loop. Input is read every frame; the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast one);
// the renderer paints what is there. Screens: title, play, the gift choice
// between waves, paused, victory and game over — the world's own phase decides
// most transitions, this shell owns the title and the pause.
//
// ?seed=N fixes the swarm's pattern. ?shot=start|play|upgrade|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for the maker's screenshot script.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld, EV_BLOOM_HURT, EV_DASH, EV_HURT, EV_KILL, EV_LOSE, EV_PICKUP,
  EV_SHOOT, EV_SPORE, EV_UPGRADE_OPEN, EV_WAVE, EV_WIN,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2,
  ACTION_PICK_3, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_UPGRADE, SCREEN_WIN, upgradeCardRects,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const IDLE = { mx: 0, my: 0, aimX: 0, aimY: 0, firing: false, dash: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

if (shot) {
  const scene = stageShot(shot, world);
  let painted = 0;
  const paint = () => {
    renderer.draw(world.state, scene.screen, {
      best: scene.best,
      hoverCard: shot === 'upgrade' ? 1 : -1,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = false;
  let hoverCard = -1;
  let accumulator = 0;
  let last = performance.now();
  let ended = false;

  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    world.reset();
    ended = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.wave();
    announce('Playing. Wave 1. Defend the Bloom.');
  }

  function finishRun(won) {
    ended = true;
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Victory. Score ${world.state.score}.`);
    } else {
      audio.lose();
      announce(`Game over. Score ${world.state.score}.`);
    }
  }

  function playSounds(events) {
    if (events & EV_SHOOT) audio.shoot();
    if (events & EV_KILL) audio.kill();
    if (events & EV_HURT) audio.hurt();
    if (events & EV_BLOOM_HURT) audio.bloomHurt();
    if (events & EV_PICKUP) audio.pickup();
    if (events & EV_DASH) audio.dash();
    if (events & EV_SPORE) audio.spore();
  }

  function pick(index) {
    const events = world.applyUpgrade(index);
    if (events & EV_WAVE) {
      screen = SCREEN_PLAY;
      audio.upgrade();
      audio.wave();
      announce(`Wave ${world.state.wave}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) muted = audio.toggleMute();
    if (screen === SCREEN_TITLE || screen === SCREEN_WIN || screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) startRun();
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) pick(0);
      else if (actions & ACTION_PICK_2) pick(1);
      else if (actions & ACTION_PICK_3) pick(2);
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function handleClicks() {
    const clicks = input.takeClicks();
    if (screen !== SCREEN_UPGRADE || clicks.length === 0) return;
    const rects = upgradeCardRects();
    for (const click of clicks) {
      const f = renderer.screenToField(click.x, click.y);
      for (let i = 0; i < rects.length; i += 1) {
        const r = rects[i];
        if (f.x >= r.x && f.x <= r.x + r.w && f.y >= r.y && f.y <= r.y + r.h) {
          pick(i);
          return;
        }
      }
    }
  }

  function updateHover() {
    if (screen !== SCREEN_UPGRADE) {
      hoverCard = -1;
      return;
    }
    const m = input.mouse();
    const f = renderer.screenToField(m.x, m.y);
    hoverCard = -1;
    const rects = upgradeCardRects();
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (f.x >= r.x && f.x <= r.x + r.w && f.y >= r.y && f.y <= r.y + r.h) hoverCard = i;
    }
  }

  function controlFromInput(dash) {
    const move = input.move();
    const m = input.mouse();
    const aim = renderer.screenToField(m.x, m.y);
    return { mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y, firing: input.firing(), dash };
  }

  function stepOnce(dash) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, IDLE, true);
      return;
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE) {
      const events = world.step(STEP, controlFromInput(dash), false);
      playSounds(events);
      if (events & EV_UPGRADE_OPEN) {
        screen = SCREEN_UPGRADE;
        audio.upgrade();
        announce(`Wave ${world.state.wave} cleared. Choose a gift.`);
      }
      if (!ended && world.state.phase === 'won') finishRun(true);
      else if (!ended && world.state.phase === 'lost') finishRun(false);
      return;
    }
    if (screen === SCREEN_WIN || screen === SCREEN_OVER) {
      // Let the sky keep moving behind the panel: particles fade, the swarm drifts.
      world.step(STEP, IDLE, false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClicks();
    updateHover();
    if (screen === SCREEN_PAUSED) {
      accumulator = 0;
    } else {
      let dash = input.takeDash();
      while (accumulator >= STEP) {
        stepOnce(dash);
        dash = false;
        accumulator -= STEP;
        if (screen === SCREEN_PAUSED) {
          accumulator = 0;
          break;
        }
      }
    }
    renderer.draw(world.state, screen, { best, muted, hoverCard });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Void Bloom. Click or press Enter to begin.');
  requestAnimationFrame(frame);
}
