// Void Bloom — drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 field is letterboxed into the window. The sky (nebula wash, stars,
// vignette) is painted once onto offscreen canvases; glow dots are pre-rendered
// sprites, so a busy frame is mostly drawImage and paths. Everything animated is
// driven by the world's own clock, never the wall clock, so a staged screenshot
// scene renders the same frame every time.

import { BLOOM, CENTER, FIELD, FONT, PALETTE, PLAYER, WAVES_TOTAL } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

/** The three gift cards of the upgrade screen, in field coordinates. */
export function upgradeCardRects() {
  const w = 340;
  const h = 216;
  const gap = 30;
  const x0 = (FIELD.width - (w * 3 + gap * 2)) / 2;
  const y = 296;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

function makeSky() {
  const c = document.createElement('canvas');
  c.width = FIELD.width;
  c.height = FIELD.height;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.void;
  g.fillRect(0, 0, FIELD.width, FIELD.height);
  const washes = [
    [240, 130, 420, PALETTE.nebulaA],
    [1080, 590, 460, PALETTE.nebulaB],
    [1020, 110, 300, PALETTE.nebulaC],
    [180, 620, 320, PALETTE.nebulaB],
    [640, 380, 520, PALETTE.nebulaA],
  ];
  for (const [x, y, r, color] of washes) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.55;
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  const rng = createRandom(20261115);
  for (let i = 0; i < 210; i += 1) {
    const x = rng() * FIELD.width;
    const y = rng() * FIELD.height;
    const r = rng() * 1.6 + 0.4;
    g.globalAlpha = 0.25 + rng() * 0.75;
    g.fillStyle = rng() < 0.12 ? '#ffd166' : '#dfe6ff';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

function makeVignette() {
  const c = document.createElement('canvas');
  c.width = FIELD.width;
  c.height = FIELD.height;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(CENTER.x, CENTER.y, 300, CENTER.x, CENTER.y, 780);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(2,3,10,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, FIELD.width, FIELD.height);
  return c;
}

function makeGlowSprite(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  const sky = makeSky();
  const vignette = makeVignette();
  const sprites = new Map();
  const fonts = new Map();

  function sprite(color) {
    if (!sprites.has(color)) sprites.set(color, makeGlowSprite(color));
    return sprites.get(color);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view.x = (canvas.width - FIELD.width * view.scale) / 2;
    view.y = (canvas.height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = 600) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function glow(x, y, size, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite(color), x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, color, back = 'rgba(255,255,255,0.14)') {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  // ---- the Bloom ---------------------------------------------------------
  function drawBloom(state) {
    const { bloom } = state;
    const frac = bloom.hp / bloom.maxHp;
    const wilted = bloom.hp <= 0;
    const pulse = 1 + Math.sin(state.time * 1.6) * 0.03;
    const healthGlow = wilted ? 0 : 0.25 + frac * 0.5;
    glow(CENTER.x, CENTER.y, 340 * pulse, PALETTE.bloomPetal, healthGlow * 0.5);
    glow(CENTER.x, CENTER.y, 170 * pulse, PALETTE.bloomCore, healthGlow);

    // stem and leaves below the flower head
    ctx.strokeStyle = wilted ? '#4a4a55' : PALETTE.bloomStem;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(CENTER.x, CENTER.y + 26);
    ctx.quadraticCurveTo(CENTER.x + 10, CENTER.y + 90, CENTER.x - 6, FIELD.height);
    ctx.stroke();
    ctx.fillStyle = wilted ? '#55555f' : PALETTE.bloomStem;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(CENTER.x + side * 8, CENTER.y + 108);
      ctx.rotate(side * 0.7);
      ctx.beginPath();
      ctx.ellipse(side * 26, 0, 34, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // petals: eight ellipses turning slowly; they droop and grey as health falls
    const petals = 8;
    const droop = wilted ? 0.85 : (1 - frac) * 0.45;
    for (let i = 0; i < petals; i += 1) {
      const a = (i / petals) * Math.PI * 2 + state.time * 0.12;
      const len = (46 + Math.sin(state.time * 1.3 + i * 1.7) * 5) * (wilted ? 0.8 : 1);
      ctx.save();
      ctx.translate(CENTER.x, CENTER.y);
      ctx.rotate(a + droop * 0.6);
      ctx.fillStyle = wilted ? '#6b5a6e' : (frac < 0.35 ? PALETTE.bloomPetalDim : PALETTE.bloomPetal);
      ctx.globalAlpha = wilted ? 0.75 : 0.92;
      ctx.beginPath();
      ctx.ellipse(len * 0.72, 0, len * 0.62, len * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // the heart of the flower
    const coreR = (19 + Math.sin(state.time * 2.2) * 2) * pulse;
    const grad = ctx.createRadialGradient(CENTER.x - 5, CENTER.y - 5, 2, CENTER.x, CENTER.y, coreR * 1.6);
    grad.addColorStop(0, '#fffbe8');
    grad.addColorStop(0.55, wilted ? '#9a8f7a' : PALETTE.bloomCore);
    grad.addColorStop(1, wilted ? '#5c5546' : '#f5a623');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, coreR, 0, Math.PI * 2);
    ctx.fill();
    if (bloom.hurtFlash > 0) {
      ctx.globalAlpha = Math.min(0.7, bloom.hurtFlash * 2.4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, BLOOM.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    void BLOOM;
  }

  // ---- creatures -----------------------------------------------------------
  function drawEnemy(e, state) {
    const t = state.time;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.kind === 'moth' || e.kind === 'splitter') {
      const flap = Math.sin(t * 16 + e.phase) * 0.55;
      ctx.fillStyle = e.splitter ? '#d98cff' : PALETTE.moth;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.rotate(side * (0.5 + flap * 0.5));
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(side * 15, -4, 15, 8, side * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2c1a4d';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(-4, -3, 2.4, 0, Math.PI * 2);
      ctx.arc(4, -3, 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (e.splitter) {
        ctx.strokeStyle = PALETTE.mite;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (e.kind === 'mite') {
      ctx.strokeStyle = PALETTE.mite;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.sin(t * 20 + e.phase) * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
        ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.stroke();
      }
      ctx.fillStyle = PALETTE.mite;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'wisp') {
      const a = Math.atan2(e.vy, e.vx);
      ctx.rotate(a + Math.PI / 2);
      glow(0, 0, 52, PALETTE.wisp, 0.5);
      ctx.fillStyle = PALETTE.wisp;
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.quadraticCurveTo(9, 4, 0, 12);
      ctx.quadraticCurveTo(-9, 4, 0, -13);
      ctx.fill();
      ctx.fillStyle = '#eaffea';
      ctx.beginPath();
      ctx.arc(0, -2, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'beetle') {
      ctx.strokeStyle = '#c96f3f';
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i += 1) {
          const y = -10 + i * 10;
          ctx.beginPath();
          ctx.moveTo(side * 16, y);
          ctx.lineTo(side * 27, y + Math.sin(t * 9 + e.phase + i) * 4);
          ctx.stroke();
        }
      }
      ctx.fillStyle = PALETTE.beetle;
      ctx.beginPath();
      ctx.ellipse(0, 0, 21, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a4522';
      ctx.beginPath();
      ctx.ellipse(0, -4, 13, 16, 0, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#ffd9b0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, -20);
      ctx.quadraticCurveTo(0, -34, 6, -20);
      ctx.stroke();
    } else if (e.kind === 'maw') {
      const chomp = Math.sin(t * 2.4) * 0.16 + 0.2;
      glow(0, 0, 260, PALETTE.maw, 0.35);
      ctx.fillStyle = '#571d24';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.maw;
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2 + t * 0.3;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(e.radius - 6, -8);
        ctx.lineTo(e.radius + 16, 0);
        ctx.lineTo(e.radius - 6, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // the mouth, opening toward the Bloom
      const toward = Math.atan2(CENTER.y - e.y, CENTER.x - e.x);
      ctx.fillStyle = '#1a0508';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, e.radius * 0.78, toward - chomp, toward + chomp);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff2f2';
      for (let i = 0; i < 5; i += 1) {
        const a = toward - chomp + (i / 4) * chomp * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.radius * 0.7, Math.sin(a) * e.radius * 0.7, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd166';
      for (const [ex, ey] of [[-20, -26], [0, -34], [20, -26]]) {
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0508';
        ctx.beginPath();
        ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
      }
    }
    if (e.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.8, e.hitFlash * 5);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // a slim health sliver over the tough kinds once they are hurt
    if ((e.kind === 'beetle' || e.kind === 'splitter' || e.kind === 'maw') && e.hp < e.maxHp && e.kind !== 'maw') {
      bar(e.x - 20, e.y - e.radius - 12, 40, 4, e.hp / e.maxHp, '#ffb08a');
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.dead) return;
    if (p.iframes > 0 && p.dashTimer <= 0 && Math.floor(state.time * 14) % 2 === 0) return; // hurt blink
    const aim = Math.atan2(p.aimY - p.y, p.aimX - p.x);
    glow(p.x, p.y, 92, PALETTE.player, 0.5);
    ctx.save();
    ctx.translate(p.x, p.y);
    // wings, fluttering
    const flap = Math.sin(state.time * 30) * 0.5;
    ctx.fillStyle = PALETTE.playerWing;
    ctx.globalAlpha = 0.75;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.9 + flap * 0.4));
      ctx.beginPath();
      ctx.ellipse(side * 13, -6, 13, 6, side * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // body
    const grad = ctx.createRadialGradient(-4, -5, 2, 0, 0, PLAYER.radius + 3);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, PALETTE.player);
    grad.addColorStop(1, '#1e7f9e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    // the pollen gun, a short barrel toward the aim
    ctx.rotate(aim);
    ctx.fillStyle = '#eaffff';
    ctx.fillRect(8, -2.5, 13, 5);
    ctx.restore();
    if (p.hurtFlash > 0) {
      ctx.globalAlpha = Math.min(0.6, p.hurtFlash * 2);
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---- screens ---------------------------------------------------------------
  function drawHud(state, opts) {
    ctx.textBaseline = 'top';
    text('SCORE', 24, 16, 13, PALETTE.muted, 'left', 700);
    text(String(state.score), 24, 32, 30, PALETTE.text, 'left', 800);
    if (state.combo.count >= 2) {
      const tier = state.combo.tier;
      text(`COMBO x${tier}`, 24, 68, 17, tier >= 4 ? '#ffd166' : '#aef7ff', 'left', 800);
      bar(24, 90, 110, 4, state.combo.timer / 3, '#ffd166');
    }
    text(`WAVE ${state.wave} / ${WAVES_TOTAL}`, FIELD.width / 2, 18, 19, PALETTE.text, 'center', 800);
    // the Maw's health, while it lives
    let maw = null;
    for (const e of state.enemies) if (e.active && e.kind === 'maw') maw = e;
    if (maw) {
      text('THE VOID MAW', FIELD.width / 2, 46, 13, '#ff8f98', 'center', 700);
      bar(FIELD.width / 2 - 190, 64, 380, 9, maw.hp / maw.maxHp, PALETTE.maw);
    }
    // shards, top right
    ctx.save();
    ctx.translate(FIELD.width - 118, 34);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.shard;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
    text(String(state.shards), FIELD.width - 96, 20, 26, PALETTE.shard, 'left', 800);
    if (opts.muted) text('MUTED (M)', FIELD.width - 24, 52, 12, PALETTE.muted, 'right', 700);

    // keeper and Bloom health, bottom corners
    text('KEEPER', 24, FIELD.height - 52, 12, PALETTE.muted, 'left', 700);
    bar(24, FIELD.height - 36, 230, 12, state.player.hp / state.player.maxHp,
      state.player.hp < 30 ? PALETTE.danger : PALETTE.player);
    if (state.player.dashCdTimer > 0) {
      bar(24, FIELD.height - 20, 230, 4, 1 - state.player.dashCdTimer / state.stats.dashCd, '#8ad8ff');
    }
    text('THE BLOOM', FIELD.width - 24, FIELD.height - 52, 12, PALETTE.muted, 'right', 700);
    bar(FIELD.width - 254, FIELD.height - 36, 230, 12, state.bloom.hp / state.bloom.maxHp,
      state.bloom.hp < state.bloom.maxHp * 0.3 ? PALETTE.danger : PALETTE.bloomPetal);

    // wave banner
    const b = state.banner;
    if (b.timer > 0 && b.dur > 0) {
      const fade = Math.min(1, b.timer / 0.5, (b.dur - b.timer) / 0.3 + 0.2);
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      text(b.title, FIELD.width / 2, 128, 44, '#ffffff', 'center', 800);
      if (b.sub) text(b.sub, FIELD.width / 2, 182, 19, PALETTE.muted, 'center', 600);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();
  }

  function drawTitle(state, opts) {
    const veil = ctx.createLinearGradient(0, 0, 0, 330);
    veil.addColorStop(0, 'rgba(4,5,16,0.52)');
    veil.addColorStop(1, 'rgba(4,5,16,0)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, FIELD.width, 330);
    ctx.textBaseline = 'alphabetic';
    glow(FIELD.width / 2, 108, 560, PALETTE.bloomPetal, 0.30);
    text('VOID BLOOM', FIELD.width / 2, 118, 76, '#ffffff', 'center', 800);
    text('The last flower in the dark is still shining.', FIELD.width / 2, 158, 21, '#ffd9f2', 'center', 600);
    text('Void moths are coming to eat its light. You are its keeper.', FIELD.width / 2, 196, 17, PALETTE.muted, 'center', 500);
    text('WASD / arrows to fly · mouse to aim · hold click or Space to fire · Shift to dash', FIELD.width / 2, 226, 16, PALETTE.text, 'center', 600);
    text('Survive 10 waves. Guard the Bloom — and yourself.', FIELD.width / 2, 252, 16, PALETTE.text, 'center', 600);
    const pulse = 0.82 + Math.sin(state.time * 3.2) * 0.18;
    ctx.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO BEGIN', FIELD.width / 2, FIELD.height - 42, 20, '#ffd166', 'center', 800);
    ctx.globalAlpha = 1;
    if (opts.best > 0) text(`Best score ${opts.best}`, FIELD.width / 2, FIELD.height - 14, 14, PALETTE.muted, 'center', 600);
  }

  function drawUpgrade(state, opts) {
    ctx.fillStyle = 'rgba(4,5,16,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textBaseline = 'alphabetic';
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 168, 34, '#ffffff', 'center', 800);
    text('The Bloom offers a gift. Choose one.', FIELD.width / 2, 208, 19, '#ffd9f2', 'center', 600);
    const rects = upgradeCardRects();
    const accents = ['#6ef3ff', '#ffd166', '#ff7ad9'];
    state.upgradeChoices.forEach((choice, i) => {
      const r = rects[i];
      const hover = opts.hoverCard === i;
      ctx.fillStyle = hover ? 'rgba(30,36,74,0.95)' : PALETTE.panel;
      ctx.strokeStyle = hover ? accents[i] : PALETTE.panelEdge;
      ctx.lineWidth = hover ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accents[i];
      ctx.fillRect(r.x + 18, r.y + 16, 44, 6);
      text(`[${i + 1}]`, r.x + r.w - 20, r.y + 38, 15, PALETTE.muted, 'right', 700);
      text(choice.name, r.x + 22, r.y + 92, 25, '#ffffff', 'left', 800);
      // wrap the description by hand: two lines at most, split on spaces
      const words = choice.desc.split(' ');
      const lines = [''];
      for (const w of words) {
        const trial = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
        if (trial.length > 26 && lines[lines.length - 1]) lines.push(w);
        else lines[lines.length - 1] = trial;
      }
      lines.slice(0, 3).forEach((line, li) => {
        text(line, r.x + 22, r.y + 128 + li * 24, 16, PALETTE.muted, 'left', 500);
      });
    });
    text('Click a card, or press 1 · 2 · 3', FIELD.width / 2, 566, 15, PALETTE.muted, 'center', 600);
  }

  function drawEnd(state, opts, won) {
    ctx.fillStyle = 'rgba(4,5,16,0.5)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const w = 620;
    const h = 330;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    panel(x, y, w, h);
    ctx.textBaseline = 'alphabetic';
    if (won) {
      text('THE BLOOM ENDURES', FIELD.width / 2, y + 78, 38, '#ffe9a8', 'center', 800);
      text('Dawn comes, and the dark goes hungry.', FIELD.width / 2, y + 114, 17, PALETTE.muted, 'center', 500);
    } else {
      text('THE DARK PREVAILS', FIELD.width / 2, y + 78, 38, '#ff8f98', 'center', 800);
      text(state.bloom.hp <= 0 ? 'The Bloom was eaten to the root.' : 'The keeper fell, and the Bloom followed.',
        FIELD.width / 2, y + 114, 17, PALETTE.muted, 'center', 500);
    }
    text(`Score ${state.score}`, FIELD.width / 2, y + 168, 24, '#ffffff', 'center', 800);
    text(`Kills ${state.kills} · Waves survived ${won ? WAVES_TOTAL : state.wave} · Shards gathered ${state.shards}`,
      FIELD.width / 2, y + 204, 16, PALETTE.muted, 'center', 600);
    if (opts.best > 0) text(`Best ${Math.max(opts.best, state.score)}`, FIELD.width / 2, y + 234, 15, PALETTE.muted, 'center', 600);
    const pulse = 0.65 + Math.sin(state.time * 3.2) * 0.35;
    ctx.globalAlpha = pulse;
    text('PRESS ENTER OR CLICK TO PLAY AGAIN', FIELD.width / 2, y + 288, 17, '#ffd166', 'center', 800);
    ctx.globalAlpha = 1;
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(4,5,16,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textBaseline = 'alphabetic';
    text('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10, 42, '#ffffff', 'center', 800);
    text('Press P to resume', FIELD.width / 2, FIELD.height / 2 + 34, 17, PALETTE.muted, 'center', 600);
    void state;
  }

  /** Paint one frame of `state` under `screen`. */
  function draw(state, screen, opts = {}) {
    const o = { best: 0, muted: false, hoverCard: -1, ...opts };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shX = state.shake ? Math.sin(state.time * 91) * state.shake : 0;
    const shY = state.shake ? Math.cos(state.time * 83) * state.shake : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + shX * view.scale, view.y + shY * view.scale);

    ctx.drawImage(sky, 0, 0);
    // thorn aura ring
    if (state.stats.thornDps > 0) {
      ctx.strokeStyle = 'rgba(87,230,169,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.lineDashOffset = -state.time * 30;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, 130, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // pickups
    for (const s of state.pickups) {
      if (!s.active) continue;
      glow(s.x, s.y, 34, PALETTE.shard, 0.55);
      ctx.save();
      ctx.translate(s.x, s.y + Math.sin(state.time * 4 + s.phase) * 2.5);
      ctx.rotate(Math.PI / 4 + state.time * 1.5);
      ctx.fillStyle = PALETTE.shard;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    // spores
    for (const s of state.spores) {
      if (!s.active) continue;
      glow(s.x, s.y, 30, PALETTE.spore, 0.6);
      ctx.fillStyle = '#ffd7dc';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    drawBloom(state);
    for (const e of state.enemies) if (e.active) drawEnemy(e, state);
    // bullets
    for (const b of state.bullets) {
      if (!b.active) continue;
      glow(b.x, b.y, 26, PALETTE.bullet, 0.75);
    }
    drawPlayer(state);
    // particles, additive
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // floaters
    ctx.textBaseline = 'alphabetic';
    for (const f of state.floaters) {
      if (!f.active) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.45));
      text(f.text, f.x, f.y, f.size, f.color, 'center', 800);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(vignette, 0, 0);

    if (screen === SCREEN_TITLE) {
      drawTitle(state, o);
    } else {
      drawHud(state, o);
      if (screen === SCREEN_UPGRADE) drawUpgrade(state, o);
      else if (screen === SCREEN_PAUSED) drawPaused(state);
      else if (screen === SCREEN_WIN) drawEnd(state, o, true);
      else if (screen === SCREEN_OVER) drawEnd(state, o, false);
    }
  }

  /** Convert client (CSS pixel) coordinates into field coordinates. */
  function screenToField(clientX, clientY) {
    const px = clientX * view.dpr;
    const py = clientY * view.dpr;
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToField };
}
