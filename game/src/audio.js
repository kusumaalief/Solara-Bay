// Procedural sound for Solara Bay: no audio files, no network. Every
// sound is a WebAudio oscillator or a filtered noise burst, started only
// after the player's first gesture, so a silent page never throws.
// The music is a looping bass-and-arpeggio groove; the engine hum
// follows the car's speed (the Comet 01 revs higher than the blocky
// cars, the police Interceptor sits lower); each gun has its own shot;
// and coins, taxi fares, the race countdown and the armory all have
// their own little chimes.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let musicOn = true;
  let musicTimer = null;
  let musicStep = 0;
  let sirenClock = 0;
  let sirenHigh = false;
  let engineOsc = null;
  let engineGain = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function blip(freq, seconds, shape, loud, slideTo, delay) {
    if (muted) return;
    const ac = ensure();
    if (!ac || ac.state === 'suspended') return;
    try {
      const at = ac.currentTime + (delay || 0);
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = shape || 'square';
      osc.frequency.setValueAtTime(freq, at);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + seconds);
      gain.gain.setValueAtTime(loud || 0.06, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(at);
      osc.stop(at + seconds);
    } catch {
      // Sound is optional.
    }
  }

  function burst(seconds, loud) {
    if (muted) return;
    const ac = ensure();
    if (!ac || ac.state === 'suspended') return;
    try {
      const length = Math.floor(ac.sampleRate * seconds);
      const buffer = ac.createBuffer(1, length, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const source = ac.createBufferSource();
      source.buffer = buffer;
      const gain = ac.createGain();
      gain.gain.value = loud || 0.12;
      source.connect(gain);
      gain.connect(ac.destination);
      source.start();
    } catch {
      // Sound is optional.
    }
  }

  // A sun-soaked groove in A minor: a bass line with a plucky arpeggio
  // on top, one bar every 1.6 seconds.
  const BASS_LINE = [110, 0, 110, 0, 130.8, 0, 98, 0, 110, 0, 110, 0, 146.8, 0, 164.8, 0];
  const ARP_LINE = [440, 523, 659, 523, 440, 523, 659, 880, 440, 523, 659, 523, 587, 659, 784, 659];
  function playBeat() {
    if (muted || !musicOn) return;
    const bass = BASS_LINE[musicStep % BASS_LINE.length];
    const arp = ARP_LINE[musicStep % ARP_LINE.length];
    if (bass) blip(bass, 0.18, 'triangle', 0.05);
    if (musicStep % 2 === 0) blip(arp, 0.12, 'sine', 0.025);
    musicStep += 1;
  }

  function startMusic() {
    if (musicTimer || !musicOn) return;
    musicTimer = setInterval(playBeat, 100);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  // The engine note follows the car model — the Comet 01 revs higher,
  // the police Interceptor growls lower, the blocky cars keep the old note.
  function engine(speed, inCar, model) {
    const ac = ensure();
    if (!ac || ac.state === 'suspended') return;
    if (!inCar || muted) {
      if (engineOsc) {
        try { engineOsc.stop(); } catch { /* already stopped */ }
        engineOsc = null;
        engineGain = null;
      }
      return;
    }
    try {
      if (!engineOsc) {
        engineOsc = ac.createOscillator();
        engineGain = ac.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.015;
        engineOsc.connect(engineGain);
        engineGain.connect(ac.destination);
        engineOsc.start();
      }
      const base = model === 'comet' ? 62 : model === 'police' ? 44 : 50;
      const pace = Math.abs(speed);
      engineOsc.frequency.setValueAtTime(base + pace * 3.2, ac.currentTime);
      engineGain.gain.setValueAtTime(0.012 + Math.min(0.02, pace * 0.0006), ac.currentTime);
    } catch {
      // Sound is optional.
    }
  }

  return {
    unlock() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
      startMusic();
    },
    toggleMute() {
      muted = !muted;
      if (muted) stopMusic();
      else startMusic();
      return muted;
    },
    isMuted() { return muted; },
    toggleMusic() {
      musicOn = !musicOn;
      if (musicOn) startMusic();
      else stopMusic();
      return musicOn;
    },
    shoot(weapon) {
      if (weapon === 'shotgun') {
        burst(0.28, 0.24);
        blip(120, 0.22, 'square', 0.09, 45);
      } else if (weapon === 'rifle') {
        burst(0.07, 0.13);
        blip(320, 0.06, 'square', 0.06, 90);
        blip(1400, 0.04, 'sine', 0.04);
      } else {
        burst(0.09, 0.14);
        blip(180, 0.08, 'square', 0.05, 60);
      }
    },
    buy() {
      blip(880, 0.09, 'sine', 0.08);
      blip(1174, 0.09, 'sine', 0.08, null, 0.09);
      blip(1568, 0.18, 'sine', 0.08, null, 0.18);
    },
    reload() {
      blip(500, 0.05, 'square', 0.05);
      blip(340, 0.05, 'square', 0.05, null, 0.18);
      blip(660, 0.07, 'square', 0.05, null, 0.36);
    },
    punch() { burst(0.06, 0.08); },
    pickup() {
      blip(660, 0.1, 'sine', 0.08);
      blip(990, 0.14, 'sine', 0.07);
    },
    coin() {
      blip(1318, 0.08, 'sine', 0.07);
      blip(1760, 0.16, 'sine', 0.06);
    },
    taxi() {
      blip(784, 0.1, 'sine', 0.08);
      blip(1046, 0.18, 'sine', 0.07);
    },
    horn() {
      blip(370, 0.25, 'square', 0.05);
      blip(466, 0.25, 'square', 0.04);
    },
    click() { blip(1200, 0.04, 'square', 0.05); },
    raceStart() {
      blip(440, 0.12, 'square', 0.07);
      blip(440, 0.12, 'square', 0.07, null, 0.15);
      blip(880, 0.3, 'square', 0.08, null, 0.3);
    },
    mission() {
      blip(523, 0.12, 'sine', 0.09);
      blip(659, 0.12, 'sine', 0.09);
      blip(784, 0.22, 'sine', 0.09);
    },
    busted() { blip(220, 0.3, 'sawtooth', 0.08, 110); },
    crash() { burst(0.18, 0.16); },
    engine,
    siren(dt, wanted) {
      if (muted || wanted === 0) return;
      sirenClock -= dt;
      if (sirenClock > 0) return;
      sirenClock = 0.45;
      sirenHigh = !sirenHigh;
      blip(sirenHigh ? 880 : 660, 0.4, 'sine', 0.035);
    },
  };
}
