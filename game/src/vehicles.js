// Solstice City v4 — cars. Detailed meshes (stepped hood and trunk,
// bumpers, mirrors, turning front wheels, taxi roof sign, headlights with a
// real spotlight, taillights, sport spoiler, police light bar), arcade
// physics, and lane-following traffic AI that stops at red lights.

import * as THREE from '../vendor/three.module.min.js';
import { SPEED, WORLD } from './config.js';
import { mergePieces, boxMatrix, UNIT } from './merge.js';
import { resolveCollision, lightState, randomRoadPoint, isRoad } from './city.js';

const { PITCH } = WORLD;

const SEDAN_COLORS = [0x8a2a3a, 0x2a4a8a, 0xd8d0c0, 0x3a3a3a, 0x5a7a4a, 0x7a6a9a];
const SPORT_COLORS = [0xff7a1f, 0xffd21f, 0x7a1f9a, 0x1f9a8a, 0xc22a2a];
const GLASS = 0x1c2c3e;

let nextCarId = 1;

// Matrix for a wheel: cylinder axis along Z (the car's width), radius 1.6.
function wheelMatrix(x, y, z) {
  const m = new THREE.Matrix4();
  m.makeRotationX(Math.PI / 2);
  m.scale(new THREE.Vector3(3.2, 1.0, 3.2));
  m.setPosition(x, y, z);
  return m;
}

function bodyMeshFor(type, color) {
  const pieces = [
    { geo: UNIT.box, matrix: boxMatrix(0, 1.2, 0, 11, 2.2, 5.2), color },
    { geo: UNIT.box, matrix: boxMatrix(4.2, 1.6, 0, 3.4, 1.2, 5.0), color }, // stepped hood
    { geo: UNIT.box, matrix: boxMatrix(-4.2, 1.6, 0, 3.0, 1.2, 5.0), color }, // stepped trunk
    { geo: UNIT.box, matrix: boxMatrix(5.6, 0.8, 0, 0.8, 1.0, 5.4), color: 0x1a1a1e }, // front bumper
    { geo: UNIT.box, matrix: boxMatrix(-5.6, 0.8, 0, 0.8, 1.0, 5.4), color: 0x1a1a1e }, // rear bumper
    { geo: UNIT.box, matrix: boxMatrix(1.8, 2.4, 2.8, 0.6, 0.5, 0.4), color: 0x1a1a1e }, // mirror R
    { geo: UNIT.box, matrix: boxMatrix(1.8, 2.4, -2.8, 0.6, 0.5, 0.4), color: 0x1a1a1e }, // mirror L
  ];
  if (type === 'sport') {
    pieces.push({ geo: UNIT.box, matrix: boxMatrix(-4.9, 2.7, 0, 1.2, 0.3, 5.6), color: 0x1a1a1e }); // spoiler
    pieces.push({ geo: UNIT.box, matrix: boxMatrix(-4.9, 2.2, 2.2, 0.8, 0.7, 0.3), color: 0x1a1a1e });
    pieces.push({ geo: UNIT.box, matrix: boxMatrix(-4.9, 2.2, -2.2, 0.8, 0.7, 0.3), color: 0x1a1a1e });
  }
  if (type === 'police') {
    pieces.push({ geo: UNIT.box, matrix: boxMatrix(0, 1.2, 0, 6.5, 1.6, 5.3), color: 0xf0f0e8 }); // white door band
  }
  const geo = mergePieces(pieces);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15 }));
  mesh.castShadow = true;
  return mesh;
}

export function createCar(g, opts) {
  const type = opts.type || 'sedan';
  const color = opts.color ?? (type === 'taxi' ? 0xffc41f : type === 'police' ? 0x20242c : 0x8a2a3a);
  const group = new THREE.Group();
  group.add(bodyMeshFor(type, color));
  // Cabin: dark glass.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.8, 4.6), new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.7 }));
  cabin.position.set(-0.5, 2.9, 0);
  cabin.castShadow = true;
  group.add(cabin);
  // Headlights and taillights.
  const head = new THREE.Mesh(
    mergePieces([
      { geo: UNIT.box, matrix: boxMatrix(5.5, 1.3, 1.8, 0.4, 0.7, 1.2), color: 0xfff2c0 },
      { geo: UNIT.box, matrix: boxMatrix(5.5, 1.3, -1.8, 0.4, 0.7, 1.2), color: 0xfff2c0 },
    ]),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  group.add(head);
  const tail = new THREE.Mesh(
    mergePieces([
      { geo: UNIT.box, matrix: boxMatrix(-5.5, 1.3, 1.8, 0.4, 0.7, 1.2), color: 0xff2a2a },
      { geo: UNIT.box, matrix: boxMatrix(-5.5, 1.3, -1.8, 0.4, 0.7, 1.2), color: 0xff2a2a },
    ]),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  group.add(tail);
  // Wheels: front pair steers, rear pair fixed.
  const frontWheels = new THREE.Group();
  frontWheels.add(new THREE.Mesh(
    mergePieces([
      { geo: UNIT.cylinder, matrix: wheelMatrix(3.6, 1.6, 2.4), color: 0x141414 },
      { geo: UNIT.cylinder, matrix: wheelMatrix(3.6, 1.6, -2.4), color: 0x141414 },
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  ));
  frontWheels.position.set(0, 0, 0);
  group.add(frontWheels);
  const rearWheels = new THREE.Mesh(
    mergePieces([
      { geo: UNIT.cylinder, matrix: wheelMatrix(-3.6, 1.6, 2.4), color: 0x141414 },
      { geo: UNIT.cylinder, matrix: wheelMatrix(-3.6, 1.6, -2.4), color: 0x141414 },
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  );
  group.add(rearWheels);

  let lightBar = null;
  let taxiSign = null;
  if (type === 'taxi') {
    taxiSign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.4), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    taxiSign.position.set(0, 4.2, 0);
    group.add(taxiSign);
  }
  if (type === 'police') {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.0), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(0, 4.0, 0.7);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.0), new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
    blue.position.set(0, 4.0, -0.7);
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.userData = { red, blue };
    group.add(lightBar);
  }

  const car = {
    id: nextCarId++,
    type,
    color,
    x: opts.x || 0,
    y: opts.y || 0,
    heading: opts.heading || 0,
    speed: 0,
    targetSpeed: 0,
    steer: 0,
    throttle: 0,
    brake: false,
    handbrake: false,
    driver: opts.driver || 'traffic',
    wreck: false,
    roadblock: false,
    health: 100,
    group,
    frontWheels,
    lightBar,
    taxiSign,
    route: opts.route || null,
    turnCooldown: 0,
    stoppedFor: 0,
    topSpeed: type === 'sport' ? SPEED.sportTop : type === 'police' ? SPEED.policeTop : type === 'taxi' ? SPEED.taxiTop : SPEED.sedanTop,
    skid: false,
  };
  group.position.set(car.x, 0, car.y);
  group.rotation.y = -car.heading;
  g.scene.add(group);
  g.cars.push(car);
  return car;
}

export function spawnTraffic(g, rng, count) {
  for (let i = 0; i < count; i++) {
    const p = randomRoadPoint(g.city, rng);
    const roll = rng.next();
    const type = roll < 0.6 ? 'sedan' : roll < 0.8 ? 'sport' : 'taxi';
    const color = type === 'taxi' ? 0xffc41f : type === 'sport'
      ? rng.pick(SPORT_COLORS)
      : rng.pick(SEDAN_COLORS);
    const heading = p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    // Lane offset to the right of the direction of travel.
    const lane = p.axis === 'x' ? p.y + (p.dir > 0 ? 14 : -14) : p.x + (p.dir > 0 ? -14 : 14);
    const x = p.axis === 'x' ? p.x : lane;
    const y = p.axis === 'x' ? lane : p.y;
    if (isRoad(g.city, x, y)) {
      const car = createCar(g, { type, x, y, heading, driver: 'traffic', color });
      car.route = { axis: p.axis, line: p.axis === 'x' ? p.y : p.x, dir: p.dir };
      car.speed = SPEED.trafficCruise * rng.float(0.8, 1.1);
      car.targetSpeed = SPEED.trafficCruise;
    }
  }
}

// --- traffic AI ---------------------------------------------------------------

function nearestIntersectionDist(car) {
  // Distance along the car's axis to the next road line crossing.
  const pos = car.route.axis === 'x' ? car.x : car.y;
  const dir = car.route.dir;
  let best = Infinity;
  for (let k = -6; k <= 6; k++) {
    const line = k * PITCH;
    const d = (line - pos) * dir;
    if (d > 0 && d < best) best = d;
  }
  return best;
}

function carAhead(g, car, dist) {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  let best = null;
  let bestD = dist;
  for (const other of g.cars) {
    if (other === car || other.wreck) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < bestD && side < 9) {
      best = other;
      bestD = along;
    }
  }
  return best;
}

function updateTrafficCar(g, car, dt, t) {
  if (!car.route) return;
  const axis = car.route.axis;
  const dir = car.route.dir;
  // At an intersection, maybe turn.
  const crossDist = nearestIntersectionDist(car);
  if (crossDist < 8 && car.turnCooldown <= 0) {
    car.turnCooldown = 2;
    const roll = g.rng.next();
    const pos = axis === 'x' ? car.x : car.y;
    // The crossing road line nearest ahead.
    let line = Math.round(pos / PITCH) * PITCH;
    if (dir > 0 && pos > line) line += PITCH;
    if (dir < 0 && pos < line) line -= PITCH;
    if (roll < 0.25) {
      // Turn left.
      if (axis === 'x') {
        car.route = { axis: 'y', line, dir: dir > 0 ? -1 : 1 };
      } else {
        car.route = { axis: 'x', line, dir: dir > 0 ? 1 : -1 };
      }
    } else if (roll < 0.5) {
      // Turn right.
      if (axis === 'x') {
        car.route = { axis: 'y', line, dir: dir > 0 ? 1 : -1 };
      } else {
        car.route = { axis: 'x', line, dir: dir > 0 ? -1 : 1 };
      }
    }
    // Snap onto the new lane.
    const r = car.route;
    if (r.axis === 'x') car.y = r.line + (r.dir > 0 ? 14 : -14);
    else car.x = r.line + (r.dir > 0 ? -14 : 14);
    car.heading = r.axis === 'x' ? (r.dir > 0 ? 0 : Math.PI) : (r.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  car.turnCooldown = Math.max(0, car.turnCooldown - dt);
  // Red light: stop before the intersection.
  let want = SPEED.trafficCruise;
  const state = lightState(axis === 'x' ? 'ew' : 'ns', t);
  if (state === 'red' && crossDist < 80 && crossDist > 6) want = 0;
  // Car ahead: match its speed.
  const ahead = carAhead(g, car, 55);
  if (ahead) want = Math.min(want, Math.max(0, ahead.speed * 0.9));
  car.targetSpeed = want;
  car.throttle = want > car.speed ? 1 : 0;
  car.brake = want < car.speed - 5;
  // Keep the car glued to its lane.
  const r = car.route;
  if (r.axis === 'x') {
    const lane = r.line + (r.dir > 0 ? 14 : -14);
    car.y += (lane - car.y) * Math.min(1, dt * 3);
    car.heading = r.dir > 0 ? 0 : Math.PI;
  } else {
    const lane = r.line + (r.dir > 0 ? -14 : 14);
    car.x += (lane - car.x) * Math.min(1, dt * 3);
    car.heading = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

// --- shared physics -----------------------------------------------------------

export function updateCars(g, dt) {
  for (const car of g.cars) {
    if (car.wreck) {
      car.speed *= Math.max(0, 1 - 2 * dt);
    } else {
      const top = car.topSpeed;
      if (car.throttle > 0) car.speed += SPEED.accel * car.throttle * dt;
      if (car.brake) car.speed -= SPEED.brake * dt;
      if (car.handbrake) car.speed -= SPEED.brake * 1.6 * dt;
      if (car.throttle <= 0 && !car.brake && !car.handbrake) {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 40 * dt);
      }
      if (car.speed > top) car.speed = top;
      if (car.speed < -SPEED.reverseTop) car.speed = -SPEED.reverseTop;
      // Steering: sharper with the handbrake, weaker at a standstill.
      const grip = Math.min(1, Math.abs(car.speed) / 50);
      const turn = car.steer * (car.handbrake ? 3.2 : 2.0) * grip * Math.sign(car.speed || 1);
      car.heading += turn * dt;
      car.skid = car.handbrake && Math.abs(car.speed) > 60;
    }
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.y += Math.sin(car.heading) * car.speed * dt;
    // Buildings stop cars.
    const fixed = resolveCollision(g.city, car.x, car.y, 6);
    if (fixed.x !== car.x || fixed.y !== car.y) {
      if (Math.abs(car.speed) > 150 && car.driver === 'player') g.audio.crash();
      car.x = fixed.x;
      car.y = fixed.y;
      car.speed *= 0.55;
    }
    car.group.position.set(car.x, 0, car.y);
    car.group.rotation.y = -car.heading;
    if (car.frontWheels) car.frontWheels.rotation.y = car.steer * 0.45;
    // Police light bar flashes.
    if (car.lightBar) {
      const on = Math.floor(g.time * 4) % 2 === 0;
      car.lightBar.userData.red.material.color.setHex(on ? 0xff2a2a : 0x5a1010);
      car.lightBar.userData.blue.material.color.setHex(on ? 0x2a6aff : 0x10105a);
    }
  }
  // Car-car bumps.
  for (let i = 0; i < g.cars.length; i++) {
    for (let j = i + 1; j < g.cars.length; j++) {
      const a = g.cars[i];
      const b = g.cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 11) {
        const push = (11 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.abs(a.speed - b.speed);
        a.speed *= 0.85;
        b.speed *= 0.85;
        if (rel > 120 && (a.driver === 'player' || b.driver === 'player')) g.audio.crash();
      }
    }
  }
}

export function updateTraffic(g, dt) {
  for (const car of g.cars) {
    if (car.driver === 'traffic' && !car.wreck) updateTrafficCar(g, car, dt, g.time);
  }
}
