// Solstice City v3 — pedestrians. A dozen people walk the sidewalks, cross
// at the corners, and run when a gun goes off or a car comes at them. Steal
// a car and its driver bails out and flees on foot. They are drawn with two
// InstancedMeshes, so a crowd costs two draw calls.

import * as THREE from 'three';
import { WORLD, PITCH, PED_SPEED, PED_FLEE_SPEED } from './config.js';
import { toWorld } from './city.js';

const SHIRT_COLORS = [0xc84a4a, 0x4a7ac8, 0x4ac88a, 0xc8a04a, 0x8a4ac8, 0xd8d8d8, 0x3a3a3a, 0xc86a2a];

export class Pedestrians {
  constructor(game) {
    this.game = game;
    this.peds = [];
    this._buildMeshes();
    for (let i = 0; i < 12; i += 1) {
      const p = game.city.randomRoadPoint(game.rng);
      this.spawnPed(p.x, p.y);
    }
  }

  _buildMeshes() {
    const bodyGeo = new THREE.BoxGeometry(1.6, 3.4, 1.0);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, 32);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const headGeo = new THREE.SphereGeometry(0.75, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xc89a6a });
    this.heads = new THREE.InstancedMesh(headGeo, headMat, 32);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.castShadow = true;
    this.game.renderer.scene.add(this.bodies);
    this.game.renderer.scene.add(this.heads);
    this._dummy = new THREE.Object3D();
  }

  spawnPed(x, y) {
    if (this.peds.length >= 32) return null;
    const ped = {
      x, y, angle: this.game.rng.range(0, Math.PI * 2),
      speed: PED_SPEED * this.game.rng.range(0.8, 1.2),
      state: 'walk', health: 100, fleeT: 0, deadT: 0,
      target: null, color: this.game.rng.pick(SHIRT_COLORS),
    };
    this._pickWalkTarget(ped);
    this.peds.push(ped);
    return ped;
  }

  _pickWalkTarget(ped) {
    // A point on a sidewalk: a road centreline, offset to one side.
    const line = this.game.rng.int(0, 12) * PITCH;
    const along = this.game.rng.range(80, WORLD - 80);
    const side = this.game.rng.chance(0.5) ? 26 : -26;
    ped.target = this.game.rng.chance(0.5)
      ? { x: along, y: line + side }
      : { x: line + side, y: along };
  }

  // The driver of a stolen car bails out and runs.
  bailDriver(car) {
    const ped = this.spawnPed(car.x + 4, car.y + 4);
    if (ped) {
      ped.state = 'flee';
      ped.fleeT = 4;
      ped.fleeFrom = { x: car.x, y: car.y };
    }
  }

  fleeFrom(x, y, radius = 260) {
    for (const ped of this.peds) {
      if (ped.state === 'dead') continue;
      if (Math.hypot(ped.x - x, ped.y - y) < radius) {
        ped.state = 'flee';
        ped.fleeT = 3;
        ped.fleeFrom = { x, y };
      }
    }
  }

  damage(ped, amount) {
    if (ped.state === 'dead') return;
    ped.health -= amount;
    if (ped.health <= 0) {
      ped.state = 'dead';
      ped.deadT = 0;
    } else {
      ped.state = 'flee';
      ped.fleeT = 3;
      ped.fleeFrom = { x: this.game.player.x, y: this.game.player.y };
    }
  }

  update(dt) {
    const p = this.game.player;
    for (const ped of this.peds) {
      if (ped.state === 'dead') {
        ped.deadT += dt;
        continue;
      }
      let speed = ped.speed;
      let tx = ped.target ? ped.target.x : ped.x;
      let ty = ped.target ? ped.target.y : ped.y;
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        const dx = ped.x - ped.fleeFrom.x, dy = ped.y - ped.fleeFrom.y;
        const d = Math.hypot(dx, dy) || 1;
        tx = ped.x + (dx / d) * 60;
        ty = ped.y + (dy / d) * 60;
        speed = PED_FLEE_SPEED;
        if (ped.fleeT <= 0) ped.state = 'walk';
      } else {
        // A fast car nearby sends everyone running.
        const carNear = this.game.cars.some((c) => !c.wreck && Math.abs(c.speed) > 200
          && Math.hypot(c.x - ped.x, c.y - ped.y) < 30);
        if (carNear) {
          ped.state = 'flee';
          ped.fleeT = 2;
          ped.fleeFrom = { x: p.x, y: p.y };
        }
        if (ped.target && Math.hypot(tx - ped.x, ty - ped.y) < 12) this._pickWalkTarget(ped);
      }
      const dx = tx - ped.x, dy = ty - ped.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const want = Math.atan2(dx, -dy);
        let diff = want - ped.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
        ped.x += Math.sin(ped.angle) * speed * dt;
        ped.y += -Math.cos(ped.angle) * speed * dt;
      }
      // Stay out of the buildings and inside the city.
      if (this.game.city.pointInBuilding(ped.x, ped.y, 2)) {
        ped.x -= Math.sin(ped.angle) * speed * dt;
        ped.y += Math.cos(ped.angle) * speed * dt;
        this._pickWalkTarget(ped);
      }
      ped.x = Math.max(24, Math.min(WORLD - 24, ped.x));
      ped.y = Math.max(24, Math.min(WORLD - 24, ped.y));
    }
    // Drop the long-dead so the crowd stays fresh.
    this.peds = this.peds.filter((ped) => ped.state !== 'dead' || ped.deadT < 6);
    this._syncMeshes();
  }

  _syncMeshes() {
    const d = this._dummy;
    this.peds.forEach((ped, i) => {
      const pos = toWorld(ped.x, ped.y, 0);
      if (ped.state === 'dead') {
        const s = Math.max(0.01, 1 - ped.deadT / 6);
        d.position.set(pos.x, 0.6 * s, pos.z);
        d.rotation.set(0, 0, Math.PI / 2);
        d.scale.setScalar(s);
      } else {
        d.position.set(pos.x, 1.7, pos.z);
        d.rotation.set(0, Math.PI / 2 - ped.angle, 0);
        d.scale.setScalar(1);
        // A little bob while walking.
        d.position.y += Math.abs(Math.sin(this.game.time * 6 + i)) * 0.15;
      }
      d.updateMatrix();
      this.bodies.setMatrixAt(i, d.matrix);
      this.bodies.setColorAt(i, new THREE.Color(ped.color));
      if (ped.state === 'dead') {
        d.position.y = 0.8;
      } else {
        d.position.y = 3.9 + Math.abs(Math.sin(this.game.time * 6 + i)) * 0.15;
      }
      d.rotation.set(0, Math.PI / 2 - ped.angle, ped.state === 'dead' ? Math.PI / 2 : 0);
      d.updateMatrix();
      this.heads.setMatrixAt(i, d.matrix);
    });
    this.bodies.count = this.peds.length;
    this.heads.count = this.peds.length;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }
}
