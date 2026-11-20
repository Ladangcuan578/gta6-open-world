// Solstice City v4 — Rico Marín. On foot and behind the wheel: world-axis
// walking (D walks east from the spawn), car entry and theft, the wanted
// level, health, cash, taxi fares and the headlight switch. The camera is a
// low chase cam that widens its field of view with speed.

import * as THREE from '../vendor/three.module.min.js';
import { SPEED, WANTED, TAXI_FARE, REPUTATION, LANDMARKS } from './config.js';
import { resolveCollision } from './city.js';

export function createPlayer(g) {
  const group = new THREE.Group();
  // A simple figure: denim jacket, dark jeans, hair.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 6.4, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x4a6aa8, roughness: 0.8 }),
  );
  body.position.y = 5.4;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.7 }),
  );
  head.position.y = 10.2;
  head.castShadow = true;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 4.6, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.9 }),
  );
  legs.position.y = 2.3;
  group.add(legs);
  group.position.set(g.city.spawn.x, 0, g.city.spawn.y);
  g.scene.add(group);

  const player = {
    x: g.city.spawn.x,
    y: g.city.spawn.y,
    heading: -Math.PI / 2, // facing north
    inCar: null,
    driving: false,
    cash: 0,
    totalEarned: 0,
    wanted: 0,
    health: 100,
    speed: 0,
    // The play-test (and the console) raises wanted through the player.
    addWanted: (n) => addWanted(g, n),
    lastCrime: -999,
    headlightsOn: false,
    fare: null,
    group,
    body,
    head,
    legs,
    bobPhase: 0,
    camPos: new THREE.Vector3(g.city.spawn.x, 8, g.city.spawn.y + 16),
    camLook: new THREE.Vector3(g.city.spawn.x, 2, g.city.spawn.y),
    shake: 0,
    spot: null,
    pool: null,
  };
  return player;
}

export function reputationTitle(earned) {
  let title = REPUTATION[0].title;
  for (const r of REPUTATION) if (earned >= r.at) title = r.title;
  return title;
}

export function addCash(g, amount) {
  g.player.cash += amount;
  g.player.totalEarned += amount;
  g.audio.cash();
  g.hud.toast(`+$${amount}`);
  g.save();
}

export function addWanted(g, n) {
  const p = g.player;
  const before = p.wanted;
  p.wanted = Math.min(WANTED.max, p.wanted + n);
  p.lastCrime = g.time;
  if (p.wanted > before && p.wanted >= 4) {
    g.hud.toast('SCPD: HELI-1 AIRBORNE — roadblocks ahead', 4000);
  }
}

function nearestCar(g, maxDist) {
  const p = g.player;
  let best = null;
  let bestD = maxDist;
  for (const car of g.cars) {
    if (car.wreck) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function enterCar(g, car) {
  const p = g.player;
  if (car.driver === 'traffic' || car.driver === 'police') {
    // The driver bails and flees on foot.
    g.peds.spawnFleeing(car.x + 6, car.y);
  }
  const policeCar = car.type === 'police';
  car.driver = 'player';
  car.route = null;
  p.inCar = car;
  p.driving = true;
  p.group.visible = false;
  addWanted(g, policeCar ? WANTED.stealPoliceCar : WANTED.stealCar);
  g.missions.onSteal();
  g.audio.ensure();
}

function exitCar(g) {
  const p = g.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  car.throttle = 0;
  // Step out on the left side of the car.
  const lx = -Math.sin(car.heading);
  const ly = Math.cos(car.heading);
  const spot = resolveCollision(g.city, car.x + lx * 10, car.y + ly * 10, 4);
  p.x = spot.x;
  p.y = spot.y;
  p.inCar = null;
  p.driving = false;
  p.group.visible = true;
  p.group.position.set(p.x, 0, p.y);
}

export function toggleHeadlights(g) {
  const p = g.player;
  p.headlightsOn = !p.headlightsOn;
  if (!p.spot) {
    p.spot = new THREE.SpotLight(0xfff2c0, 0, 130, 0.55, 0.5, 1.2);
    g.scene.add(p.spot);
    g.scene.add(p.spot.target);
    const poolGeo = new THREE.CircleGeometry(16, 20);
    p.pool = new THREE.Mesh(
      poolGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    p.pool.rotation.x = -Math.PI / 2;
    p.pool.visible = false;
    g.scene.add(p.pool);
  }
  p.spot.intensity = p.headlightsOn ? 900 : 0;
  if (p.pool) p.pool.visible = p.headlightsOn;
  g.hud.toast(p.headlightsOn ? 'Headlights on' : 'Headlights off');
}

function startFare(g) {
  const p = g.player;
  if (!p.inCar || p.inCar.type !== 'taxi' || p.fare) return;
  const keys = ['hotel', 'plaza', 'bank', 'casino', 'port', 'airport'];
  const key = keys[Math.floor(g.rng.next() * keys.length)];
  const amount = Math.floor(g.rng.float(TAXI_FARE.min, TAXI_FARE.max + 1));
  p.fare = { target: key, amount, timer: 75 };
  g.hud.toast(`Taxi fare: take the passenger to the ${key} — $${amount}`);
  g.hud.setDialogue('Penumpang', 'Bang, buruan ya. Gue telat.');
}

function updateFare(g, dt) {
  const p = g.player;
  const fare = p.fare;
  if (!fare) return;
  fare.timer -= dt;
  const target = g.city.landmarks[fare.target].arrival;
  const at = p.inCar ? p.inCar : p;
  if (Math.hypot(at.x - target.x, at.y - target.y) < 60) {
    addCash(g, fare.amount);
    g.hud.setDialogue('Penumpang', 'Makasih, bang! Nih ongkosnya.');
    p.fare = null;
    return;
  }
  if (fare.timer <= 0) {
    g.hud.toast('Fare lost — the passenger gave up');
    p.fare = null;
  }
}

export function damagePlayer(g, amount) {
  const p = g.player;
  if (g.state !== 'playing') return;
  p.health = Math.max(0, p.health - amount);
  if (p.health <= 0) {
    g.setState('wasted');
  }
}

export function updatePlayer(g, dt, input) {
  const p = g.player;
  // Wanted decays after a quiet spell with no police nearby.
  if (p.wanted > 0 && g.time - p.lastCrime > WANTED.decaySeconds) {
    const nearCop = g.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 300);
    if (!nearCop) {
      p.wanted -= 1;
      p.lastCrime = g.time;
    }
  }
  // Enter / exit a car.
  if (input.wasPressed('KeyE')) {
    if (p.driving) exitCar(g);
    else {
      // Generous radius: at the 3-5 fps SwiftShader manages, a whole frame
      // of traffic movement can pass between the player reaching a car and
      // the E press being read, so the grab has to cover a car that has
      // already driven a few dozen units away.
      const car = nearestCar(g, 70);
      if (car) enterCar(g, car);
    }
  }
  if (input.wasPressed('KeyT')) startFare(g);
  if (input.wasPressed('KeyL')) toggleHeadlights(g);
  if (input.wasPressed('KeyM')) {
    g.audio.ensure();
    g.audio.setMuted(!g.audio.muted);
    g.hud.toast(g.audio.muted ? 'Muted' : 'Sound on');
  }
  if (input.wasPressed('KeyR')) {
    g.audio.ensure();
    const name = g.audio.nextTrack();
    g.hud.setRadio(name);
  }

  if (p.driving && p.inCar) {
    const car = p.inCar;
    car.throttle = input.down('KeyW', 'ArrowUp') ? 1 : 0;
    car.brake = input.down('KeyS', 'ArrowDown');
    car.handbrake = input.down('Space');
    let steer = 0;
    if (input.down('KeyA', 'ArrowLeft')) steer -= 1;
    if (input.down('KeyD', 'ArrowRight')) steer += 1;
    car.steer = steer * 0.55;
    p.x = car.x;
    p.y = car.y;
    p.heading = car.heading;
    p.speed = car.speed;
    g.audio.setEngine(Math.min(1, Math.abs(car.speed) / car.topSpeed), true);
    g.audio.setSkid(car.skid ? 1 : 0);
    if (car.skid) p.shake = Math.max(p.shake, 0.05);
  } else {
    // On foot: world-axis movement, D walks east.
    let mx = 0;
    let my = 0;
    if (input.down('KeyW', 'ArrowUp')) my -= 1;
    if (input.down('KeyS', 'ArrowDown')) my += 1;
    if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
    if (input.down('KeyD', 'ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      const nx = p.x + mx * SPEED.walk * dt;
      const ny = p.y + my * SPEED.walk * dt;
      const fixed = resolveCollision(g.city, nx, ny, 4);
      p.x = fixed.x;
      p.y = fixed.y;
      p.heading = Math.atan2(my, mx);
      p.speed = SPEED.walk;
      p.bobPhase += dt * 10;
      p.group.position.y = Math.abs(Math.sin(p.bobPhase)) * 0.7;
    } else {
      p.speed = 0;
      p.group.position.y = 0;
    }
    p.group.position.x = p.x;
    p.group.position.z = p.y;
    p.group.rotation.y = -p.heading;
    g.audio.setEngine(0, false);
    g.audio.setSkid(0);
  }
  updateFare(g, dt);

  // Headlight beam follows the player's car.
  if (p.spot && p.inCar) {
    const car = p.inCar;
    const fx = Math.cos(car.heading);
    const fy = Math.sin(car.heading);
    p.spot.position.set(car.x + fx * 5, 3, car.y + fy * 5);
    p.spot.target.position.set(car.x + fx * 60, 0, car.y + fy * 60);
    if (p.pool) {
      p.pool.position.set(car.x + fx * 34, 0.4, car.y + fy * 34);
      p.pool.visible = p.headlightsOn;
    }
  } else if (p.pool) {
    p.pool.visible = false;
  }
}

export function updateCamera(g, dt) {
  const p = g.player;
  const cam = g.camera;
  let targetPos;
  let targetLook;
  let targetFov = 62;
  if (p.driving && p.inCar) {
    const car = p.inCar;
    const fx = Math.cos(car.heading);
    const fy = Math.sin(car.heading);
    targetPos = new THREE.Vector3(car.x - fx * 17, 7.5, car.y - fy * 17);
    targetLook = new THREE.Vector3(car.x + fx * 9, 2.5, car.y + fy * 9);
    targetFov = 62 + Math.min(12, Math.abs(car.speed) / car.topSpeed * 12);
  } else {
    // Follow cam behind the player's facing; default faces north.
    // Kept well back so the figure never fills the frame.
    const fx = Math.cos(p.heading);
    const fy = Math.sin(p.heading);
    targetPos = new THREE.Vector3(p.x - fx * 20, 10, p.y - fy * 20);
    targetLook = new THREE.Vector3(p.x + fx * 8, 2, p.y + fy * 8);
  }
  const k = 1 - Math.exp(-dt * 4.5);
  p.camPos.lerp(targetPos, k);
  p.camLook.lerp(targetLook, k);
  // Crash shake only — never on a calm drive.
  if (p.shake > 0) {
    p.shake -= dt;
    p.camPos.x += (Math.random() - 0.5) * p.shake * 8;
    p.camPos.y += (Math.random() - 0.5) * p.shake * 8;
  }
  cam.position.copy(p.camPos);
  cam.lookAt(p.camLook);
  if (Math.abs(cam.fov - targetFov) > 0.05) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  }
  // The sun's shadow camera follows the player.
  const sun = g.city.sunLight;
  if (sun) {
    sun.position.set(p.x - 320, 260, p.y + 180);
    sun.target.position.set(p.x, 0, p.y);
    sun.target.updateMatrixWorld();
  }
}

// Snap the chase camera to its target immediately (used when staging a
// screenshot, where the camera must not drift between frames).
export function snapCamera(g) {
  const p = g.player;
  const cam = g.camera;
  let targetPos;
  let targetLook;
  if (p.driving && p.inCar) {
    const car = p.inCar;
    const fx = Math.cos(car.heading);
    const fy = Math.sin(car.heading);
    targetPos = new THREE.Vector3(car.x - fx * 17, 7.5, car.y - fy * 17);
    targetLook = new THREE.Vector3(car.x + fx * 9, 2.5, car.y + fy * 9);
  } else {
    const fx = Math.cos(p.heading);
    const fy = Math.sin(p.heading);
    targetPos = new THREE.Vector3(p.x - fx * 20, 10, p.y - fy * 20);
    targetLook = new THREE.Vector3(p.x + fx * 8, 2, p.y + fy * 8);
  }
  p.camPos.copy(targetPos);
  p.camLook.copy(targetLook);
  cam.position.copy(targetPos);
  cam.lookAt(targetLook);
  cam.fov = 62;
  cam.updateProjectionMatrix();
}
