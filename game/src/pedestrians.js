// Solstice City v4 — pedestrians. They stroll the sidewalks, turn at
// corners, and run when a gun goes off or a car bears down on them. A driver
// whose car is stolen bails out as a fleeing pedestrian.

import * as THREE from '../vendor/three.module.min.js';
import { WORLD } from './config.js';
import { resolveCollision } from './city.js';
import { addWanted } from './player.js';

const { PITCH, ROAD } = WORLD;

const SHIRT_COLORS = [0xc25a4a, 0x4a7ac2, 0x5aa85a, 0xd8b84a, 0x8a5ac2, 0xe0e0e0, 0x2a2a2a];

function makePedMesh(g, color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 5.6, 2.0),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  body.position.y = 4.6;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.7 }),
  );
  head.position.y = 8.8;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 3.6, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a34, roughness: 0.9 }),
  );
  legs.position.y = 1.8;
  group.add(legs);
  g.scene.add(group);
  return group;
}

function randomSidewalkPoint(g, rng) {
  const axis = rng.chance(0.5) ? 'x' : 'y';
  const line = rng.pick([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) * PITCH;
  const along = rng.float(-1700, 1700);
  const side = rng.chance(0.5) ? 1 : -1;
  const off = ROAD / 2 + 9;
  if (axis === 'x') return { x: along, y: line + side * off, axis, dir: rng.chance(0.5) ? 1 : -1 };
  return { x: line + side * off, y: along, axis, dir: rng.chance(0.5) ? 1 : -1 };
}

export function spawnPeds(g, rng, count) {
  for (let i = 0; i < count; i++) {
    const p = randomSidewalkPoint(g, rng);
    const ped = {
      x: p.x,
      y: p.y,
      heading: p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: rng.float(45, 75),
      state: 'walk',
      route: { axis: p.axis, line: p.axis === 'x' ? p.y : p.x, dir: p.dir },
      fleeTimer: 0,
      downTimer: 0,
      mesh: makePedMesh(g, rng.pick(SHIRT_COLORS)),
      bob: rng.float(0, 6),
    };
    ped.mesh.position.set(ped.x, 0, ped.y);
    g.peds.list.push(ped);
  }
}

export function spawnFleeing(g, x, y) {
  const ped = {
    x,
    y,
    heading: g.rng.next() * Math.PI * 2,
    speed: 210,
    state: 'flee',
    route: null,
    fleeTimer: 3,
    downTimer: 0,
    mesh: makePedMesh(g, 0xc25a4a),
    bob: 0,
  };
  ped.mesh.position.set(x, 0, y);
  g.peds.list.push(ped);
}

function carThreat(g, ped) {
  for (const car of g.cars) {
    if (car.wreck || Math.abs(car.speed) < 30) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 70) {
      // Only flee if the car is coming at the pedestrian.
      const fx = Math.cos(car.heading);
      const fy = Math.sin(car.heading);
      const closing = (dx * fx + dy * fy) < 0;
      if (closing) return { x: car.x, y: car.y };
    }
  }
  return null;
}

export function updatePeds(g, dt) {
  const shot = g.lastShot;
  for (let i = g.peds.list.length - 1; i >= 0; i--) {
    const ped = g.peds.list[i];
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      ped.mesh.rotation.x = Math.min(Math.PI / 2, ped.mesh.rotation.x + dt * 4);
      if (ped.downTimer <= 0) {
        g.scene.remove(ped.mesh);
        g.peds.list.splice(i, 1);
      }
      continue;
    }
    // Flee from gunshots and oncoming cars.
    let threat = null;
    if (shot && g.time - shot.time < 2 && Math.hypot(ped.x - shot.x, ped.y - shot.y) < 320) {
      threat = { x: shot.x, y: shot.y };
    } else {
      threat = carThreat(g, ped);
    }
    if (threat) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
      ped.heading = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    } else if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.route = null;
      }
    }
    const speed = ped.state === 'flee' ? 210 : ped.speed;
    let nx = ped.x + Math.cos(ped.heading) * speed * dt;
    let ny = ped.y + Math.sin(ped.heading) * speed * dt;
    if (ped.state === 'walk') {
      // Stay on the sidewalk: at an intersection, sometimes turn.
      const r = ped.route;
      if (r) {
        const along = r.axis === 'x' ? nx : ny;
        const cross = Math.round(along / PITCH) * PITCH;
        if (Math.abs(along - cross) < 6 && g.rng.chance(0.3)) {
          const turnLeft = g.rng.chance(0.5);
          if (r.axis === 'x') {
            ped.route = { axis: 'y', line: cross, dir: turnLeft ? -1 : 1 };
            ped.heading = turnLeft ? -Math.PI / 2 : Math.PI / 2;
          } else {
            ped.route = { axis: 'x', line: cross, dir: turnLeft ? 1 : -1 };
            ped.heading = turnLeft ? Math.PI : 0;
          }
          nx = ped.x + Math.cos(ped.heading) * speed * dt;
          ny = ped.y + Math.sin(ped.heading) * speed * dt;
        }
      } else {
        ped.route = { axis: 'x', line: ped.y, dir: 1 };
      }
    }
    const fixed = resolveCollision(g.city, nx, ny, 3);
    ped.x = fixed.x;
    ped.y = fixed.y;
    ped.bob += dt * 8;
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.bob)) * 0.5, ped.y);
    ped.mesh.rotation.y = -ped.heading;
    ped.mesh.rotation.x = 0;
    // Run over by a fast car: knocked down.
    for (const car of g.cars) {
      if (car.wreck || Math.abs(car.speed) < 60) continue;
      if (Math.hypot(car.x - ped.x, car.y - ped.y) < 7) {
        ped.state = 'down';
        ped.downTimer = 3;
        if (car.driver === 'player') addWanted(g, 1);
        break;
      }
    }
  }
}

// Remove pedestrians that wandered into the water or too far out.
export function prunePeds(g) {
  for (let i = g.peds.list.length - 1; i >= 0; i--) {
    const ped = g.peds.list[i];
    if (Math.abs(ped.x) > 2050 || ped.y < -1900 || ped.y > 1980) {
      g.scene.remove(ped.mesh);
      g.peds.list.splice(i, 1);
    }
  }
}
