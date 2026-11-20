// Solstice City v4 — the HUD. Minimap, cash and reputation, wanted stars,
// health, a big speedometer with a gear readout, the objective and mission
// stage, the SCPD Response panel, the Solstice FM 88.1 radio strip, Vera's
// dialogue bar, toasts, and the title / pause / busted / wasted / complete
// screens. All DOM, all dusk.

import { RADIO, REPUTATION } from './config.js';
import { reputationTitle } from './player.js';
import { policeUnits } from './police.js';

const MAP_SIZE = 200;
const MAP_HALF = 2100;

function $(id) {
  return document.getElementById(id);
}

export function initHUD(g) {
  g.hud = {
    dialogueTimer: null,
    toastCount: 0,
    setObjective(text) {
      const el = $('hud-objective');
      if (el) el.textContent = text;
    },
    setStage(n) {
      const el = $('hud-stage');
      if (el) el.textContent = `STAGE ${Math.min(n, 7)}/7`;
    },
    setRadio(name) {
      const el = $('hud-radio-track');
      if (el) el.textContent = name;
    },
    setDialogue(speaker, text) {
      const bar = $('hud-dialogue');
      const who = $('hud-dialogue-who');
      const what = $('hud-dialogue-text');
      if (!bar || !who || !what) return;
      who.textContent = speaker;
      what.textContent = text;
      bar.classList.remove('hidden');
      if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
      this.dialogueTimer = setTimeout(() => bar.classList.add('hidden'), 7000);
    },
    toast(msg, ms = 2500) {
      const box = $('hud-toasts');
      if (!box) return;
      const div = document.createElement('div');
      div.className = 'toast';
      div.textContent = msg;
      box.appendChild(div);
      this.toastCount += 1;
      setTimeout(() => {
        div.classList.add('fade');
        setTimeout(() => div.remove(), 400);
      }, ms);
    },
    showMenu(name) {
      for (const id of ['menu-start', 'menu-pause', 'menu-busted', 'menu-wasted', 'menu-complete']) {
        const el = $(id);
        if (el) el.classList.toggle('hidden', id !== name);
      }
      const hud = $('hud');
      if (hud) hud.classList.toggle('hidden', name === 'menu-start');
    },
    hideMenus() {
      for (const id of ['menu-start', 'menu-pause', 'menu-busted', 'menu-wasted', 'menu-complete']) {
        const el = $(id);
        if (el) el.classList.add('hidden');
      }
      const hud = $('hud');
      if (hud) hud.classList.remove('hidden');
    },
  };

  // Buttons.
  const wire = (id, fn) => {
    const el = $(id);
    if (el) el.addEventListener('click', () => {
      g.audio.ensure();
      fn();
    });
  };
  wire('btn-new', () => g.newGame());
  wire('btn-continue', () => g.continueGame());
  wire('btn-resume', () => g.setState('playing'));
  wire('btn-restart', () => g.setState('menu'));
  wire('btn-busted-retry', () => g.respawnAfterBusted());
  wire('btn-busted-menu', () => g.setState('menu'));
  wire('btn-wasted-retry', () => g.respawnAfterWasted());
  wire('btn-wasted-menu', () => g.setState('menu'));
  wire('btn-complete-roam', () => g.setState('playing'));
  wire('btn-complete-menu', () => g.setState('menu'));

  // Continue is only offered when a save exists.
  const save = g.loadSaveData();
  const cont = $('btn-continue');
  if (cont && !save) cont.classList.add('hidden');
  const note = $('save-note');
  if (note && save) note.textContent = `Save found — $${save.cash}, ${save.missionName || 'on the streets'}.`;

  g.hud.setRadio(RADIO[0].name);
}

function drawMinimap(g) {
  const cv = $('minimap');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = MAP_SIZE;
  const toPx = (x) => ((x + MAP_HALF) / (MAP_HALF * 2)) * S;
  ctx.clearRect(0, 0, S, S);
  // Dusk-tinted map background.
  ctx.fillStyle = '#1a0f2a';
  ctx.fillRect(0, 0, S, S);
  // Bay and beach along the bottom.
  ctx.fillStyle = '#1e4d6b';
  ctx.fillRect(0, toPx(1990), S, S - toPx(1990));
  ctx.fillStyle = '#d9a86c';
  ctx.fillRect(0, toPx(1856), S, toPx(1990) - toPx(1856));
  // Roads.
  ctx.strokeStyle = '#4a4a55';
  ctx.lineWidth = 2;
  for (let k = -6; k <= 6; k++) {
    const line = toPx(k * 304);
    ctx.beginPath();
    ctx.moveTo(line, 0);
    ctx.lineTo(line, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, line);
    ctx.lineTo(S, line);
    ctx.stroke();
  }
  // Runway.
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(toPx(1250), toPx(862), toPx(1824) - toPx(1250), toPx(962) - toPx(862));
  // Buildings.
  ctx.fillStyle = '#3a3a4a';
  for (const b of g.city.buildings) {
    ctx.fillRect(toPx(b.x), toPx(b.y), Math.max(1, (b.w / (MAP_HALF * 2)) * S), Math.max(1, (b.h / (MAP_HALF * 2)) * S));
  }
  // Plaza fountain.
  ctx.fillStyle = '#8a7f8c';
  ctx.beginPath();
  ctx.arc(toPx(-152), toPx(-456), 4, 0, Math.PI * 2);
  ctx.fill();
  // Cash stashes.
  ctx.fillStyle = '#2aff5e';
  for (const s of g.stashes) {
    if (s.taken) continue;
    ctx.fillRect(toPx(s.x) - 2, toPx(s.y) - 2, 4, 4);
  }
  // Mission target.
  const target = g.missions.target();
  if (target) {
    const x = toPx(target.x);
    const y = toPx(target.y);
    const pulse = 5 + Math.sin(g.time * 4) * 1.5;
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.moveTo(x, y - pulse);
    ctx.lineTo(x + pulse, y);
    ctx.lineTo(x, y + pulse);
    ctx.lineTo(x - pulse, y);
    ctx.closePath();
    ctx.fill();
  }
  // Police.
  ctx.fillStyle = '#ff2a2a';
  for (const car of g.cars) {
    if (car.driver !== 'police') continue;
    ctx.fillRect(toPx(car.x) - 2, toPx(car.y) - 2, 4, 4);
  }
  // The player, a white arrow pointing along the heading.
  const p = g.player;
  const px = toPx(p.x);
  const py = toPx(p.y);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(p.heading) * 7, py + Math.sin(p.heading) * 7);
  ctx.stroke();
}

export function updateHUD(g, dt) {
  const p = g.player;
  // Cash, reputation, stage.
  const cashEl = $('hud-cash');
  if (cashEl) cashEl.textContent = `$${p.cash.toLocaleString('en-US')}`;
  const repEl = $('hud-rep');
  if (repEl) repEl.textContent = reputationTitle(p.totalEarned);
  // Wanted stars.
  const wantedEl = $('hud-wanted');
  if (wantedEl) wantedEl.textContent = '★'.repeat(p.wanted) + '☆'.repeat(5 - p.wanted);
  // Health bar.
  const healthEl = $('hud-health-fill');
  if (healthEl) healthEl.style.width = `${Math.max(0, p.health)}%`;
  // Speed and gear.
  const speedEl = $('hud-speed');
  if (speedEl) {
    if (p.driving && p.inCar) {
      speedEl.textContent = `${Math.round(Math.abs(p.inCar.speed) * 0.9)} km/h`;
    } else {
      speedEl.textContent = `${Math.round(p.speed * 0.06)} km/h`;
    }
  }
  const gearEl = $('hud-gear');
  if (gearEl) {
    if (!p.driving || !p.inCar) {
      gearEl.textContent = 'N';
    } else {
      const s = Math.abs(p.inCar.speed);
      gearEl.textContent = s < 60 ? 'G1' : s < 120 ? 'G2' : s < 180 ? 'G3' : s < 240 ? 'G4' : 'G5';
    }
  }
  // In-game clock: dusk, advancing one minute every two seconds.
  const clockEl = $('hud-clock');
  if (clockEl) {
    const mins = 18 * 60 + 24 + Math.floor(g.time / 2);
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  // SCPD Response panel.
  const panel = $('hud-scpd-list');
  if (panel) {
    const units = policeUnits(g);
    if (units.length === 0) {
      panel.innerHTML = '<div class="scpd-row quiet">No units in pursuit</div>';
    } else {
      panel.innerHTML = units.slice(0, 7).map((u) => {
        const dist = u.status === 'AIRBORNE' ? '' : ` · ${u.dist}m`;
        return `<div class="scpd-row"><span>${u.callsign}</span><span>${u.status}${dist}</span></div>`;
      }).join('');
    }
  }
  // Taxi fare countdown.
  const fareEl = $('hud-fare');
  if (fareEl) {
    if (p.fare) {
      fareEl.classList.remove('hidden');
      fareEl.textContent = `FARE $${p.fare.amount} — ${Math.ceil(p.fare.timer)}s`;
    } else {
      fareEl.classList.add('hidden');
    }
  }
  // Mission timer.
  const timerEl = $('hud-timer');
  if (timerEl) {
    if (g.missions.timer !== null && g.missions.timer !== undefined) {
      timerEl.classList.remove('hidden');
      timerEl.textContent = `${Math.ceil(g.missions.timer)}s`;
    } else {
      timerEl.classList.add('hidden');
    }
  }
  drawMinimap(g);
}
