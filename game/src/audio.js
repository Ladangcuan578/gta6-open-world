// Procedural sound: everything is synthesised with WebAudio, no audio files.
// Engine hum, two-tone siren, gunshots, pickups and three radio stations made of
// oscillators and filtered noise. Audio starts only after a user gesture.
import { RADIO } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let radioTimer = null;
  let radioStep = 0;
  let station = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle that alternates between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  // Radio: a tiny step sequencer. Each station has its own bass line and tempo.
  const STATION_PATTERNS = [
    { tempo: 112, bass: [55, 0, 55, 0, 65.4, 0, 49, 0], lead: [220, 261.6, 329.6, 392] },
    { tempo: 96, bass: [49, 0, 58.3, 0, 49, 0, 65.4, 73.4], lead: [196, 220, 246.9, 196] },
    { tempo: 124, bass: [58.3, 58.3, 0, 65.4, 0, 73.4, 0, 65.4], lead: [233.1, 277.2, 311.1, 349.2] },
  ];

  function radioTick() {
    if (!ctx || muted) return;
    const pattern = STATION_PATTERNS[station % STATION_PATTERNS.length];
    const step = radioStep % 8;
    const bass = pattern.bass[step];
    if (bass) blip(bass, 0.22, 'triangle', 0.16);
    if (step % 2 === 0) blip(pattern.lead[(radioStep / 2) % 4 | 0], 0.14, 'square', 0.05);
    if (step % 4 === 2) noise(0.03, 0.05, 6000);
    radioStep += 1;
    radioTimer = window.setTimeout(radioTick, 60000 / pattern.tempo / 2);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setEngine(speed01, inCar) {
      if (!ctx || !engineOsc) return;
      const target = inCar ? 0.05 + speed01 * 0.11 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.08);
    },
    setSiren(on, wanted) {
      if (!ctx || !sirenOsc) return;
      if (!on) {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.035 + wanted * 0.008, ctx.currentTime, 0.1);
      const now = ctx.currentTime;
      const phase = Math.floor(now * 1.6) % 2 === 0 ? 660 : 520;
      sirenOsc.frequency.setTargetAtTime(phase, now, 0.05);
    },
    gunshot() {
      noise(0.14, 0.5, 1800);
      blip(160, 0.1, 'square', 0.2, 60);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.25);
      window.setTimeout(() => blip(990, 0.14, 'sine', 0.25), 90);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.25, 'sawtooth', 0.15), i * 140));
    },
    crash() {
      noise(0.25, 0.4, 900);
    },
    setStation(index) {
      station = ((index % RADIO.length) + RADIO.length) % RADIO.length;
      return station;
    },
    startRadio() {
      if (!ensure() || radioTimer !== null) return;
      radioStep = 0;
      radioTick();
    },
    stopRadio() {
      if (radioTimer !== null) {
        window.clearTimeout(radioTimer);
        radioTimer = null;
      }
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
  };
}
