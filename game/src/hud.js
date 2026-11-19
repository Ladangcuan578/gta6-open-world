// Solstice City — the HUD: cash, health, wanted stars, the objective line,
// the minimap, toasts, and every menu (start, pause, busted, wasted, story).
// The world is canvas; the interface is DOM, so it stays crisp at any size.
import { CFG, RADIO } from './config.js';
import { WORLD_W, WORLD_H } from './city.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      cash: document.getElementById('hud-cash'),
      rep: document.getElementById('hud-rep'),
      healthFill: document.getElementById('hud-health-fill'),
      healthText: document.getElementById('hud-health-text'),
      wanted: document.getElementById('hud-wanted'),
      objective: document.getElementById('hud-objective'),
      missionName: document.getElementById('hud-mission'),
      stage: document.getElementById('hud-stage'),
      speed: document.getElementById('hud-speed'),
      gear: document.getElementById('hud-gear'),
      clock: document.getElementById('hud-clock'),
      policePanel: document.getElementById('hud-police'),
      policeList: document.getElementById('hud-police-list'),
      radio: document.getElementById('hud-radio-track'),
      crew: document.getElementById('hud-crew'),
      crewLine: document.getElementById('hud-crew-line'),
      toast: document.getElementById('toast'),
      brief: document.getElementById('brief'),
      briefTitle: document.getElementById('brief-title'),
      briefText: document.getElementById('brief-text'),
      briefGiver: document.getElementById('brief-giver'),
      start: document.getElementById('menu-start'),
      pause: document.getElementById('menu-pause'),
      end: document.getElementById('menu-end'),
      endTitle: document.getElementById('end-title'),
      endText: document.getElementById('end-text'),
      story: document.getElementById('menu-story'),
      minimap: document.getElementById('minimap'),
    };
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.minimapBase = null;
    this.toastTimer = 0;
    this.briefTimer = 0;
    this._cash = -1;
    this._health = -1;
    this._wanted = -1;
    this._objective = '';
    this._rep = '';
    this._stage = '';
    this._crewLine = '';
    this._radioIdx = -1;
    this._policeAt = 0; // police panel rebuilds at most twice a second
  }

  // Reputation title from lifetime earnings: the progression the player sees.
  repTitle(earned) {
    if (earned >= 6000) return 'Legend of Solstice';
    if (earned >= 3000) return 'King of Solstice';
    if (earned >= 1000) return 'Street Boss';
    return 'Wheelman';
  }

  buildMinimapBase(cityCanvas) {
    const base = document.createElement('canvas');
    base.width = 200;
    base.height = 200;
    const c = base.getContext('2d');
    c.drawImage(cityCanvas, 0, 0, WORLD_W, WORLD_H, 0, 0, 200, 200);
    this.minimapBase = base;
  }

  showOnly(name) {
    for (const key of ['start', 'pause', 'end', 'story']) {
      this.el[key].classList.toggle('hidden', key !== name);
    }
    if (!name) {
      this.el.brief.classList.add('hidden');
    }
  }

  showStart(hasSave) {
    this.showOnly('start');
    document.getElementById('btn-continue').classList.toggle('hidden', !hasSave);
  }

  showPause() {
    this.showOnly('pause');
  }

  showEnd(kind, lostCash) {
    this.showOnly('end');
    this.el.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.el.endTitle.style.color = kind === 'busted' ? '#4fc3f7' : '#e5382e';
    this.el.endText.textContent = kind === 'busted'
      ? `The Solstice City police hauled you in. You lost $${lostCash} in fines and impound fees.`
      : `Rico went down in a hail of gunfire and fenders. You lost $${lostCash}. The city waits for no one.`;
  }

  showStory() {
    this.showOnly('story');
  }

  showBrief(title, text, giver) {
    this.el.briefTitle.textContent = title;
    this.el.briefText.textContent = text;
    this.el.briefGiver.textContent = `— ${giver}`;
    this.el.brief.classList.remove('hidden');
    this.briefTimer = 9;
  }

  toast(message) {
    this.el.toast.textContent = message;
    this.el.toast.classList.remove('hidden');
    this.toastTimer = 3.2;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    if (this.briefTimer > 0) {
      this.briefTimer -= dt;
      if (this.briefTimer <= 0) this.el.brief.classList.add('hidden');
    }
    if (p.cash !== this._cash) {
      this._cash = p.cash;
      this.el.cash.textContent = `$${p.cash.toLocaleString('en-US')}`;
    }
    const rep = this.repTitle(g.totalEarned || 0);
    if (rep !== this._rep) {
      this._rep = rep;
      this.el.rep.textContent = rep;
    }
    const hp = Math.max(0, Math.round(p.health));
    if (hp !== this._health) {
      this._health = hp;
      this.el.healthFill.style.width = `${hp}%`;
      this.el.healthFill.style.background = hp > 50 ? '#3aa655' : hp > 25 ? '#e8b73a' : '#e5382e';
      this.el.healthText.textContent = `${hp}`;
    }
    if (p.wanted !== this._wanted) {
      this._wanted = p.wanted;
      let stars = '';
      for (let i = 0; i < CFG.WANTED_MAX; i += 1) stars += i < p.wanted ? '★' : '☆';
      this.el.wanted.textContent = stars;
      this.el.wanted.style.color = p.wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.45)';
    }
    const obj = g.missions.objectiveText();
    if (obj !== this._objective) {
      this._objective = obj;
      this.el.objective.textContent = obj;
    }
    const m = g.missions.current;
    this.el.missionName.textContent = g.missions.done
      ? 'Story complete'
      : m ? m.name : 'Free roam';
    // Stage line: STAGE 3/7 while a job runs, FREE ROAM otherwise.
    const stage = g.missions.active && !g.missions.done
      ? `STAGE ${g.missions.index + 1}/${g.missions.total}`
      : 'FREE ROAM';
    if (stage !== this._stage) {
      this._stage = stage;
      this.el.stage.textContent = stage;
    }
    // Vera's dialogue bar: the current job's one-line quip, bottom centre.
    const line = m && g.missions.active && !g.missions.done ? m.line : '';
    if (line !== this._crewLine) {
      this._crewLine = line;
      if (line) {
        this.el.crewLine.textContent = line;
        this.el.crew.classList.remove('hidden');
      } else {
        this.el.crew.classList.add('hidden');
      }
    }
    // Radio strip: a new track every 40 seconds of play.
    const trackIdx = Math.floor(g.time / 40) % RADIO.tracks.length;
    if (trackIdx !== this._radioIdx) {
      this._radioIdx = trackIdx;
      this.el.radio.textContent = `${RADIO.station} — ${RADIO.tracks[trackIdx]}`;
    }
    // Police response panel: every active unit, its callsign, its distance
    // in metres, and what it is doing. Rebuilt twice a second at most.
    if (g.time - this._policeAt > 0.5) {
      this._policeAt = g.time;
      const units = g.cars.filter((c) => c.driver === 'police' && !c.wreck);
      const show = p.wanted > 0 || (g.heli && g.heli.active);
      this.el.policePanel.classList.toggle('hidden', !show);
      if (show) {
        let html = '';
        for (const c of units) {
          const dist = Math.round(Math.hypot(c.x - p.x, c.y - p.y) / 10);
          const status = c.roadblock ? 'ROADBLOCK' : c.ramming ? 'RAMMING' : 'PURSUIT';
          const cls = c.roadblock ? 'rb' : c.ramming ? 'ram' : 'pur';
          html += `<div class="pol-row"><span class="pol-name">${c.callsign || 'SCPD'}</span><span class="pol-dist">${dist}m</span><span class="pol-status ${cls}">${status}</span></div>`;
        }
        if (g.heli && g.heli.active) {
          html += '<div class="pol-row"><span class="pol-name">HELI-1</span><span class="pol-dist">—</span><span class="pol-status ram">AIRBORNE</span></div>';
        }
        if (!html) html = '<div class="pol-row"><span class="pol-name">No units on scene</span></div>';
        this.el.policeList.innerHTML = html;
      }
    }
    const speedKmh = p.driving ? Math.round(Math.abs(p.inCar.speed) * 0.36) : 0;
    this.el.speed.textContent = p.driving ? `${speedKmh} km/h` : 'On foot';
    // Gear from speed: 1 at a crawl, 5 flat out.
    this.el.gear.textContent = p.driving
      ? `G${Math.min(5, 1 + Math.floor(Math.abs(p.inCar.speed) / 115))}`
      : '';
    const hours = 8 + Math.floor(g.clock / 3600);
    const mins = Math.floor((g.clock % 3600) / 60);
    this.el.clock.textContent = `${String(hours % 24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.game;
    const c = this.minimapCtx;
    const W = 200;
    const H = 200;
    c.clearRect(0, 0, W, H);
    if (this.minimapBase) c.drawImage(this.minimapBase, 0, 0, W, H);
    // Dusk tint over the minimap so it matches the sunset world.
    c.fillStyle = 'rgba(46, 20, 64, 0.16)';
    c.fillRect(0, 0, W, H);
    const sx = W / WORLD_W;
    const sy = H / WORLD_H;
    const dot = (x, y, r, color) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(x * sx, y * sy, r, 0, Math.PI * 2);
      c.fill();
    };
    for (const car of g.cars) {
      if (car.wreck) continue;
      if (car.driver === 'police') dot(car.x, car.y, 3.5, '#ff3b30');
      else if (car === g.player.inCar) continue;
      else dot(car.x, car.y, 2, 'rgba(255,255,255,0.55)');
    }
    const marker = g.missions.marker();
    if (marker) {
      c.save();
      c.translate(marker.x * sx, marker.y * sy);
      c.fillStyle = '#ffd23e';
      c.beginPath();
      c.moveTo(0, -6);
      c.lineTo(5, 4);
      c.lineTo(-5, 4);
      c.closePath();
      c.fill();
      c.restore();
    }
    // Cash stashes (gold) and the taxi fare (green).
    if (g.stashes) {
      for (const s of g.stashes) {
        if (!s.taken) dot(s.x, s.y, 2.5, '#e8b73a');
      }
    }
    if (g.fare) {
      if (g.fare.state === 'waiting' && g.fare.ped) dot(g.fare.ped.x, g.fare.ped.y, 4, '#3aa655');
      else if (g.fare.state === 'riding' && g.fare.dest) dot(g.fare.dest.x, g.fare.dest.y, 4, '#3aa655');
    }
    // The player: a white triangle pointing where they face.
    const p = g.player;
    c.save();
    c.translate(p.x * sx, p.y * sy);
    c.rotate(p.angle);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#1d2126';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(7, 0);
    c.lineTo(-5, -5);
    c.lineTo(-5, 5);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
