// Procedural sound for Solara Bay 3D: no audio files, no network.
// Everything is a WebAudio oscillator or filtered noise burst, started only
// after the player's first gesture, so a silent page never throws.
export function createAudio() {
  let context = null;
  let muted = false;
  let sirenTimer = 0;
  let sirenHigh = false;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    } catch { context = null; }
    return context;
  }

  function tone(freq, duration, type, gainValue, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || ctx.state === 'suspended') return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
      gain.gain.setValueAtTime(gainValue || 0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* sound is optional */ }
  }

  function noise(duration, gainValue) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || ctx.state === 'suspended') return;
    try {
      const length = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainValue || 0.12;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch { /* sound is optional */ }
  }

  return {
    unlock() { const ctx = ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
    shoot() { noise(0.09, 0.14); tone(180, 0.08, 'square', 0.05, 60); },
    punch() { noise(0.06, 0.08); },
    pickup() { tone(660, 0.1, 'sine', 0.08); tone(990, 0.14, 'sine', 0.07); },
    mission() { tone(523, 0.12, 'sine', 0.09); tone(659, 0.12, 'sine', 0.09); tone(784, 0.22, 'sine', 0.09); },
    busted() { tone(220, 0.3, 'sawtooth', 0.08, 110); },
    crash() { noise(0.18, 0.16); },
    siren(dt, wanted) {
      if (muted || wanted === 0) return;
      sirenTimer -= dt;
      if (sirenTimer > 0) return;
      sirenTimer = 0.45;
      sirenHigh = !sirenHigh;
      tone(sirenHigh ? 880 : 660, 0.4, 'sine', 0.035);
    },
  };
}
