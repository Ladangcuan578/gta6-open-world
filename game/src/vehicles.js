// Solstice City — cars: driving physics, traffic AI that follows the road
// network, and police AI that chases the player and rams them.
import { CFG, PAL } from './config.js';
import { makeRng, clamp, angleDiff, dist2 } from './random.js';
import { WORLD_W, isRoad, randomRoadPoint, resolveBuildingCollision } from './city.js';

let carId = 0;

export function makeCar(x, y, angle, type, color, opts = {}) {
  const spec = CFG.CAR_TYPES[type] || CFG.CAR_TYPES.sedan;
  return {
    id: carId += 1,
    x, y, angle,
    speed: 0,
    type,
    color,
    spec,
    health: spec.health,
    driver: opts.driver || 'traffic', // 'traffic' | 'player' | 'police' | 'parked' | 'mission'
    targetSpeed: 0,
    waypoint: null,
    stuckTimer: 0,
    reverseTimer: 0,
    smoke: 0,
    wreck: false,
    wreckTimer: 0,
    sirenPhase: Math.random() * Math.PI * 2,
  };
}

// Pick a neighbouring intersection for a traffic car to drive to.
function nextWaypoint(car, rng) {
  const gx = Math.round(car.x / CFG.PITCH);
  const gy = Math.round(car.y / CFG.PITCH);
  const options = [];
  if (gx > 0) options.push({ x: (gx - 1) * CFG.PITCH, y: gy * CFG.PITCH });
  if (gx < CFG.GRID) options.push({ x: (gx + 1) * CFG.PITCH, y: gy * CFG.PITCH });
  if (gy > 0) options.push({ x: gx * CFG.PITCH, y: (gy - 1) * CFG.PITCH });
  if (gy < CFG.GRID) options.push({ x: gx * CFG.PITCH, y: (gy + 1) * CFG.PITCH });
  if (options.length === 0) return { x: car.x, y: car.y };
  return options[Math.floor(rng.next() * options.length)];
}

export function spawnTraffic(city, rng, count, avoidX, avoidY, avoidR) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng, avoidX, avoidY, avoidR);
    const type = rng.pick(['sedan', 'sedan', 'sedan', 'sport', 'truck', 'van']);
    const car = makeCar(p.x, p.y, rng.next() * Math.PI * 2, type, rng.pick(PAL.carColors));
    car.targetSpeed = rng.range(CFG.TRAFFIC_SPEED[0], CFG.TRAFFIC_SPEED[1]);
    car.waypoint = nextWaypoint(car, rng);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(city, rng, count, avoidX, avoidY, avoidR) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng, avoidX, avoidY, avoidR);
    const type = rng.pick(['sedan', 'sport', 'sedan', 'truck']);
    const angle = Math.round(p.x / CFG.PITCH) === p.x / CFG.PITCH
      ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      : (rng.chance(0.5) ? 0 : Math.PI);
    const car = makeCar(p.x + rng.range(-8, 8), p.y + rng.range(-8, 8), angle, type, rng.pick(PAL.carColors), { driver: 'parked' });
    cars.push(car);
  }
  return cars;
}

// One physics step for a car driven by `drive` input {throttle, steer, brake}.
// Returns true if it hit something solid this step.
export function stepCar(car, dt, drive, city) {
  const spec = car.spec;
  const accel = drive.throttle * spec.accel;
  const braking = drive.brake ? spec.accel * 1.6 : 0;
  if (drive.throttle !== 0) car.speed += accel * dt;
  else if (drive.brake) car.speed -= braking * dt * Math.sign(car.speed || 1);
  else car.speed -= car.speed * 0.9 * dt;
  car.speed = clamp(car.speed, -spec.reverse, spec.maxSpeed);
  const steer = drive.steer * clamp(Math.abs(car.speed) / 120, 0, 1) * spec.grip;
  car.angle += steer * dt * (car.speed >= 0 ? 1 : -1) * 0.9;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx;
  car.y = ny;
  const hit = resolveBuildingCollision(city, car, 20);
  if (hit) car.speed *= 0.55;
  return hit;
}

function carAhead(cars, car, dist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  let bestD = dist;
  for (const other of cars) {
    if (other === car || other.wreck) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along <= 0 || along > dist) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 26 && along < bestD) {
      bestD = along;
      best = other;
    }
  }
  return best;
}

export function updateTraffic(cars, dt, city, rng, playerCar) {
  for (const car of cars) {
    if (car.driver !== 'traffic' || car.wreck) continue;
    if (!car.waypoint) car.waypoint = nextWaypoint(car, rng);
    const dx = car.waypoint.x - car.x;
    const dy = car.waypoint.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 14) {
      car.waypoint = nextWaypoint(car, rng);
      continue;
    }
    const wantAngle = Math.atan2(dy, dx);
    const diff = angleDiff(car.angle, wantAngle);
    const ahead = carAhead(cars, car, 70);
    const target = ahead ? Math.max(0, ahead.speed * 0.7) : car.targetSpeed;
    const drive = {
      throttle: target > car.speed ? 1 : 0,
      brake: target < car.speed - 20,
      steer: clamp(diff * 2.2, -1, 1),
    };
    // Ease into the turn: slow down for sharp corners.
    if (Math.abs(diff) > 0.9 && car.speed > 90) drive.throttle = 0;
    stepCar(car, dt, drive, city);
    // Keep traffic on the roads: if it drifted off (pushed by a crash), steer
    // back toward the nearest road point.
    if (!isRoad(car.x, car.y)) {
      const p = { x: Math.round(car.x / CFG.PITCH) * CFG.PITCH, y: Math.round(car.y / CFG.PITCH) * CFG.PITCH };
      car.waypoint = p;
    }
  }
  // Gentle separation so traffic does not stack up at intersections.
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.wreck || b.wreck) continue;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < 30 * 30 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (30 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

export function spawnPolice(city, rng, count, px, py) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng, px, py, 520);
    const car = makeCar(p.x, p.y, 0, 'police', '#eef1f4', { driver: 'police' });
    cars.push(car);
  }
  return cars;
}

// Police chase: steer at the player, ram them, and get stuck handling.
export function updatePolice(cars, dt, city, player, onRam) {
  for (const car of cars) {
    if (car.driver !== 'police' || car.wreck) continue;
    const tx = player.x;
    const ty = player.y;
    const dx = tx - car.x;
    const dy = ty - car.y;
    const d = Math.hypot(dx, dy);
    const wantAngle = Math.atan2(dy, dx);
    const diff = angleDiff(car.angle, wantAngle);
    // If barely moving and not close, reverse out of the jam.
    if (Math.abs(car.speed) < 25 && d > 60) car.stuckTimer += dt;
    else car.stuckTimer = 0;
    if (car.stuckTimer > 1.6) {
      car.reverseTimer = 0.7;
      car.stuckTimer = 0;
    }
    let drive;
    if (car.reverseTimer > 0) {
      car.reverseTimer -= dt;
      drive = { throttle: 0, brake: false, steer: -clamp(diff * 2, -1, 1) };
      car.speed = Math.max(car.speed - car.spec.accel * dt, -car.spec.reverse);
      car.angle += drive.steer * dt * 1.4;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      resolveBuildingCollision(city, car, 20);
    } else {
      drive = {
        throttle: d > 40 ? 1 : 0,
        brake: false,
        steer: clamp(diff * 2.4, -1, 1),
      };
      stepCar(car, dt, drive, city);
    }
    // Ramming the player's car damages it; touching the player on foot
    // starts the bust. The caller reads car.ramming.
    const pr = player.inCar ? 34 : 26;
    car.ramming = Math.hypot(car.x - player.x, car.y - player.y) < pr + 18;
    if (car.ramming && onRam) onRam(car, dt);
  }
}

// Damage a car; returns true when it just became a wreck.
export function damageCar(car, amount) {
  if (car.wreck) return false;
  car.health -= amount;
  if (car.health <= 40) car.smoke = 1;
  if (car.health <= 0) {
    car.wreck = true;
    car.wreckTimer = 10;
    car.speed = 0;
    return true;
  }
  return false;
}
