// Solstice City v3 — the HUD. Everything the player reads lives in the DOM:
// cash and reputation, the wanted stars, health, the objective, a big
// speedometer with a gear, the SCPD response panel, the radio strip, Vera's
// dialogue bar, the minimap, and the menu screens. The play-test reads the
// same elements, so their ids are part of the game's contract.

import { TRACKS, titleFor } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.dialogueT = 0;
    this.toastT = 0;
    this.minimapT = 0;
    this._cache();
  }

  _cache() {
    this.el = {
      hud: $('hud'),
      cash: $('hud-cash'),
      title: $('hud-title'),
      clock: $('hud-clock'),
      wanted: $('hud-wanted'),
      healthFill: $('hud-health-fill'),
      objective: $('hud-objective'),
      stage: $('hud-stage'),
      speed: $('hud-speed'),
      gear: $('hud-gear'),
      radio: $('hud-radio'),
      dialogue: $('hud-dialogue'),
      dialogueWho: $('hud-dialogue-who'),
      dialogueText: $('hud-dialogue-text'),
      scpdList: $('hud-scpd-list'),
      toast: $('hud-toast'),
      minimap: $('minimap'),
    };
    this.mm = this.el.minimap.getContext('2d');
  }

  setScreen(name) {
    for (const id of ['menu-start', 'menu-pause', 'menu-busted', 'menu-wasted', 'menu-complete']) {
      const el = $(id);
      if (el) el.classList.toggle('hidden', id !== `menu-${name}`);
    }
    const inGame = name === 'game';
    this.el.hud.classList.toggle('hidden', !inGame);
    if (inGame) this.el.hud.classList.remove('hidden');
  }

  showDialogue(text, who = 'Vera Solano') {
    this.el.dialogueWho.textContent = who;
    this.el.dialogueText.textContent = text;
    this.el.dialogue.classList.remove('hidden');
    this.dialogueT = 7;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this.toastT = 3.5;
  }

  update(dt) {
    const p = this.game.player;
    const g = this.game;
    this.el.cash.textContent = `$${Math.round(p.cash).toLocaleString()}`;
    this.el.title.textContent = titleFor(p.totalEarned);
    const mins = Math.floor(g.clockMinutes) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.el.clock.textContent = `${hh}:${mm}`;
    this.el.wanted.textContent = '★'.repeat(p.wanted) + '☆'.repeat(5 - p.wanted);
    this.el.wanted.classList.toggle('hot', p.wanted >= 3);
    this.el.healthFill.style.width = `${Math.max(0, p.health)}%`;
    this.el.healthFill.style.background = p.health > 50 ? '#37d67a' : p.health > 25 ? '#ffb13c' : '#ff4d4d';
    const speed = p.driving && p.inCar ? Math.abs(p.inCar.speed) : 0;
    const kmh = Math.round(speed * 0.36);
    this.el.speed.textContent = `${kmh} km/h`;
    const gear = !p.driving ? 'N' : speed < 60 ? 'G1' : speed < 160 ? 'G2' : speed < 280 ? 'G3' : speed < 420 ? 'G4' : 'G5';
    this.el.gear.textContent = gear;
    const m = g.missions.current();
    this.el.objective.textContent = g.missions.objectiveText();
    this.el.stage.textContent = m ? `${g.missions.stageText()} · ${m.name}` : g.missions.stageText();
    this.el.radio.textContent = `SOLSTICE FM 88.1 — ${TRACKS[g.sound.track].title}${g.sound.muted ? ' · MUTED (M)' : ''}`;
    if (this.dialogueT > 0) {
      this.dialogueT -= dt;
      if (this.dialogueT <= 0) this.el.dialogue.classList.add('hidden');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.classList.add('hidden');
    }
    this._updateScpd();
    this.minimapT -= dt;
    if (this.minimapT <= 0) {
      this.minimapT = 0.12;
      this._drawMinimap();
    }
  }

  _updateScpd() {
    const p = this.game.player;
    const cops = this.game.cars.filter((c) => c.driver === 'police' && !c.wreck);
    const lines = [];
    if (this.game.police && this.game.police.heliGroup && this.game.police.heliGroup.visible) {
      lines.push('HELI-1 AIRBORNE');
    }
    cops.slice(0, 4).forEach((c, i) => {
      const d = Math.round(Math.hypot(c.x - p.x, c.y - p.y) / 10);
      const status = c.roadblock ? 'ROADBLOCK' : d < 12 ? 'RAMMING' : 'PURSUIT';
      lines.push(`SCPD-${(i + 1) * 3} · ${d}m · ${status}`);
    });
    if (lines.length === 0) lines.push('SCPD — all quiet');
    const html = lines.map((l) => `<div>${l}</div>`).join('');
    if (this.el.scpdList.innerHTML !== html) this.el.scpdList.innerHTML = html;
  }

  _drawMinimap() {
    const ctx = this.mm;
    const S = 200;
    const k = S / 2400;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, S, S);
    // Water on the east edge.
    ctx.fillStyle = '#2a4a7a';
    ctx.fillRect(190, 0, 10, S);
    // Roads.
    ctx.strokeStyle = '#3d3d4a';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 12; i += 1) {
      const c = i * 200 * k;
      ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(S, c); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, S); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#55556a';
    for (const b of this.game.city.buildings) {
      ctx.fillRect(b.x * k, b.y * k, b.w * k, b.h * k);
    }
    // Park, plaza and runway tints.
    ctx.fillStyle = '#2c5a34';
    ctx.fillRect(440 * k, 840 * k, 360 * k, 360 * k);
    ctx.fillStyle = '#8a7452';
    ctx.fillRect(1020 * k, 1020 * k, 360 * k, 360 * k);
    ctx.fillStyle = '#c2a878';
    ctx.fillRect(2280 * k, 0, 120 * k, S);
    // Cash stashes still on the street.
    ctx.fillStyle = '#37d67a';
    for (const s of this.game.city.stashes) {
      if (!s.taken) ctx.fillRect(s.x * k - 2, s.y * k - 2, 4, 4);
    }
    // Mission marker, pulsing.
    const target = this.game.missions.markerTarget();
    if (target) {
      const pulse = 4 + Math.sin(this.game.time * 5) * 1.5;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(target.x * k, target.y * k - pulse);
      ctx.lineTo(target.x * k + pulse, target.y * k);
      ctx.lineTo(target.x * k, target.y * k + pulse);
      ctx.lineTo(target.x * k - pulse, target.y * k);
      ctx.closePath();
      ctx.fill();
    }
    // Police in red, the player in white with a heading tick.
    ctx.fillStyle = '#ff4d4d';
    for (const c of this.game.cars) {
      if (c.driver !== 'police' || c.wreck) continue;
      ctx.beginPath();
      ctx.arc(c.x * k, c.y * k, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = this.game.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x * k, p.y * k, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x * k, p.y * k);
    ctx.lineTo(p.x * k + Math.sin(p.angle) * 8, p.y * k - Math.cos(p.angle) * 8);
    ctx.stroke();
  }
}
