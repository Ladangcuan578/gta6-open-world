// Solstice City v3 — the story. Seven jobs from Vera Solano, each with its
// own steps: steal a car, walk to a place, or deliver against the clock.
// The marker in the world and on the minimap always points at the current
// step, and the HUD always says what to do next.

import { MISSIONS } from './config.js';

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.active = false;
    this.step = 0;
    this.timer = 0;
    this.done = false;
  }

  current() {
    return MISSIONS[this.index] || null;
  }

  start() {
    this.index = 0;
    this.step = 0;
    this.timer = 0;
    this.active = true;
    this.done = false;
    const m = this.current();
    if (m) this.game.hud.showDialogue(m.intro, 'Vera Solano');
  }

  _beginStep() {
    const m = this.current();
    if (!m) return;
    const s = m.steps[this.step];
    this.timer = s && s.time ? s.time : 0;
  }

  _startMission(i) {
    this.index = i;
    this.step = 0;
    this.active = true;
    const m = this.current();
    if (m) {
      this.game.hud.showDialogue(m.intro, 'Vera Solano');
      this._beginStep();
    }
  }

  objectiveText() {
    const m = this.current();
    if (!this.active || !m) return this.done ? 'Story complete — Solstice City is yours.' : '';
    const s = m.steps[this.step];
    return s ? s.text : m.name;
  }

  stageText() {
    if (this.done) return 'STAGE 7/7';
    return `STAGE ${Math.min(7, this.index + 1)}/7`;
  }

  markerTarget() {
    const m = this.current();
    if (!this.active || !m) return null;
    const s = m.steps[this.step];
    return s && s.target ? s.target : null;
  }

  onEvent(name) {
    if (!this.active) return;
    const m = this.current();
    if (!m) return;
    const s = m.steps[this.step];
    if (s && s.kind === 'steal' && name === 'steal') {
      this._advance();
    }
  }

  _advance() {
    const m = this.current();
    if (!m) return;
    this.step += 1;
    if (this.step >= m.steps.length) {
      this._complete(m);
    } else {
      this._beginStep();
    }
  }

  _complete(m) {
    const p = this.game.player;
    p.cash += m.pay;
    p.totalEarned += m.pay;
    this.game.sound.missionDone();
    this.game.hud.showDialogue(m.outro, 'Vera Solano');
    this.game.hud.toast(`JOB DONE — ${m.name} paid $${m.pay.toLocaleString()}`);
    this.game.save();
    if (this.index + 1 >= MISSIONS.length) {
      this.active = false;
      this.done = true;
      this.timer = 0;
      this.game.storyComplete();
      return;
    }
    this._startMission(this.index + 1);
  }

  update(dt) {
    if (!this.active) return;
    const m = this.current();
    if (!m) return;
    const p = this.game.player;
    // A timed delivery counts down; running out restarts the step.
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        const s = m.steps[this.step];
        this._beginStep();
        this.game.hud.showDialogue('Vera: Too slow. Take a breath — the job is still yours, go again.', 'Vera Solano');
        return;
      }
    }
    // Resolve chained step completions (a step whose target is already met).
    for (let guard = 0; guard < 3; guard += 1) {
      const step = m.steps[this.step];
      if (!step) return;
      if (step.kind === 'goto' || step.kind === 'deliver') {
        if (!step.target) return;
        const d = Math.hypot(p.x - step.target.x, p.y - step.target.y);
        if (d < 46) {
          this._advance();
          if (!this.active || this.current() !== m) return;
          continue;
        }
      }
      return;
    }
  }
}
