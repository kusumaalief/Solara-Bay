// Procedural sound for Solara Bay v2: no audio files, no network.
// Everything is a WebAudio oscillator or filtered noise burst, started only
// after the player's first gesture, so a silent page never throws. v2 adds
// a looping bass-and-arpeggio music groove, an engine hum that follows the
// car's speed, a car horn, and distinct sounds for coins, taxi fares and
// the race countdown.
export function createAudio() {
  let context = null;
  let muted = false;
  let sirenTimer = 0;
  let sirenHigh = false;
  let musicTimer = null;
  let musicStep = 0;
  let engineOsc = null;
  let engineGain = null;
  let musicOn = true;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    } catch { context = null; }
    return context;
  }

  function tone(freq, duration, type, gainValue, slideTo, delay) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || ctx.state === 'suspended') return;
    try {
      const start = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
      gain.gain.setValueAtTime(gainValue || 0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
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

  // A simple sun-soaked groove: a bass line (A minor) with a plucky
  // arpeggio on top, one bar every 1.6 seconds.
  const BASS = [110, 0, 110, 0, 130.8, 0, 98, 0, 110, 0, 110, 0, 146.8, 0, 164.8, 0];
  const ARP = [440, 523, 659, 523, 440, 523, 659, 880, 440, 523, 659, 523, 587, 659, 784, 659];
  function musicBeat() {
    if (muted || !musicOn) return;
    const bass = BASS[musicStep % BASS.length];
    const arp = ARP[musicStep % ARP.length];
    if (bass) tone(bass, 0.18, 'triangle', 0.05);
    if (musicStep % 2 === 0) tone(arp, 0.12, 'sine', 0.025);
    musicStep += 1;
  }

  function startMusic() {
    if (musicTimer || !musicOn) return;
    musicTimer = setInterval(musicBeat, 100);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function engine(speed, inCar) {
    const ctx = ensure();
    if (!ctx || ctx.state === 'suspended') return;
    if (!inCar || muted) {
      if (engineOsc) { try { engineOsc.stop(); } catch {} engineOsc = null; engineGain = null; }
      return;
    }
    try {
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.015;
        engineOsc.connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      engineOsc.frequency.setValueAtTime(50 + Math.abs(speed) * 3.2, ctx.currentTime);
      engineGain.gain.setValueAtTime(0.012 + Math.min(0.02, Math.abs(speed) * 0.0006), ctx.currentTime);
    } catch { /* sound is optional */ }
  }

  return {
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      startMusic();
    },
    toggleMute() { muted = !muted; if (muted) stopMusic(); else startMusic(); return muted; },
    isMuted() { return muted; },
    toggleMusic() { musicOn = !musicOn; if (musicOn) startMusic(); else stopMusic(); return musicOn; },
    shoot() { noise(0.09, 0.14); tone(180, 0.08, 'square', 0.05, 60); },
    punch() { noise(0.06, 0.08); },
    pickup() { tone(660, 0.1, 'sine', 0.08); tone(990, 0.14, 'sine', 0.07); },
    coin() { tone(1318, 0.08, 'sine', 0.07); tone(1760, 0.16, 'sine', 0.06); },
    taxi() { tone(784, 0.1, 'sine', 0.08); tone(1046, 0.18, 'sine', 0.07); },
    horn() { tone(370, 0.25, 'square', 0.05); tone(466, 0.25, 'square', 0.04); },
    raceStart() { tone(440, 0.12, 'square', 0.07); tone(440, 0.12, 'square', 0.07, null, 0.15); tone(880, 0.3, 'square', 0.08, null, 0.3); },
    mission() { tone(523, 0.12, 'sine', 0.09); tone(659, 0.12, 'sine', 0.09); tone(784, 0.22, 'sine', 0.09); },
    busted() { tone(220, 0.3, 'sawtooth', 0.08, 110); },
    crash() { noise(0.18, 0.16); },
    engine,
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
