// Solstice City — the player: Rico Marín, on foot and behind the wheel.
// Walking, stealing and driving cars, shooting, the wanted level, and the
// bust/wasted rules. The game loop calls update() and reads the events it sets.
import { CFG } from './config.js';
import { clamp, angleDiff, dist2 } from './random.js';
import { WORLD_W, WORLD_H, resolveBuildingCollision, isWater } from './city.js';
import { stepCar, damageCar } from './vehicles.js';
import { scarePeds } from './pedestrians.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.speed = 0;
    this.health = CFG.PLAYER_HEALTH;
    this.cash = 0;
    this.wanted = 0;
    this.inCar = null; // the car object, or null when on foot
    this.fireCooldown = 0;
    this.bustTimer = 0;
    this.lastCrimeAt = -99;
    this.lastShotCrimeAt = -99;
    this.elapsed = 0;
    this.skid = false;
  }

  get driving() {
    return this.inCar !== null;
  }

  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, CFG.WANTED_MAX);
    this.lastCrimeAt = this.elapsed;
  }

  takeDamage(n) {
    this.health = Math.max(0, this.health - n);
  }

  // Find the nearest car the player can get into.
  nearestCar(cars, maxDist = 58) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of cars) {
      if (car.wreck) continue;
      const d = dist2(this.x, this.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  enterCar(car, game) {
    if (car.driver === 'traffic') {
      // Stealing: the driver bails out and runs, and the law notices.
      const ped = game.spawnFleeingDriver(car);
      if (ped) game.peds.push(ped);
      this.addWanted(1);
      game.toast('Car stolen — the cops noticed! (+1 wanted)');
      game.audio.enterCar();
    } else if (car.driver === 'police') {
      this.addWanted(2);
      game.toast('You stole a police car! (+2 wanted)');
      game.audio.enterCar();
    } else {
      game.audio.enterCar();
    }
    car.driver = 'player';
    this.inCar = car;
    this.x = car.x;
    this.y = car.y;
    this.angle = car.angle;
  }

  exitCar(game) {
    const car = this.inCar;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    // Step out beside the car, on the driver's side.
    const side = this.angle + Math.PI / 2;
    this.x = car.x + Math.cos(side) * 30;
    this.y = car.y + Math.sin(side) * 30;
    resolveBuildingCollision(game.city, this, CFG.PLAYER_RADIUS);
    this.inCar = null;
    this.angle = car.angle;
  }

  shoot(game, worldX, worldY) {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = CFG.FIRE_COOLDOWN;
    const ox = this.inCar ? this.inCar.x : this.x;
    const oy = this.inCar ? this.inCar.y : this.y;
    const angle = Math.atan2(worldY - oy, worldX - ox);
    game.bullets.push({
      x: ox + Math.cos(angle) * 26,
      y: oy + Math.sin(angle) * 26,
      angle,
      travelled: 0,
    });
    game.audio.shoot();
    game.particles.push({ kind: 'flash', x: ox + Math.cos(angle) * 30, y: oy + Math.sin(angle) * 30, t: 0.08 });
    scarePeds(game.peds, ox, oy, 220);
    if (this.elapsed - this.lastShotCrimeAt > 2) {
      this.lastShotCrimeAt = this.elapsed;
      this.addWanted(1);
    }
  }

  update(dt, game) {
    this.elapsed += dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    const input = game.input;

    if (this.driving) {
      const car = this.inCar;
      const fwd = input.down('KeyW', 'ArrowUp') ? 1 : 0;
      const back = input.down('KeyS', 'ArrowDown') ? 1 : 0;
      const left = input.down('KeyA', 'ArrowLeft') ? 1 : 0;
      const right = input.down('KeyD', 'ArrowRight') ? 1 : 0;
      const handbrake = input.down('ShiftLeft', 'ShiftRight');
      const drive = {
        throttle: fwd - back * 0.6,
        brake: back && car.speed > 10,
        steer: (left ? -1 : 0) + (right ? 1 : 0),
      };
      // L toggles the headlights; the car remembers the choice so the
      // renderer can light the road ahead of the player's car.
      car.headlights = input.lightsOn;
      const before = car.speed;
      const hit = stepCar(car, dt, drive, game.city);
      if (handbrake && Math.abs(car.speed) > 120) {
        car.speed -= car.speed * 1.6 * dt;
        this.skid = true;
        game.audio.skid();
        game.skids.push({ x: car.x, y: car.y, angle: car.angle, t: 5 });
      } else {
        this.skid = false;
      }
      if (hit && Math.abs(before) > 200) {
        game.audio.crash();
        damageCar(car, 8);
        game.particles.push({ kind: 'smoke', x: car.x, y: car.y, t: 0.7 });
      }
      // Running over pedestrians is a crime — and they notice.
      for (const ped of game.peds) {
        if (ped.down) continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && Math.abs(car.speed) > 60) {
          ped.down = true;
          ped.downTimer = 4;
          this.addWanted(1);
          game.toast('You hit a pedestrian! (+1 wanted)');
          game.audio.crash();
          scarePeds(game.peds, car.x, car.y, 200);
        }
      }
      // Ramming a police car is a crime too.
      for (const pc of game.cars) {
        if (pc.driver !== 'police' || pc.wreck || pc === car) continue;
        if (Math.hypot(pc.x - car.x, pc.y - car.y) < 40 && Math.abs(car.speed) > 120) {
          if (this.elapsed - this.lastCrimeAt > 2) this.addWanted(1);
          damageCar(pc, 14);
          damageCar(car, 10);
          game.audio.crash();
        }
      }
      this.x = car.x;
      this.y = car.y;
      this.angle = car.angle;
      this.speed = car.speed;
      if (car.wreck) {
        // The car blew up under you: out on foot, singed.
        this.inCar = null;
        this.takeDamage(25);
        game.toast('Your car is wrecked!');
        game.audio.crash();
      }
      game.audio.engine(Math.abs(car.speed) / car.spec.maxSpeed, true);
    } else {
      // On foot.
      let mx = 0;
      let my = 0;
      if (input.down('KeyW', 'ArrowUp')) my -= 1;
      if (input.down('KeyS', 'ArrowDown')) my += 1;
      if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
      if (input.down('KeyD', 'ArrowRight')) mx += 1;
      const sprint = input.down('ShiftLeft', 'ShiftRight');
      const speed = sprint ? CFG.SPRINT_SPEED : CFG.WALK_SPEED;
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        this.x += (mx / len) * speed * dt;
        this.y += (my / len) * speed * dt;
        this.angle = Math.atan2(my, mx);
        this.speed = speed;
      } else {
        this.speed = 0;
      }
      resolveBuildingCollision(game.city, this, CFG.PLAYER_RADIUS);
      if (isWater(this.x, this.y)) this.y = WORLD_W + CFG.BEACH - 4;
      game.audio.engine(0, false);
    }

    // Wanted cools down when the player lies low.
    if (this.wanted > 0 && this.elapsed - this.lastCrimeAt > CFG.WANTED_DECAY_IDLE) {
      this.coolTimer = (this.coolTimer || 0) + dt;
      if (this.coolTimer >= CFG.WANTED_DECAY_STEP) {
        this.coolTimer = 0;
        this.wanted -= 1;
      }
    } else {
      this.coolTimer = 0;
    }

    // Busted: a police car sitting on the on-foot player.
    if (!this.driving) {
      let touching = false;
      for (const pc of game.cars) {
        if (pc.driver === 'police' && !pc.wreck && Math.hypot(pc.x - this.x, pc.y - this.y) < 34) {
          touching = true;
          break;
        }
      }
      if (touching) {
        this.bustTimer += dt;
        if (this.bustTimer > 1.4) game.events.busted = true;
      } else {
        this.bustTimer = 0;
      }
    } else {
      this.bustTimer = 0;
    }

    if (this.health <= 0) game.events.wasted = true;
    if (this.y > WORLD_H - 4) this.y = WORLD_H - 4;
  }
}
