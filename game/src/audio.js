// All sound in Solstice City v4 is synthesized live with WebAudio — no audio
// files. Engine hum, tyre skid, gunshots, pickups and a little radio
// sequencer for Solstice FM 88.1. M mutes everything.

import { RADIO } from './config.js';

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.track = 0;
    this.radioOn = true;
    this._engineOsc = null;
    this._engineOsc2 = null;
    this._engineGain = null;
    this._engineFilter = null;
    this._skidGain = null;
    this._skidSrc = null;
    this._radioTimer = null;
    this._radioStep = 0;
    this._radioNext = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this._engineOsc = ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    this._engineOsc2 = ctx.createOscillator();
    this._engineOsc2.type = 'square';
    this._engineOsc2.frequency.value = 55.5;
    this._engineFilter = ctx.createBiquadFilter();
    this._engineFilter.type = 'lowpass';
    this._engineFilter.frequency.value = 420;
    this._engineGain = ctx.createGain();
    this._engineGain.gain.value = 0;
    this._engineOsc.connect(this._engineFilter);
    this._engineOsc2.connect(this._engineFilter);
    this._engineFilter.connect(this._engineGain);
    this._engineGain.connect(ctx.destination);
    this._engineOsc.start();
    this._engineOsc2.start();
    // Skid: looped white noise through a bandpass, gain follows slip.
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._skidSrc = ctx.createBufferSource();
    this._skidSrc.buffer = buf;
    this._skidSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    this._skidGain = ctx.createGain();
    this._skidGain.gain.value = 0;
    this._skidSrc.connect(bp);
    bp.connect(this._skidGain);
    this._skidGain.connect(ctx.destination);
    this._skidSrc.start();
  }

  setEngine(speed01, on) {
    if (!this.ctx || !this._engineGain) return;
    const t = this.ctx.currentTime;
    const f = 52 + speed01 * 165;
    this._engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this._engineOsc2.frequency.setTargetAtTime(f * 1.005 + 1.5, t, 0.08);
    this._engineFilter.frequency.setTargetAtTime(380 + speed01 * 1400, t, 0.1);
    this._engineGain.gain.setTargetAtTime(this.muted || !on ? 0 : 0.045 + speed01 * 0.05, t, 0.1);
  }

  setSkid(amount) {
    if (!this.ctx || !this._skidGain) return;
    this._skidGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.12, amount * 0.12), this.ctx.currentTime, 0.06);
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    this._blip(110, 0.14, 'sine', 0.3);
  }

  pickup() {
    this._blip(660, 0.09, 'sine', 0.22);
    this._blip(990, 0.14, 'sine', 0.22, 0.08);
  }

  cash() {
    this._blip(880, 0.1, 'triangle', 0.25);
    this._blip(1174, 0.12, 'triangle', 0.25, 0.07);
    this._blip(1568, 0.18, 'triangle', 0.22, 0.14);
  }

  crash() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.8;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    this._blip(70, 0.3, 'sine', 0.4);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this._engineGain) this._engineGain.gain.setTargetAtTime(0, t, 0.05);
    if (this._skidGain) this._skidGain.gain.setTargetAtTime(0, t, 0.05);
    if (m) this.stopRadio();
    else if (this.radioOn) this.startRadio();
  }

  // Radio: a tiny step sequencer. Each track is a minor-key bass line with
  // a bright lead on top; the pattern is derived from the track data so
  // every track sounds different.
  startRadio() {
    if (!this.ctx || this._radioTimer) return;
    const track = RADIO[this.track];
    const stepDur = 60 / track.bpm / 2; // eighth notes
    const scale = [0, 2, 3, 5, 7, 8, 10];
    const bassNotes = [0, 0, 3, 5, 0, 0, 5, 3];
    this._radioStep = 0;
    this._radioNext = this.ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.ctx || this.muted) return;
      while (this._radioNext < this.ctx.currentTime + 0.25) {
        const s = this._radioStep;
        const bar = Math.floor(s / 8) % 8;
        const root = track.root + scale[bassNotes[s % 8] % scale.length];
        const when = this._radioNext - this.ctx.currentTime;
        // Bass on every step, quiet and low.
        this._note(midiToFreq(root - 12), stepDur * 0.9, 'triangle', 0.11, when);
        // Lead sparkles on the off-beats for bright tracks.
        if (track.bright && s % 4 === 2) {
          const lead = root + 12 + scale[(s * 3 + bar) % scale.length];
          this._note(midiToFreq(lead), stepDur * 1.6, 'square', 0.045, when);
        }
        // Hats: a short filtered noise tick on odd steps.
        if (s % 2 === 1) this._hat(when);
        this._radioStep += 1;
        this._radioNext += stepDur;
      }
    };
    this._radioTimer = setInterval(tick, 90);
  }

  stopRadio() {
    if (this._radioTimer) {
      clearInterval(this._radioTimer);
      this._radioTimer = null;
    }
  }

  nextTrack() {
    this.track = (this.track + 1) % RADIO.length;
    if (this.ctx && !this.muted) {
      this.stopRadio();
      this.startRadio();
    }
    return RADIO[this.track].name;
  }

  _note(freq, dur, type, vol, when) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.max(0, when);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _hat(when) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.max(0, when);
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(hp);
    hp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
  }
}
