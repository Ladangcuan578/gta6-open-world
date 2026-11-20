// Solstice City v3 — Rico Marín. On foot he walks, runs from nothing, and
// shoots where the mouse points. In a car he is the car: his position follows
// it, and the camera chases it. Stealing raises the wanted level; a police
// cruiser costs two stars. A taxi can be hailed with T for a fare.

import {
  WORLD, WALK_SPEED, TAXI_FARE_MIN, TAXI_FARE_MAX, WANTED_DECAY_SECONDS,
} from './config.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.health = 100;
    this.cash = 0;
    this.totalEarned = 0;
    this.wanted = 0;
    this.driving = false;
    this.inCar = null;
    this.riding = null;
    this.lastCrimeT = -999;
    this.lastHurtT = -999;
    this.fireCooldown = 0;
    this.speed = 0;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.health = 100;
    this.cash = 0;
    this.totalEarned = 0;
    this.wanted = 0;
    this.driving = false;
    this.inCar = null;
    this.riding = null;
    this.lastCrimeT = -999;
    this.speed = 0;
  }

  addWanted(n) {
    if (n <= 0) return;
    const before = this.wanted;
    this.wanted = Math.min(5, this.wanted + n);
    this.lastCrimeT = this.game.time;
    if (this.wanted > before) this.game.sound.wantedUp();
  }

  takeDamage(n) {
    if (this.game.state !== 'playing') return;
    this.health -= n;
    this.lastHurtT = this.game.time;
    if (this.health <= 0) {
      this.health = 0;
      this.game.wasted();
    }
  }

  _moveOnFoot(dt) {
    const input = this.game.input;
    // WASD moves relative to where Rico faces, and his facing stays put
    // while he walks: W forward, S back, A/D strafe. He only turns when he
    // shoots, or when he gets in a car. (Turning with the movement made
    // the camera chase its own tail and the walk went nowhere.)
    const fx = Math.sin(this.angle), fy = -Math.cos(this.angle);
    const rx = Math.cos(this.angle), ry = Math.sin(this.angle);
    let mx = 0, my = 0;
    if (input.forward) { mx += fx; my += fy; }
    if (input.back) { mx -= fx; my -= fy; }
    if (input.right) { mx += rx; my += ry; }
    if (input.left) { mx -= rx; my -= ry; }
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      mx /= len; my /= len;
      this.speed = WALK_SPEED;
      const sprint = input.handbrake ? 1.45 : 1;
      const nx = this.x + mx * WALK_SPEED * sprint * dt;
      const ny = this.y + my * WALK_SPEED * sprint * dt;
      // Move axis by axis so walls slide instead of stopping the player.
      if (!this.game.city.pointInBuilding(nx, this.y, 1.4)) this.x = nx;
      if (!this.game.city.pointInBuilding(this.x, ny, 1.4)) this.y = ny;
    } else {
      this.speed = 0;
    }
    this.x = Math.max(24, Math.min(WORLD - 24, this.x));
    this.y = Math.max(24, Math.min(WORLD - 24, this.y));
  }

  tryEnterCar() {
    if (this.driving || this.riding) return false;
    let best = null;
    let bestD = 64;
    for (const car of this.game.cars) {
      if (car.wreck) continue;
      const d = Math.hypot(car.x - this.x, car.y - this.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return false;
    const wasDriver = best.driver;
    if (wasDriver === 'traffic') {
      this.game.peds.bailDriver(best);
      this.addWanted(1);
    } else if (wasDriver === 'police') {
      this.addWanted(2);
    }
    if (best.roadblock) {
      best.roadblock = false;
      const i = this.game.police.roadblocks.indexOf(best);
      if (i !== -1) this.game.police.roadblocks.splice(i, 1);
    }
    best.driver = 'player';
    best.mode = 'player';
    this.driving = true;
    this.inCar = best;
    this.x = best.x;
    this.y = best.y;
    this.angle = best.angle;
    this.game.missions.onEvent('steal');
    this.game.sound.click();
    return true;
  }

  exitCar() {
    if (!this.driving || !this.inCar) return false;
    const car = this.inCar;
    car.driver = null;
    car.mode = 'traffic';
    this.game.police.exitGrace = 1.5;
    // Step out on the side that is not inside a wall.
    const px = Math.cos(car.angle), py = Math.sin(car.angle);
    const sides = [
      { x: car.x + px * 6, y: car.y + py * 6 },
      { x: car.x - px * 6, y: car.y - py * 6 },
    ];
    const spot = sides.find((s) => !this.game.city.pointInBuilding(s.x, s.y, 2)) || sides[0];
    this.x = spot.x;
    this.y = spot.y;
    this.angle = car.angle;
    this.driving = false;
    this.inCar = null;
    this.game.sound.click();
    return true;
  }

  hailTaxi() {
    if (this.driving || this.riding) return false;
    let best = null;
    let bestD = 48;
    for (const car of this.game.cars) {
      if (car.type !== 'taxi' || car.wreck || car.driver !== 'traffic') continue;
      const d = Math.hypot(car.x - this.x, car.y - this.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return false;
    const fare = this.game.rng.int(TAXI_FARE_MIN, TAXI_FARE_MAX);
    if (this.cash < fare) {
      this.game.hud.showDialogue('Rico: Not enough cash for a cab. I need to earn first.', 'Rico Marín');
      return false;
    }
    const target = this.game.city.randomRoadPoint(this.game.rng);
    best.driver = 'taxi-ride';
    best.mode = 'ride';
    best.rideTarget = target;
    this.riding = { taxi: best, fare, target };
    this.game.hud.showDialogue(`Driver: Where to? That will be $${fare}. Sit back, pal.`, 'Cabbie');
    return true;
  }

  endRide() {
    if (!this.riding) return;
    const { taxi, fare } = this.riding;
    this.cash = Math.max(0, this.cash - fare);
    this.riding = null;
    taxi.driver = null;
    taxi.mode = 'traffic';
    taxi.speed = 0;
    const px = Math.cos(taxi.angle), py = Math.sin(taxi.angle);
    this.x = taxi.x + px * 6;
    this.y = taxi.y + py * 6;
    this.game.hud.toast(`TAXI — arrived, $${fare} fare`);
    this.game.save();
  }

  shoot(aimX, aimY) {
    if (this.fireCooldown > 0 || this.game.state !== 'playing') return false;
    this.fireCooldown = 0.18;
    const ox = this.driving && this.inCar ? this.inCar.x : this.x;
    const oy = this.driving && this.inCar ? this.inCar.y : this.y;
    const dx = aimX - ox, dy = aimY - oy;
    const d = Math.hypot(dx, dy);
    if (d < 1) return false;
    this.angle = Math.atan2(dx, -dy);
    const speed = 950;
    this.game.bullets.push({
      x: ox + (dx / d) * 4, y: oy + (dy / d) * 4,
      vx: (dx / d) * speed, vy: (dy / d) * speed,
      life: 0.85, damage: 34,
    });
    this.game.sound.shot();
    return true;
  }

  update(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    // Wanted fades slowly when the player stays clean.
    if (this.wanted > 0 && this.game.time - this.lastCrimeT > WANTED_DECAY_SECONDS) {
      this.wanted -= 1;
      this.lastCrimeT = this.game.time;
    }
    // A little health comes back while the heat is off.
    if (this.wanted === 0 && this.health > 0 && this.health < 100
      && this.game.time - this.lastHurtT > 5) {
      this.health = Math.min(100, this.health + 2 * dt);
    }
    if (this.riding) {
      const t = this.riding.taxi;
      this.x = t.x;
      this.y = t.y;
      this.angle = t.angle;
      return;
    }
    if (this.driving && this.inCar) {
      this.x = this.inCar.x;
      this.y = this.inCar.y;
      this.angle = this.inCar.angle;
      return;
    }
    this._moveOnFoot(dt);
    // Cash stashes: walk over one and it is yours.
    for (const s of this.game.city.stashes) {
      if (s.taken) continue;
      if (Math.hypot(this.x - s.x, this.y - s.y) < 30) {
        s.taken = true;
        s.timer = 60;
        this.cash += 100;
        this.totalEarned += 100;
        this.game.sound.pickup();
        this.game.hud.toast('CASH STASH — +$100');
        this.game.save();
      }
    }
  }
}
