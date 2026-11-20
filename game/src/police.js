// Solstice City v4 — the Solstice City Police Department. Cruisers spawn by
// wanted level, chase and ram, roadblocks appear at four stars, and HELI-1
// takes station overhead with a searchlight. The helicopter spawns IN FRONT
// of the player with a narrow, faint cone — never beside the camera, so its
// beam can never paint a diagonal band across the screen.

import * as THREE from '../vendor/three.module.min.js';
import { WANTED } from './config.js';
import { createCar } from './vehicles.js';
import { isRoad } from './city.js';

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function spawnPoliceCar(g) {
  const p = g.player;
  const a = g.rng.next() * Math.PI * 2;
  const dist = g.rng.float(350, 550);
  let x = p.x + Math.cos(a) * dist;
  let y = p.y + Math.sin(a) * dist;
  // Snap onto the nearest road, on the right-hand lane.
  const lineX = Math.round(x / 304) * 304;
  const lineY = Math.round(y / 304) * 304;
  if (Math.abs(x - lineX) < Math.abs(y - lineY)) {
    x = lineX + (g.rng.chance(0.5) ? 14 : -14);
  } else {
    y = lineY + (g.rng.chance(0.5) ? 14 : -14);
  }
  if (!isRoad(g.city, x, y)) {
    x = p.x + Math.cos(a) * 300;
    y = p.y + Math.sin(a) * 300;
  }
  const car = createCar(g, {
    type: 'police',
    x,
    y,
    heading: Math.atan2(p.y - y, p.x - x),
    driver: 'police',
    color: 0x20242c,
  });
  car.targetSpeed = car.topSpeed;
  return car;
}

function createRoadblocks(g) {
  const p = g.player;
  const at = p.inCar ? p.inCar : p;
  const fx = Math.cos(p.heading);
  const fy = Math.sin(p.heading);
  for (let i = 0; i < 2; i++) {
    const d = 190 + i * 55;
    const x = at.x + fx * d;
    const y = at.y + fy * d;
    // Parked across the road, facing the player.
    const car = createCar(g, {
      type: 'police',
      x: x - fy * (i === 0 ? 12 : -12),
      y: y + fx * (i === 0 ? 12 : -12),
      heading: Math.atan2(-fy, -fx),
      driver: 'police',
      color: 0x20242c,
    });
    car.roadblock = true;
    car.speed = 0;
    car.targetSpeed = 0;
  }
  g.police.roadblocksActive = true;
}

function removeRoadblocks(g) {
  for (let i = g.cars.length - 1; i >= 0; i--) {
    if (g.cars[i].roadblock) {
      g.scene.remove(g.cars[i].group);
      g.cars.splice(i, 1);
    }
  }
  g.police.roadblocksActive = false;
}

export function createHeli(g) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(14, 5, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.4, metalness: 0.4 }),
  );
  body.castShadow = true;
  group.add(body);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(12, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4 }),
  );
  tail.position.set(-12, 1, 0);
  group.add(tail);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.4, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 }),
  );
  rotor.position.y = 3.6;
  group.add(rotor);
  // Searchlight: a narrow, faint cone pointing down at the player, plus a
  // pool of light on the ground where it lands.
  const coneGeo = new THREE.ConeGeometry(9, 130, 16, 1, true);
  const cone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }),
  );
  group.add(cone);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(26, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  group.add(pool);
  g.scene.add(group);
  return { group, rotor, cone, pool, angle: 0, x: 0, wy: 0, h: 95 };
}

export function initPolice(g) {
  g.police = {
    roadblocksActive: false,
    bustedTimer: 0,
    heli: null,
  };
}

export function policeUnits(g) {
  const units = [];
  let n = 0;
  for (const car of g.cars) {
    if (car.driver !== 'police' || car.wreck) continue;
    n += 1;
    const d = Math.round(Math.hypot(car.x - g.player.x, car.y - g.player.y) / 10);
    const status = car.roadblock ? 'ROADBLOCK' : d < 45 ? 'RAMMING' : 'PURSUIT';
    units.push({ callsign: `SCPD-${car.id}`, dist: d, status });
  }
  if (g.police.heli) units.push({ callsign: 'HELI-1', dist: 0, status: 'AIRBORNE' });
  return units;
}

export function updatePolice(g, dt) {
  const p = g.player;
  const wanted = p.wanted;
  // Desired cruiser count grows with the wanted level.
  const desired = wanted <= 0 ? 0 : Math.min(WANTED.policeMax, WANTED.policeBase + (wanted - 1) * WANTED.policePerStar);
  let count = 0;
  for (const car of g.cars) if (car.driver === 'police' && !car.roadblock) count += 1;
  if (wanted <= 0) {
    // The heat is off: cruisers stand down.
    for (let i = g.cars.length - 1; i >= 0; i--) {
      const car = g.cars[i];
      if (car.driver === 'police' && !car.roadblock) {
        g.scene.remove(car.group);
        g.cars.splice(i, 1);
      }
    }
    if (g.police.roadblocksActive) removeRoadblocks(g);
    if (g.police.heli) {
      g.scene.remove(g.police.heli.group);
      g.police.heli = null;
    }
    return;
  }
  // Spawn cruisers until the street is full.
  while (count < desired) {
    spawnPoliceCar(g);
    count += 1;
  }
  // Roadblocks at four stars, exactly two, created once.
  if (wanted >= WANTED.roadblockAt && !g.police.roadblocksActive) createRoadblocks(g);
  if (wanted < WANTED.roadblockAt && g.police.roadblocksActive) removeRoadblocks(g);
  // HELI-1 at four stars.
  if (wanted >= WANTED.heliAt && !g.police.heli) {
    g.police.heli = createHeli(g);
    g.hud.toast('SCPD: HELI-1 AIRBORNE', 4000);
  }
  if (wanted < WANTED.heliAt && g.police.heli) {
    g.scene.remove(g.police.heli.group);
    g.police.heli = null;
  }

  // Chase and ram.
  let bustedNear = false;
  for (const car of g.cars) {
    if (car.driver !== 'police' || car.wreck || car.roadblock) continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const d = Math.hypot(dx, dy);
    const wantHeading = Math.atan2(dy, dx);
    const steer = Math.max(-1, Math.min(1, angleDiff(car.heading, wantHeading) * 1.6));
    car.steer = steer * 0.55;
    car.throttle = d > 25 ? 1 : 0.4;
    car.brake = d < 12;
    car.handbrake = false;
    // Ram the player's car on contact (at most once per 0.8s per cruiser).
    if (d < 13 && p.driving && p.inCar) {
      car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
      const hit = Math.abs(car.speed) > 40 && car.ramCooldown <= 0;
      if (hit) {
        car.ramCooldown = 0.8;
        p.inCar.speed *= 0.82;
        p.shake = Math.max(p.shake, 0.25);
        g.audio.crash();
        if (p.health > 0) {
          p.health = Math.max(1, p.health - 2);
        }
      }
    }
    if (!p.driving && d < 38) bustedNear = true;
  }
  // Busted: caught on foot by a nearby cruiser.
  if (bustedNear && wanted >= 1) {
    g.police.bustedTimer += dt;
    if (g.police.bustedTimer > 1.2) {
      g.police.bustedTimer = 0;
      g.setState('busted');
    }
  } else {
    g.police.bustedTimer = Math.max(0, g.police.bustedTimer - dt * 2);
  }

  // Helicopter: stationed in front of the player, searchlight down.
  // Positions are in world coords: (x, wy) on the ground plane, h the height.
  const heli = g.police.heli;
  if (heli) {
    heli.angle += dt * 0.12;
    const fx = Math.cos(p.heading);
    const fy = Math.sin(p.heading);
    const tx = p.x + fx * 170 + Math.cos(heli.angle) * 40;
    const ty = p.y + fy * 170 + Math.sin(heli.angle) * 40;
    heli.x += (tx - heli.x) * Math.min(1, dt * 1.2);
    heli.wy += (ty - heli.wy) * Math.min(1, dt * 1.2);
    heli.h += (95 - heli.h) * Math.min(1, dt * 1.2);
    heli.group.position.set(heli.x, heli.h, heli.wy);
    heli.group.rotation.y = -Math.atan2(p.y - heli.wy, p.x - heli.x);
    heli.rotor.rotation.y += dt * 22;
    // Cone (a child of the group, so local coords): tip at the helicopter,
    // base on the ground at the player. Its +Y runs from base to tip.
    const gx = p.x - heli.x;
    const gy = -heli.h;
    const gz = p.y - heli.wy;
    const len = Math.hypot(gx, gy, gz);
    const dir = new THREE.Vector3(-gx / len, -gy / len, -gz / len);
    heli.cone.position.set(gx * 0.5, gy * 0.5, gz * 0.5);
    heli.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    heli.cone.scale.set(1, len / 130, 1);
    heli.pool.position.set(gx, gy + 1, gz);
  }
}
