// Void Bloom — sound made from oscillators, no audio files. A tiny synth: short
// shaped blips for shots and hits, a noise swish for the dash, low thumps for the
// Bloom being bitten, a rising arpeggio when a wave breaks, and a slow two-chord
// pad humming under everything once the player has made a first gesture (browsers
// refuse audio before that). M toggles mute; the choice is kept in memory only.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let padNodes = null;
  let lastShoot = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freqA, freqB, dur, type, vol, when = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  function startPad() {
    if (!ensure() || padNodes) return;
    // Two detuned triangles a fifth apart through a slow-breathing lowpass: the void hums.
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = 110;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 164.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(gain).connect(master);
    o1.start();
    o2.start();
    lfo.start();
    padNodes = { o1, o2, lfo, gain };
  }

  return {
    unlock() {
      if (ensure()) startPad();
    },
    shoot() {
      const now = performance.now();
      if (now - lastShoot < 55) return;
      lastShoot = now;
      tone(880, 320, 0.09, 'square', 0.05);
    },
    kill() {
      tone(300, 60, 0.22, 'sawtooth', 0.12);
      noise(0.16, 0.1, 900);
    },
    hurt() {
      tone(200, 70, 0.25, 'sawtooth', 0.16);
    },
    bloomHurt() {
      tone(130, 55, 0.3, 'sine', 0.3);
      noise(0.2, 0.08, 300);
    },
    pickup() {
      tone(1250, 1750, 0.08, 'sine', 0.06);
    },
    dash() {
      noise(0.18, 0.12, 1600);
    },
    spore() {
      tone(520, 180, 0.3, 'triangle', 0.07);
    },
    wave() {
      tone(392, 392, 0.14, 'triangle', 0.12);
      tone(523, 523, 0.14, 'triangle', 0.12, 0.1);
      tone(659, 659, 0.22, 'triangle', 0.12, 0.2);
    },
    upgrade() {
      tone(659, 659, 0.12, 'sine', 0.12);
      tone(784, 784, 0.12, 'sine', 0.12, 0.09);
      tone(1046, 1046, 0.26, 'sine', 0.12, 0.18);
    },
    win() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.13, i * 0.11));
    },
    lose() {
      const notes = [392, 330, 262, 196];
      notes.forEach((f, i) => tone(f, f * 0.94, 0.34, 'triangle', 0.13, i * 0.15));
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
