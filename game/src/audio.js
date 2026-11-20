// Solstice City v3 — sound. Every sound is synthesized live with WebAudio:
// no audio files, no network. Engine hum, tyre skid, gunshots, pickups, the
// radio's little sequencer — all built from oscillators and filtered noise.

import { TRACKS } from './config.js';

// A pentatonic-ish ladder of semitone offsets, so the radio never plays a
// wrong-sounding note whatever track is on.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.track = 0;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.skidGain = null;
    this.skidSrc = null;
    this.radioTimer = null;
    this.radioStep = 0;
    this.nextNoteAt = 0;
  }

  // Create the context on a user gesture (a click). Before that, every
  // method is a harmless no-op, so headless play-tests never throw.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this._startEngine();
      this._startSkid();
      this._startRadio();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  _noiseBuffer(seconds = 1) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 27.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  // The engine note follows the car's speed: idle rumble to a highway whine.
  engine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speedNorm * 0.09 : 0.02;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 165, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(27.5 + speedNorm * 82, t, 0.1);
  }

  _startSkid() {
    this.skidSrc = this.ctx.createBufferSource();
    this.skidSrc.buffer = this._noiseBuffer(1);
    this.skidSrc.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.4;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidSrc.connect(bp);
    bp.connect(this.skidGain);
    this.skidGain.connect(this.master);
    this.skidSrc.start();
  }

  skid(amount) {
    if (!this.ctx || !this.skidGain) return;
    this.skidGain.gain.setTargetAtTime(Math.min(0.12, amount * 0.12), this.ctx.currentTime, 0.08);
  }

  _blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  click() {
    this._blip(660, 0.07, 'square', 0.08);
  }

  pickup() {
    this._blip(880, 0.12, 'sine', 0.22);
    this._blip(1318, 0.18, 'sine', 0.22, 0.09);
  }

  shot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.25);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.25);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
    this._blip(70, 0.3, 'sine', 0.3);
  }

  wantedUp() {
    this._blip(220, 0.16, 'square', 0.12);
    this._blip(174, 0.22, 'square', 0.12, 0.14);
  }

  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => this._blip(f, 0.22, 'triangle', 0.2, i * 0.11));
  }

  setTrack(i) {
    this.track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    this.radioStep = 0;
  }

  // The radio: a slow 8-step loop — a soft bass note and a sparse lead line
  // that wanders the scale. It starts only after unlock().
  _startRadio() {
    this.nextNoteAt = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.ctx) return;
      const track = TRACKS[this.track];
      const stepDur = 60 / track.bpm / 2;
      while (this.nextNoteAt < this.ctx.currentTime + 0.25) {
        const step = this.radioStep;
        const degree = SCALE[(step * 3 + this.track * 2) % SCALE.length];
        const freq = track.root * Math.pow(2, degree / 12);
        if (step % 2 === 0) this._noteAt(freq / 2, this.nextNoteAt, stepDur * 1.8, 'triangle', 0.1);
        if (step % 4 === 1) this._noteAt(freq * 2, this.nextNoteAt, stepDur, 'sine', 0.07);
        this.radioStep += 1;
        this.nextNoteAt += stepDur;
      }
      this.radioTimer = setTimeout(tick, 120);
    };
    tick();
  }

  _noteAt(freq, at, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
}
