// Vehicles: detailed car models, arcade driving physics, road-following traffic and
// car stealing. A car is a group of boxes — stepped hood and trunk, bumpers,
// mirrors, turning front wheels, headlights with a real spotlight and taillights —
// in six variants: sedan, taxi, sport, van, truck and convertible.
import * as THREE from 'three';
import { WORLD, PHYSICS, roadLines } from './config.js';

const VARIANTS = ['sedan', 'taxi', 'sport', 'van', 'truck', 'convertible'];
const PAINTS = [0xc22e2e, 0x2e6fc2, 0xe8c33a, 0x2ec27a, 0x8a2ec2, 0xe8e4da, 0x222226, 0xff6a00, 0x00b8a9];

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function makeCarModel(variant, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.08 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14141a });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1c2c44, shininess: 140, specular: 0x88aaff });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xcfd6de, shininess: 160, specular: 0xffffff });

  const isVan = variant === 'van';
  const isTruck = variant === 'truck';
  const bodyLen = isVan ? 5.2 : isTruck ? 5.6 : 4.4;
  const bodyH = isVan ? 1.5 : isTruck ? 1.2 : 0.75;

  // Lower body, cabin, hood and trunk steps.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, bodyH, bodyLen), paint);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);
  if (!isVan && !isTruck) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.62, 2.1), glass);
    cabin.position.set(0, 1.35, -0.15);
    cabin.castShadow = true;
    group.add(cabin);
    group.add(box(1.9, 0.18, 1.1, color, 0, 1.06, 1.35)); // hood step
    group.add(box(1.9, 0.16, 0.9, color, 0, 1.04, -1.55)); // trunk step
  } else if (isVan) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 1.4), glass);
    cabin.position.set(0, 1.75, 1.4);
    group.add(cabin);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.3), paint);
    cab.position.set(0, 1.6, 1.2);
    cab.castShadow = true;
    group.add(cab);
    const bed = box(1.9, 0.5, 2.6, 0x2a2a30, 0, 1.25, -1.3);
    group.add(bed);
  }
  // Bumpers, mirrors, grille.
  group.add(box(2.04, 0.22, 0.3, 0x222226, 0, 0.5, bodyLen / 2));
  group.add(box(2.04, 0.22, 0.3, 0x222226, 0, 0.5, -bodyLen / 2));
  group.add(box(0.16, 0.14, 0.3, chrome, -1.05, 1.15, 0.7));
  group.add(box(0.16, 0.14, 0.3, chrome, 1.05, 1.15, 0.7));
  group.add(box(1.2, 0.18, 0.1, dark, 0, 0.85, bodyLen / 2 + 0.02));
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x881111 });
  for (const sx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), headMat);
    head.position.set(sx, 0.92, bodyLen / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tail.position.set(sx, 0.92, -bodyLen / 2 - 0.02);
    group.add(tail);
  }
  // Variant dressing.
  if (variant === 'taxi') {
    const sign = box(0.9, 0.22, 0.4, 0xe8c33a, 0, 1.85, 0);
    group.add(sign);
  }
  if (variant === 'sport') {
    group.add(box(1.9, 0.08, 0.5, 0x222226, 0, 1.25, -bodyLen / 2 + 0.15));
    group.add(box(0.1, 0.3, 0.4, 0x222226, -0.8, 1.1, -bodyLen / 2 + 0.15));
    group.add(box(0.1, 0.3, 0.4, 0x222226, 0.8, 1.1, -bodyLen / 2 + 0.15));
  }
  if (variant === 'convertible') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 8), chrome);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 1.35, -0.9);
    group.add(roll);
  }
  // Wheels: cylinders that spin and steer at the front.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111114 });
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8);
  const hubMat = new THREE.MeshPhongMaterial({ color: 0xb8c0c8, shininess: 120 });
  const wheels = { front: [], rear: [] };
  for (const [wx, wz, front] of [[-0.95, 1.45, true], [0.95, 1.45, true], [-0.95, -1.45, false], [0.95, -1.45, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    pivot.add(wheel);
    pivot.add(hub);
    pivot.userData.wheel = wheel;
    group.add(pivot);
    (front ? wheels.front : wheels.rear).push(pivot);
  }
  return { group, wheels, headMat, tailMat, length: bodyLen };
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function circleHitsAABB(x, z, r, box) {
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2) || 0.001;
  return { pushX: (dx / d) * (r - d), pushZ: (dz / d) * (r - d) };
}

export function createTraffic(scene, rng, colliders, count = 26) {
  const cars = [];
  const lines = roadLines();
  function randomRoute() {
    let ix = rng.int(0, lines.length - 1);
    let iz = rng.int(0, lines.length - 1);
    const route = [{ x: lines[ix], z: lines[iz] }];
    let horizontal = rng.chance(0.5);
    for (let i = 0; i < 8; i += 1) {
      if (horizontal) ix = Math.max(0, Math.min(lines.length - 1, ix + rng.pick([-1, 1])));
      else iz = Math.max(0, Math.min(lines.length - 1, iz + rng.pick([-1, 1])));
      horizontal = !horizontal;
      route.push({ x: lines[ix], z: lines[iz] });
    }
    return route;
  }
  for (let i = 0; i < count; i += 1) {
    const variant = rng.pick(VARIANTS);
    const model = makeCarModel(variant, rng.pick(PAINTS));
    const route = randomRoute();
    const car = {
      model,
      variant,
      route,
      wp: 1,
      x: route[0].x,
      z: route[0].z,
      heading: 0,
      speed: 0,
      targetSpeed: rng.range(7, 11),
      length: model.length,
      parked: false,
    };
    car.heading = Math.atan2(route[1].x - route[0].x, route[1].z - route[0].z);
    model.group.position.set(car.x, 0, car.z);
    model.group.rotation.y = car.heading;
    scene.add(model.group);
    cars.push(car);
  }
  // Parked cars along the kerb: easy to steal.
  for (let i = 0; i < 8; i += 1) {
    const line = rng.pick(lines);
    const along = rng.range(-WORLD.HALF + 40, WORLD.HALF - 40);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const variant = rng.pick(VARIANTS);
    const model = makeCarModel(variant, rng.pick(PAINTS));
    const car = {
      model,
      variant,
      route: [],
      wp: 0,
      x: horizontal ? along : line + side * (WORLD.ROAD / 2 - 1.6),
      z: horizontal ? line + side * (WORLD.ROAD / 2 - 1.6) : along,
      heading: horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      speed: 0,
      targetSpeed: 0,
      length: model.length,
      parked: true,
    };
    model.group.position.set(car.x, 0, car.z);
    model.group.rotation.y = car.heading;
    scene.add(model.group);
    cars.push(car);
  }
  return {
    cars,
    update(dt, trafficLights) {
      for (const car of cars) {
        if (car.parked || car.route.length < 2) continue;
        const target = car.route[car.wp];
        const dx = target.x - car.x;
        const dz = target.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 3) {
          car.wp += 1;
          if (car.wp >= car.route.length) {
            car.route = randomRoute();
            car.wp = 1;
            car.x = car.route[0].x;
            car.z = car.route[0].z;
          }
          continue;
        }
        // Stop at a red light for this axis when close to the intersection.
        let wantSpeed = car.targetSpeed;
        for (const light of trafficLights) {
          const ldx = light.x - car.x;
          const ldz = light.z - car.z;
          if (Math.hypot(ldx, ldz) > 20) continue;
          const movingX = Math.abs(dx) > Math.abs(dz);
          const green = movingX ? !light.nsGreen : light.nsGreen;
          if (!green && Math.hypot(ldx, ldz) < 16) wantSpeed = 0;
        }
        // Slow down for the car ahead.
        for (const other of cars) {
          if (other === car || other.parked) continue;
          const ox = other.x - car.x;
          const oz = other.z - car.z;
          const od = Math.hypot(ox, oz);
          if (od < 9) {
            const ahead = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
            if (ahead > 0) wantSpeed = Math.min(wantSpeed, other.speed * 0.8);
          }
        }
        car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.6);
        const wantHeading = Math.atan2(dx, dz);
        car.heading = angleLerp(car.heading, wantHeading, Math.min(1, dt * 2.2));
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        car.model.group.position.set(car.x, 0, car.z);
        car.model.group.rotation.y = car.heading;
        const spin = (car.speed * dt) / 0.36;
        for (const pivot of [...car.model.wheels.front, ...car.model.wheels.rear]) {
          pivot.userData.wheel.rotation.x += spin;
        }
      }
    },
    remove(car) {
      const index = cars.indexOf(car);
      if (index >= 0) cars.splice(index, 1);
      car.model.group.parent?.remove(car.model.group);
    },
    nearestStealable(x, z, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const car of cars) {
        const d = Math.hypot(car.x - x, car.z - z);
        if (d < bestD) {
          best = car;
          bestD = d;
        }
      }
      return best;
    },
  };
}

export function createPlayerCar(scene, model) {
  const spotlight = new THREE.SpotLight(0xffe9b0, 0, 60, 0.5, 0.5, 1.2);
  spotlight.position.set(0, 1, 2.2);
  const target = new THREE.Object3D();
  target.position.set(0, 0, 18);
  model.group.add(target);
  spotlight.target = target;
  model.group.add(spotlight);
  scene.add(model.group);
  const car = {
    model,
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    steer: 0,
    damage: 0,
    lightsOn: false,
    spotlight,
    setPose(x, z, heading) {
      car.x = x;
      car.z = z;
      car.heading = heading;
      car.speed = 0;
      model.group.position.set(x, 0, z);
      model.group.rotation.y = heading;
    },
    update(dt, input, colliders, traffic, onCrash) {
      const throttle = input.throttle();
      const steerInput = input.steer();
      const braking = input.is('brake');
      const accel = throttle > 0 ? PHYSICS.carAccel : throttle < 0 ? -PHYSICS.carReverse : 0;
      car.speed += accel * dt;
      if (braking) car.speed -= Math.sign(car.speed) * PHYSICS.carBrake * dt;
      if (throttle === 0 && !braking) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
      const max = input.is('run') ? PHYSICS.carMaxSpeed * 1.15 : PHYSICS.carMaxSpeed;
      car.speed = Math.max(-PHYSICS.carReverse, Math.min(max, car.speed));
      const steerTarget = steerInput * PHYSICS.carTurn * Math.min(1, Math.abs(car.speed) / 8);
      car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
      car.heading += car.steer * dt * Math.sign(car.speed || 1) * (car.speed >= 0 ? 1 : -1);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      // Buildings push the car out; a hard hit damages it.
      let hit = false;
      for (const box of colliders) {
        const push = circleHitsAABB(nx, nz, 1.7, box);
        if (push) {
          car.x += push.pushX;
          car.z += push.pushZ;
          if (Math.abs(car.speed) > 12) {
            car.damage += Math.abs(car.speed) * 0.4;
            onCrash?.(Math.abs(car.speed));
          }
          car.speed *= 0.35;
          hit = true;
          break;
        }
      }
      if (!hit) {
        car.x = nx;
        car.z = nz;
      }
      // Bump traffic cars aside instead of passing through them: the other car
      // is shoved away and keeps driving, the player keeps most of its speed.
      for (const other of traffic.cars) {
        const dx = car.x - other.x;
        const dz = car.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.4 && d > 0.01) {
          const push = (3.4 - d) / 2;
          car.x += (dx / d) * push * 0.4;
          car.z += (dz / d) * push * 0.4;
          other.x -= (dx / d) * push * 1.6;
          other.z -= (dz / d) * push * 1.6;
          other.model.group.position.set(other.x, 0, other.z);
          if (Math.abs(car.speed) > 20) {
            car.damage += 2;
            onCrash?.(Math.abs(car.speed));
          }
          car.speed *= 0.88;
        }
      }
      // Stay inside the city and the beach.
      car.x = Math.max(-WORLD.HALF - 20, Math.min(WORLD.HALF + 20, car.x));
      car.z = Math.max(-WORLD.HALF - 20, Math.min(WORLD.HALF + 40, car.z));
      model.group.position.set(car.x, 0, car.z);
      model.group.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.36;
      for (const pivot of model.wheels.front) {
        pivot.rotation.y = car.steer * 0.45;
        pivot.userData.wheel.rotation.x += spin;
      }
      for (const pivot of model.wheels.rear) pivot.userData.wheel.rotation.x += spin;
      // Taillights flare when braking.
      model.tailMat.color.setHex(braking || throttle < 0 ? 0xff2222 : 0x881111);
      spotlight.intensity = car.lightsOn ? 90 : 0;
    },
  };
  return car;
}
