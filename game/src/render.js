// Solstice City — drawing only: the camera, the pre-rendered city, cars,
// people, bullets, particles and the mission marker. No rules in here.
import { CFG, PAL } from './config.js';
import { clamp, lerp } from './random.js';
import { WORLD_W, WORLD_H } from './city.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  follow(tx, ty, dt, vw, vh) {
    const k = 1 - Math.pow(0.001, dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this.x = clamp(this.x, vw / 2 / this.zoom, WORLD_W - vw / 2 / this.zoom);
    this.y = clamp(this.y, vh / 2 / this.zoom, WORLD_H - vh / 2 / this.zoom);
  }

  snap(tx, ty, vw, vh) {
    this.x = clamp(tx, vw / 2 / this.zoom, WORLD_W - vw / 2 / this.zoom);
    this.y = clamp(ty, vh / 2 / this.zoom, WORLD_H - vh / 2 / this.zoom);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function drawCar(c, car, time) {
  const L = CFG.CAR_LENGTH;
  const W = CFG.CAR_WIDTH;
  c.save();
  c.translate(car.x, car.y);
  c.rotate(car.angle);
  // Shadow.
  c.fillStyle = 'rgba(20,16,10,0.30)';
  roundRect(c, -L / 2 + 4, -W / 2 + 5, L, W, 8);
  c.fill();
  // Body.
  const isPolice = car.type === 'police';
  c.fillStyle = isPolice ? PAL.policeWhite : car.color;
  roundRect(c, -L / 2, -W / 2, L, W, 8);
  c.fill();
  if (isPolice) {
    c.fillStyle = PAL.policeBlack;
    c.fillRect(-L / 2 + 4, -W / 2, 10, W);
    c.fillRect(L / 2 - 14, -W / 2, 10, W);
  }
  // Roof and windshield.
  c.fillStyle = isPolice ? '#dfe6ec' : 'rgba(0,0,0,0.28)';
  roundRect(c, -L / 2 + 12, -W / 2 + 4, L - 26, W - 8, 5);
  c.fill();
  c.fillStyle = 'rgba(180,220,240,0.85)';
  c.fillRect(L / 2 - 14, -W / 2 + 5, 5, W - 10);
  // Headlights.
  c.fillStyle = '#ffe9a8';
  c.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
  c.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
  // Taillights.
  c.fillStyle = '#c23b2e';
  c.fillRect(-L / 2 + 1, -W / 2 + 3, 3, 5);
  c.fillRect(-L / 2 + 1, W / 2 - 8, 3, 5);
  if (isPolice) {
    // Flashing light bar.
    const phase = Math.floor(time * 4 + car.sirenPhase) % 2 === 0;
    c.fillStyle = phase ? '#e5382e' : '#2e6fe8';
    c.fillRect(-6, -W / 2 + 2, 12, 6);
    c.fillStyle = phase ? '#2e6fe8' : '#e5382e';
    c.fillRect(-6, W / 2 - 8, 12, 6);
  }
  if (car.smoke > 0) {
    c.fillStyle = 'rgba(90,90,90,0.5)';
    c.beginPath();
    c.arc(-L / 2 + 4, 0, 8 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  if (car.wreck) {
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = '#22262e';
    c.beginPath();
    c.arc(car.x, car.y, 20, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

export function drawPerson(c, x, y, angle, shirt, skin, walkPhase, isPlayer) {
  c.save();
  c.translate(x, y);
  // Shadow.
  c.fillStyle = 'rgba(20,16,10,0.28)';
  c.beginPath();
  c.ellipse(2, 4, 10, 7, 0, 0, Math.PI * 2);
  c.fill();
  const bob = Math.sin(walkPhase) * 1.5;
  // Legs (two small dots that swing while walking).
  c.fillStyle = '#2b2f38';
  c.beginPath();
  c.arc(-Math.cos(angle) * 4 + Math.sin(walkPhase) * 3, -Math.sin(angle) * 4 + bob, 3, 0, Math.PI * 2);
  c.arc(-Math.cos(angle) * 4 - Math.sin(walkPhase) * 3, -Math.sin(angle) * 4 - bob, 3, 0, Math.PI * 2);
  c.fill();
  // Body.
  c.fillStyle = shirt;
  c.beginPath();
  c.arc(0, 0, 9, 0, Math.PI * 2);
  c.fill();
  if (isPlayer) {
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 11, 0, Math.PI * 2);
    c.stroke();
  }
  // Head.
  c.fillStyle = skin;
  c.beginPath();
  c.arc(Math.cos(angle) * 2, Math.sin(angle) * 2, 5.5, 0, Math.PI * 2);
  c.fill();
  // Facing tick.
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
  c.lineTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
  c.stroke();
  c.restore();
}

export function renderWorld(c, game, camera, time, viewW, viewH) {
  const zoom = camera.zoom;
  const vw = viewW / zoom;
  const vh = viewH / zoom;
  const sx = clamp(camera.x - vw / 2, 0, WORLD_W - vw);
  const sy = clamp(camera.y - vh / 2, 0, WORLD_H - vh);
  // The static city, drawn from its pre-rendered canvas.
  c.drawImage(game.cityCanvas, sx, sy, vw, vh, 0, 0, viewW, viewH);
  c.save();
  c.translate(-sx * zoom, -sy * zoom);
  c.scale(zoom, zoom);

  // Skid marks fade out.
  for (const s of game.skids) {
    c.save();
    c.globalAlpha = Math.min(0.5, s.t / 5 * 0.5);
    c.strokeStyle = '#1d2126';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(s.x - Math.cos(s.angle) * 18, s.y - Math.sin(s.angle) * 18);
    c.lineTo(s.x + Math.cos(s.angle) * 18, s.y + Math.sin(s.angle) * 18);
    c.stroke();
    c.restore();
  }

  // Cash drops.
  for (const d of game.missions.drops) {
    if (d.taken) continue;
    const pulse = 1 + Math.sin(time * 5) * 0.12;
    c.save();
    c.translate(d.x, d.y);
    c.scale(pulse, pulse);
    c.fillStyle = '#2e7d32';
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e8b73a';
    c.font = 'bold 15px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('$', 0, 1);
    c.restore();
  }

  // Mission marker: a pulsing ring with a bouncing arrow.
  const marker = game.missions.marker();
  if (marker) {
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    c.save();
    c.translate(marker.x, marker.y);
    c.strokeStyle = '#ffd23e';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#ffd23e';
    const bob = Math.sin(time * 4) * 5;
    c.beginPath();
    c.moveTo(0, -52 + bob);
    c.lineTo(-10, -70 + bob);
    c.lineTo(10, -70 + bob);
    c.closePath();
    c.fill();
    c.restore();
  }

  // Cars: wrecks first, then the rest, player car last.
  const cars = [...game.cars].sort((a, b) => (a === game.player.inCar ? 1 : 0) - (b === game.player.inCar ? 1 : 0));
  for (const car of cars) drawCar(c, car, time);
  // The courier van gets a marker ring of its own while it runs.
  if (game.missions.van && !game.missions.van.wreck && game.missions.index === 3 && game.missions.step === 0) {
    c.save();
    c.strokeStyle = '#ff5a3c';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(game.missions.van.x, game.missions.van.y, 34 + Math.sin(time * 5) * 3, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  // Pedestrians.
  for (const ped of game.peds) {
    if (ped.down) {
      c.save();
      c.translate(ped.x, ped.y);
      c.rotate(ped.angle);
      c.fillStyle = 'rgba(20,16,10,0.3)';
      c.beginPath();
      c.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = ped.shirt;
      c.beginPath();
      c.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else {
      drawPerson(c, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, false);
    }
  }

  // The player on foot.
  const p = game.player;
  if (!p.driving) {
    drawPerson(c, p.x, p.y, p.angle, PAL.playerJacket, '#e8b98a', p.speed > 0 ? time * 10 : 0, true);
  }

  // Bullets.
  c.fillStyle = '#ffe9a8';
  for (const b of game.bullets) {
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.angle);
    c.fillRect(-6, -1.5, 12, 3);
    c.restore();
  }

  // Particles.
  for (const pt of game.particles) {
    if (pt.kind === 'smoke') {
      c.save();
      c.globalAlpha = Math.max(0, pt.t / 0.7) * 0.55;
      c.fillStyle = '#5a5a5a';
      c.beginPath();
      c.arc(pt.x, pt.y, 10 + (0.7 - pt.t) * 22, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (pt.kind === 'flash') {
      c.save();
      c.globalAlpha = Math.max(0, pt.t / 0.08);
      c.fillStyle = '#ffe9a8';
      c.beginPath();
      c.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (pt.kind === 'explosion') {
      c.save();
      c.globalAlpha = Math.max(0, pt.t / 0.6);
      c.fillStyle = '#ff7a2e';
      c.beginPath();
      c.arc(pt.x, pt.y, 14 + (0.6 - pt.t) * 40, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffd23e';
      c.beginPath();
      c.arc(pt.x, pt.y, 8 + (0.6 - pt.t) * 20, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
  c.restore();

  // Screen-edge arrow to an off-screen mission marker.
  if (marker) {
    const mx = (marker.x - sx) * zoom;
    const my = (marker.y - sy) * zoom;
    if (mx < 0 || mx > viewW || my < 0 || my > viewH) {
      const cx = viewW / 2;
      const cy = viewH / 2;
      const angle = Math.atan2(my - cy, mx - cx);
      const ex = cx + Math.cos(angle) * (Math.min(viewW, viewH) / 2 - 60);
      const ey = cy + Math.sin(angle) * (Math.min(viewW, viewH) / 2 - 60);
      const dist = Math.round(Math.hypot(marker.x - p.x, marker.y - p.y));
      c.save();
      c.translate(ex, ey);
      c.rotate(angle);
      c.fillStyle = '#ffd23e';
      c.beginPath();
      c.moveTo(16, 0);
      c.lineTo(-10, -11);
      c.lineTo(-10, 11);
      c.closePath();
      c.fill();
      c.restore();
      c.save();
      c.fillStyle = '#ffd23e';
      c.font = 'bold 13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(`${marker.label} · ${dist}m`, ex, ey + 28);
      c.restore();
    }
  }
}
