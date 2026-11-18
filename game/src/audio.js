// Solstice City — sound, synthesized with WebAudio, no audio files.
// Engine hum, police sirens, gunshots, crashes, pickups and jingles are all
// built from oscillators and filtered noise, so the game loads nothing.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.noiseBuffer = null;
  }

  // Must be called from a user gesture (the start button) — browsers block
  // audio before one.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const engineOsc2 = this.ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      engineOsc2.start();
      this.engineOsc2 = engineOsc2;
      // Siren: a sine that alternates between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // Called every frame while driving: speedNorm is 0..1.
  engine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + speedNorm * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const freq = 55 + speedNorm * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.5, this.ctx.currentTime, 0.08);
  }

  // Called every frame: wanted > 0 keeps the siren wailing.
  siren(dt, wanted) {
    if (!this.ctx || !this.sirenGain) return;
    const target = wanted > 0 ? 0.045 : 0;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    if (wanted > 0) {
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenTimer = 0.42;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 960 : 700, this.ctx.currentTime, 0.02);
      }
    }
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shoot() {
    this._noise(0.12, 0.35, 2600);
    this._blip(180, 0.08, 'square', 0.12);
  }

  crash() {
    this._noise(0.25, 0.4, 500);
    this._blip(90, 0.25, 'sine', 0.3);
  }

  pickup() {
    this._blip(880, 0.09, 'sine', 0.22);
    this._blip(1318, 0.14, 'sine', 0.22, 0.08);
  }

  cash() {
    this._blip(1046, 0.1, 'sine', 0.22);
    this._blip(1568, 0.16, 'sine', 0.22, 0.09);
  }

  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => this._blip(f, 0.18, 'triangle', 0.25, i * 0.11));
  }

  busted() {
    [392, 330, 262].forEach((f, i) => this._blip(f, 0.22, 'sawtooth', 0.18, i * 0.16));
  }

  click() {
    this._blip(660, 0.06, 'sine', 0.18);
  }

  enterCar() {
    this._blip(220, 0.1, 'triangle', 0.2);
    this._blip(330, 0.12, 'triangle', 0.2, 0.07);
  }
}
