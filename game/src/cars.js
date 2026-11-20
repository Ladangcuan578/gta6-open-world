// Solstice City v3 — cars. A car is one merged body (stepped hood and trunk,
// bumpers, mirrors, a spoiler or a taxi sign), a glass cabin, bright
// headlights and taillights, and four wheels that live in one shared
// InstancedMesh so twenty cars still cost almost nothing to draw. Traffic
// follows the roads and stops at red lights; police chase; the player drives.

import * as THREE from 'three';
import {
  WORLD, PITCH, CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_MAX, CAR_MAX_SPEED,
  SPORT_MAX_SPEED, TRUCK_MAX_SPEED, TRAFFIC_SPEED, POLICE_SPEED,
} from './config.js';
import { MeshBuilder, hexRgb } from './geom.js';
import { toWorld } from './city.js';

export const CAR_TYPES = {
  sedan: { max: CAR_MAX_SPEED, accel: CAR_ACCEL, len: 5.4, colors: [0x8a2a2a, 0x2a4a8a, 0x3a6a3a, 0x888888, 0xc8c8c8] },
  coupe: { max: CAR_MAX_SPEED + 40, accel: CAR_ACCEL + 30, len: 5.0, colors: [0xd8a020, 0x5a2a6a, 0x202020, 0xa02040] },
  taxi: { max: CAR_MAX_SPEED - 30, accel: CAR_ACCEL, len: 5.4, colors: [0xf0c020] },
  truck: { max: TRUCK_MAX_SPEED, accel: CAR_ACCEL - 70, len: 6.4, colors: [0x5a6a7a, 0x8a6a3a, 0x4a5a4a] },
  sport: { max: SPORT_MAX_SPEED, accel: CAR_ACCEL + 90, len: 5.2, colors: [0xd02020, 0x20c8d0, 0xe0e0e0, 0x1a1a22] },
  police: { max: POLICE_SPEED, accel: CAR_ACCEL + 60, len: 5.4, colors: [0x16161e] },
};

export const WHEEL_R = 0.85;

// The car is built facing local +X (its nose). Length runs along X, width
// along Z, up is Y. Stepped hood and trunk sit lower than the cabin.
function buildCarGeometry(type, color) {
  const spec = CAR_TYPES[type];
  const L = spec.len;
  const body = new MeshBuilder();
  const half = L / 2;
  // Main hull, hood and trunk steps, bumpers, mirrors.
  body.pushBox(0, 0.95, 0, L - 0.8, 1.0, 2.3, color, 28);
  body.pushBox(half - 0.7, 0.8, 0, 1.6, 0.7, 2.2, color, 28);
  body.pushBox(-half + 0.7, 0.8, 0, 1.6, 0.7, 2.2, color, 28);
  body.pushBox(half + 0.15, 0.7, 0, 0.5, 0.6, 2.35, 0x22222a, 28);
  body.pushBox(-half - 0.15, 0.7, 0, 0.5, 0.6, 2.35, 0x22222a, 28);
  body.pushBox(0.6, 1.25, 1.2, 0.5, 0.25, 0.25, color, 28);
  body.pushBox(0.6, 1.25, -1.2, 0.5, 0.25, 0.25, color, 28);
  body.pushBox(-0.6, 1.25, 1.2, 0.5, 0.25, 0.25, color, 28);
  body.pushBox(-0.6, 1.25, -1.2, 0.5, 0.25, 0.25, color, 28);
  if (type === 'sport') {
    body.pushBox(-half + 0.1, 1.5, 0, 0.9, 0.12, 2.2, 0x16161e, 28);
    body.pushBox(-half + 0.1, 1.15, 0.9, 0.15, 0.5, 0.15, 0x16161e, 28);
    body.pushBox(-half + 0.1, 1.15, -0.9, 0.15, 0.5, 0.15, 0x16161e, 28);
  }
  if (type === 'taxi') {
    body.pushBox(0, 2.05, 0, 1.1, 0.4, 0.6, 0xf0c020, 28);
  }
  if (type === 'police') {
    // White doors and a light bar, so a cruiser reads at a glance.
    body.pushBox(0, 0.95, 1.16, 2.6, 0.9, 0.06, 0xe8e8e8, 28);
    body.pushBox(0, 0.95, -1.16, 2.6, 0.9, 0.06, 0xe8e8e8, 28);
    body.pushBox(0, 2.0, 0, 0.9, 0.35, 0.7, 0x2244ff, 28);
    body.pushBox(0, 2.0, 0.55, 0.45, 0.3, 0.2, 0xff2a2a, 28);
    body.pushBox(0, 2.0, -0.55, 0.45, 0.3, 0.2, 0x2244ff, 28);
  }
  const bodyGeo = body.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  // Glass cabin: windshield, rear window and side glass, one dark mesh.
  const glass = new MeshBuilder();
  glass.pushBox(-0.1, 1.55, 0, 2.4, 0.9, 2.0, 0x16222e, 28);
  const glassGeo = glass.build(new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, shininess: 90 }));
  // Lights: bright white discs at the nose, red at the tail.
  const lights = new MeshBuilder();
  lights.pushBox(half + 0.35, 0.9, 0.75, 0.2, 0.35, 0.45, 0xfff6d8, 28);
  lights.pushBox(half + 0.35, 0.9, -0.75, 0.2, 0.35, 0.45, 0xfff6d8, 28);
  lights.pushBox(-half - 0.35, 0.9, 0.75, 0.2, 0.35, 0.45, 0xff2a2a, 28);
  lights.pushBox(-half - 0.35, 0.9, -0.75, 0.2, 0.35, 0.45, 0xff2a2a, 28);
  const lightsGeo = lights.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  return { bodyGeo, glassGeo, lightsGeo };
}

export class Car {
  constructor(game, type, x, y, angle, driver) {
    this.game = game;
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.targetSpeed = 0;
    this.driver = driver; // 'traffic' | 'police' | 'player' | null (parked)
    this.mode = driver === 'police' ? 'chase' : 'traffic';
    this.wreck = false;
    this.roadblock = false;
    this.health = type === 'police' ? 220 : 160;
    this.steer = 0;
    this.spin = 0;
    this.legTo = null;
    this.legAxis = 'h';
    this.color = game.rng.pick(this.spec.colors);
    const { bodyGeo, glassGeo, lightsGeo } = buildCarGeometry(type, this.color);
    this.group = new THREE.Group();
    const bodyMesh = new THREE.Mesh(bodyGeo.geometry, bodyGeo.material);
    bodyMesh.castShadow = true;
    const glassMesh = new THREE.Mesh(glassGeo.geometry, glassGeo.material);
    const lightsMesh = new THREE.Mesh(lightsGeo.geometry, lightsGeo.material);
    this.group.add(bodyMesh, glassMesh, lightsMesh);
    game.renderer.scene.add(this.group);
    this.wheels = game.renderer.registerWheels(4);
    this._pickLeg();
  }

  get maxSpeed() {
    return this.spec.max;
  }

  _pickLeg() {
    // A straight leg along the current road to the next intersection, then
    // a random turn: mostly straight, sometimes left or right, never back.
    const atX = Math.round(this.x / PITCH) * PITCH;
    const atY = Math.round(this.y / PITCH) * PITCH;
    const options = [];
    const fwd = { x: Math.sin(this.angle), y: -Math.cos(this.angle) };
    const straight = { x: atX + Math.round(fwd.x) * PITCH, y: atY + Math.round(fwd.y) * PITCH };
    const left = { x: atX + Math.round(-fwd.y) * PITCH, y: atY + Math.round(fwd.x) * PITCH };
    const right = { x: atX + Math.round(fwd.y) * PITCH, y: atY + Math.round(-fwd.x) * PITCH };
    const inWorld = (p) => p.x >= 0 && p.x <= WORLD && p.y >= 0 && p.y <= WORLD;
    if (inWorld(straight)) { options.push(straight, straight, straight); }
    if (inWorld(left)) options.push(left);
    if (inWorld(right)) options.push(right);
    const next = options.length ? this.game.rng.pick(options) : { x: atX, y: atY };
    this.legTo = next;
    this.legAxis = Math.abs(next.x - atX) > 1 ? 'h' : 'v';
  }

  _steerToward(tx, ty, dt, rate = 2.4) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const want = Math.atan2(dx, -dy);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-rate * dt, Math.min(rate * dt, diff));
    this.angle += turn;
    this.steer = Math.max(-0.55, Math.min(0.55, diff * 0.9));
  }

  _redLightAhead() {
    if (!this.legTo) return false;
    const axis = this.legAxis;
    const green = this.game.city.lightState(this.game.time, axis);
    if (green === 'green') return false;
    const dx = this.legTo.x - this.x;
    const dy = this.legTo.y - this.y;
    return Math.hypot(dx, dy) < 80;
  }

  _carAhead() {
    const fx = Math.sin(this.angle), fy = -Math.cos(this.angle);
    for (const other of this.game.cars) {
      if (other === this || other.wreck) continue;
      const dx = other.x - this.x, dy = other.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 42 && dist > 1 && (dx * fx + dy * fy) / dist > 0.7) return other;
    }
    return null;
  }

  _collideBuildings() {
    const r = 2.6;
    const hit = this.game.city.pointInBuilding(this.x, this.y, r);
    if (!hit) return;
    // Push out along the smallest penetration axis and bleed speed. The
    // penalty is mild on purpose: this runs every fixed substep, so a hard
    // factor would pin the car to the wall instead of bouncing it off.
    const cx = this.x - (hit.x + hit.w / 2);
    const cy = this.y - (hit.y + hit.h / 2);
    const px = hit.w / 2 + r - Math.abs(cx);
    const py = hit.h / 2 + r - Math.abs(cy);
    if (px < py) this.x += Math.sign(cx || 1) * px;
    else this.y += Math.sign(cy || 1) * py;
    if (Math.abs(this.speed) > 150) this.game.sound.crash();
    this.speed *= 0.7;
  }

  _collideCars() {
    // Push overlapping cars apart positionally. Speeds are left alone: the
    // old swap-and-halve pinned a car that was touching a stopped one to
    // near zero, because the overlap repeated every substep.
    for (const other of this.game.cars) {
      if (other === this) continue;
      const dx = other.x - this.x, dy = other.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10 && dist > 0.01) {
        const push = (10 - dist) / 2 + 0.5;
        const nx = dx / dist, ny = dy / dist;
        this.x -= nx * push;
        this.y -= ny * push;
        other.x += nx * push;
        other.y += ny * push;
      }
    }
  }

  damage(amount) {
    if (this.wreck) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.wreck = true;
      this.targetSpeed = 0;
      this.game.onCarWrecked(this);
    }
  }

  update(dt) {
    if (this.wreck) {
      this.speed *= Math.max(0, 1 - 3 * dt);
    } else if (this.driver === 'player') {
      const input = this.game.input;
      const throttle = input.forward ? 1 : input.back ? -1 : 0;
      if (throttle > 0) this.speed += this.spec.accel * dt;
      else if (throttle < 0) this.speed -= (this.speed > 5 ? CAR_BRAKE : this.spec.accel * 0.6) * dt;
      else this.speed *= Math.max(0, 1 - 0.5 * dt);
      if (input.handbrake) {
        this.speed *= Math.max(0, 1 - 3.2 * dt);
        if (Math.abs(this.speed) > 120) this.game.sound.skid(0.8);
      }
      const max = this.spec.max;
      this.speed = Math.max(-CAR_REVERSE_MAX, Math.min(max, this.speed));
      const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const grip = Math.min(1, Math.abs(this.speed) / 120 + 0.25);
      this.angle += steerInput * 2.1 * grip * dt * (this.speed < 0 ? -1 : 1);
      this.steer = steerInput * 0.5;
    } else if (this.driver === 'traffic') {
      if (!this.legTo) this._pickLeg();
      if (Math.hypot(this.legTo.x - this.x, this.legTo.y - this.y) < 26) this._pickLeg();
      // Turn tightly: slow down and steer hard when the leg bends, so the
      // car stays on the 40px road instead of swinging wide into the
      // buildings at the corner. A wide turn used to leave a car facing a
      // wall ten pixels ahead, and a stolen car in that spot could not drive.
      const want = Math.atan2(this.legTo.x - this.x, -(this.legTo.y - this.y));
      let turnDiff = want - this.angle;
      while (turnDiff > Math.PI) turnDiff -= Math.PI * 2;
      while (turnDiff < -Math.PI) turnDiff += Math.PI * 2;
      const turning = Math.abs(turnDiff) > 0.4;
      this._steerToward(this.legTo.x, this.legTo.y, dt, turning ? 4.2 : 2.4);
      let target = TRAFFIC_SPEED;
      if (turning) target = Math.min(target, 70);
      if (this._redLightAhead()) target = 0;
      const ahead = this._carAhead();
      if (ahead) {
        target = Math.min(target, Math.max(0, ahead.speed));
        // Keep a gap: stop well behind a stopped car instead of piling
        // onto its bumper, where the two cars would overlap forever.
        const gap = Math.hypot(ahead.x - this.x, ahead.y - this.y);
        if (gap < 22) target = 0;
      }
      this.targetSpeed = target;
      const diff = target - this.speed;
      this.speed += Math.max(-140 * dt, Math.min(120 * dt, diff));
    } else if (this.driver === 'police' && this.mode === 'chase') {
      const p = this.game.player;
      const lead = 0.4;
      const tx = p.x + Math.sin(p.angle) * (p.driving ? p.inCar.speed * lead : 0);
      const ty = p.y - Math.cos(p.angle) * (p.driving ? p.inCar.speed * lead : 0);
      this._steerToward(tx, ty, dt, 2.8);
      const target = this.spec.max;
      this.speed += Math.max(-220 * dt, Math.min(300 * dt, target - this.speed));
      const ahead = this._carAhead();
      if (ahead && ahead !== p.inCar) this.speed = Math.min(this.speed, Math.max(0, ahead.speed));
    } else if (this.driver === 'taxi-ride') {
      // A hailed cab drives its passenger to the fare's destination.
      if (!this.rideTarget) {
        this.driver = null;
        this.mode = 'traffic';
      } else {
        this._steerToward(this.rideTarget.x, this.rideTarget.y, dt, 2.4);
        const dx = this.rideTarget.x - this.x, dy = this.rideTarget.y - this.y;
        if (Math.hypot(dx, dy) < 30) {
          this.game.player.endRide();
        } else {
          const target = TRAFFIC_SPEED + 50;
          this.speed += Math.max(-140 * dt, Math.min(120 * dt, target - this.speed));
        }
      }
    } else {
      // Parked or roadblock: parked, but still settles.
      this.speed *= Math.max(0, 1 - 4 * dt);
    }
    this.x += Math.sin(this.angle) * this.speed * dt;
    this.y += -Math.cos(this.angle) * this.speed * dt;
    this.x = Math.max(30, Math.min(WORLD - 30, this.x));
    this.y = Math.max(30, Math.min(WORLD - 30, this.y));
    this._collideBuildings();
    this._collideCars();
    this.spin += (this.speed / WHEEL_R) * dt;
  }

  destroy() {
    this.game.renderer.scene.remove(this.group);
    this.game.renderer.freeWheels(this.wheels);
  }
}

export function spawnTrafficCar(game, rng) {
  const p = game.city.randomRoadPoint(rng);
  const horizontal = rng.chance(0.5);
  const angle = horizontal ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
  const type = rng.chance(0.15) ? 'taxi' : rng.pick(['sedan', 'sedan', 'coupe', 'truck', 'sport']);
  const car = new Car(game, type, p.x, p.y, angle, 'traffic');
  car.speed = TRAFFIC_SPEED * rng.range(0.7, 1);
  return car;
}
