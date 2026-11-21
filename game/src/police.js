// The Solstice City Police Department: cruisers that pursue and ram, roadblocks at
// high wanted levels, and a helicopter with a searchlight from wanted 4 up. The
// helicopter can be evaded: break its line of sight beside tall buildings and its
// lock decays, or shoot it down and it retreats.
import * as THREE from 'three';
import { WORLD, WANTED, PHYSICS, roadLines } from './config.js';
import { makeCarModel } from './vehicles.js';

function makeCruiserModel() {
  const model = makeCarModel('sedan', 0x14161c);
  // White doors and a red/blue light bar mark it as SCPD.
  const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  for (const sx of [-1.01, 1.01]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.5), doorMat);
    door.position.set(sx, 0.95, -0.1);
    model.group.add(door);
  }
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), redMat);
  red.position.set(-0.35, 1.78, 0.1);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), blueMat);
  blue.position.set(0.35, 1.78, 0.1);
  model.group.add(red);
  model.group.add(blue);
  return { ...model, redMat, blueMat };
}

function makeHeliModel() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x2c4a66, shininess: 120 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 4.2), bodyMat);
  body.position.y = 0;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.6), glassMat);
  cabin.position.set(0, 0.2, 1.5);
  group.add(cabin);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 5.5, 8), bodyMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.3, -4.2);
  group.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.0), bodyMat);
  fin.position.set(0, 0.9, -6.6);
  group.add(fin);
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(11, 0.08, 0.5);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x111114 });
  const b1 = new THREE.Mesh(bladeGeo, bladeMat);
  const b2 = new THREE.Mesh(bladeGeo, bladeMat);
  b2.rotation.y = Math.PI / 2;
  rotor.add(b1);
  rotor.add(b2);
  rotor.position.y = 1.1;
  group.add(rotor);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333338 });
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), skidMat);
    skid.position.set(sx, -1.0, 0.4);
    group.add(skid);
  }
  // Searchlight: a real spotlight plus a visible cone of light.
  const spot = new THREE.SpotLight(0xfff2c0, 0, 160, 0.28, 0.45, 0.8);
  const spotTarget = new THREE.Object3D();
  group.add(spotTarget);
  spot.target = spotTarget;
  spot.position.set(0, -0.8, 1);
  group.add(spot);
  const coneGeo = new THREE.ConeGeometry(7, 55, 16, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.rotation.x = Math.PI;
  cone.position.y = -28;
  group.add(cone);
  return { group, rotor, spot, spotTarget, cone };
}

export function createPolice(scene, rng, colliders) {
  const cruisers = [];
  const roadblocks = [];
  let heli = null;
  let arrestTimer = 0;

  function spawnCruiser(x, z) {
    const model = makeCruiserModel();
    const lines = roadLines();
    const cruiser = {
      model,
      x,
      z,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      flash: rng.next(),
    };
    model.group.position.set(x, 0, z);
    scene.add(model.group);
    cruisers.push(cruiser);
    return cruiser;
  }

  function spawnRoadblock(x, z, heading) {
    const group = new THREE.Group();
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0xd86a1e });
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = -1; i <= 1; i += 1) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.5), barrierMat);
      barrier.position.set(i * 2.4, 0.5, 0);
      barrier.castShadow = true;
      group.add(barrier);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.52), stripeMat);
      stripe.position.set(i * 2.4, 0.75, 0);
      group.add(stripe);
    }
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    scene.add(group);
    const block = { group, x, z, heading };
    roadblocks.push(block);
    return block;
  }

  function spawnHeli(x, z) {
    const model = makeHeliModel();
    model.group.position.set(x, PHYSICS.heliHeight, z);
    scene.add(model.group);
    heli = { ...model, x, z, y: PHYSICS.heliHeight, lock: 30, health: 100, retreating: false };
    return heli;
  }

  function despawnHeli() {
    if (!heli) return;
    scene.remove(heli.group);
    heli = null;
  }

  function nearBuilding(x, z, margin) {
    for (const box of colliders) {
      // Only a tall building close by blocks the helicopter's view: a low
      // warehouse or a villa does not hide the player from the sky.
      if ((box.h || 0) < 30) continue;
      if (x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin) return true;
    }
    return false;
  }

  return {
    cruisers,
    roadblocks,
    get heli() {
      return heli;
    },
    get heliLock() {
      return heli ? heli.lock : 0;
    },
    damageHeli(amount) {
      if (!heli || heli.retreating) return false;
      heli.health -= amount;
      if (heli.health <= 0) {
        heli.retreating = true;
        return true;
      }
      return false;
    },
    clear() {
      for (const c of cruisers) scene.remove(c.model.group);
      cruisers.length = 0;
      for (const b of roadblocks) scene.remove(b.group);
      roadblocks.length = 0;
      despawnHeli();
      arrestTimer = 0;
    },
    // Place one cruiser at an exact spot and heading (used to stage a chase
    // shot). Call before setWanted so it counts toward the wanted level's
    // cruiser number instead of being popped as an extra.
    spawnAt(x, z, heading) {
      const c = spawnCruiser(x, z);
      c.heading = heading;
      return c;
    },
    update(dt, time, player, wanted) {
      const need = WANTED[wanted] || WANTED[0];
      // Keep the cruiser count at the wanted level's number.
      while (cruisers.length < need.cruisers) {
        const angle = rng.range(0, Math.PI * 2);
        const dist = rng.range(60, 110);
        spawnCruiser(
          Math.max(-WORLD.HALF, Math.min(WORLD.HALF, player.x + Math.sin(angle) * dist)),
          Math.max(-WORLD.HALF, Math.min(WORLD.HALF, player.z + Math.cos(angle) * dist)),
        );
      }
      while (cruisers.length > need.cruisers) {
        const c = cruisers.pop();
        scene.remove(c.model.group);
      }
      while (roadblocks.length < need.roadblocks) {
        const ahead = 55;
        const x = player.x + Math.sin(player.heading || 0) * ahead;
        const z = player.z + Math.cos(player.heading || 0) * ahead;
        spawnRoadblock(Math.max(-WORLD.HALF, Math.min(WORLD.HALF, x)), Math.max(-WORLD.HALF, Math.min(WORLD.HALF, z)), player.heading || 0);
      }
      while (roadblocks.length > need.roadblocks) {
        const b = roadblocks.pop();
        scene.remove(b.group);
      }
      if (need.heli && !heli) spawnHeli(player.x + 30, player.z - 40);
      if (!need.heli && heli) despawnHeli();

      // Cruisers pursue: steer at the player, ram, and arrest on foot.
      for (const c of cruisers) {
        const dx = player.x - c.x;
        const dz = player.z - c.z;
        const dist = Math.hypot(dx, dz);
        const wantHeading = Math.atan2(dx, dz);
        let d = (wantHeading - c.heading) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        c.heading += d * Math.min(1, dt * 1.8);
        const boost = heli && heli.lock > 70 ? 1.12 : 1;
        const targetSpeed = dist > 8 ? PHYSICS.copMaxSpeed * boost : PHYSICS.copMaxSpeed * 0.4;
        c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.4);
        c.x += Math.sin(c.heading) * c.speed * dt;
        c.z += Math.cos(c.heading) * c.speed * dt;
        // Slide along buildings instead of driving through them.
        for (const box of colliders) {
          const cx = Math.max(box.minX, Math.min(c.x, box.maxX));
          const cz = Math.max(box.minZ, Math.min(c.z, box.maxZ));
          const ddx = c.x - cx;
          const ddz = c.z - cz;
          const dd = Math.hypot(ddx, ddz);
          if (dd < 1.8 && dd > 0.01) {
            c.x = cx + (ddx / dd) * 1.8;
            c.z = cz + (ddz / dd) * 1.8;
          }
        }
        c.model.group.position.set(c.x, 0, c.z);
        c.model.group.rotation.y = c.heading;
        // Flashing light bar.
        const phase = Math.floor(time * 6 + c.flash * 10) % 2 === 0;
        c.model.redMat.color.setHex(phase ? 0xff2222 : 0x440000);
        c.model.blueMat.color.setHex(phase ? 0x000044 : 0x2266ff);
        const spin = (c.speed * dt) / 0.36;
        for (const pivot of [...c.model.wheels.front, ...c.model.wheels.rear]) pivot.userData.wheel.rotation.x += spin;
      }

      // Arrest: a cruiser parked on top of an on-foot player.
      if (!player.inCar && wanted > 0) {
        let near = false;
        for (const c of cruisers) {
          if (Math.hypot(c.x - player.x, c.z - player.z) < 4 && c.speed < 4) near = true;
        }
        arrestTimer = near ? arrestTimer + dt : 0;
        if (arrestTimer > 2.5) {
          arrestTimer = 0;
          return 'busted';
        }
      } else {
        arrestTimer = 0;
      }

      // Helicopter: hover above the player, searchlight tracking, lock that the
      // player can break by hugging tall buildings or shooting the helicopter.
      if (heli) {
        if (heli.retreating) {
          heli.y += 18 * dt;
          heli.x += Math.sin(time) * 20 * dt;
          heli.z -= 30 * dt;
          heli.group.position.set(heli.x, heli.y, heli.z);
          heli.rotor.rotation.y += dt * 22;
          if (heli.y > 160) despawnHeli();
          return null;
        }
        // Hover just ahead of the player, so the helicopter and its
        // searchlight read in the chase camera's frame.
        const leadX = player.x + Math.sin(player.heading || 0) * 14;
        const leadZ = player.z + Math.cos(player.heading || 0) * 14;
        const tx = leadX;
        const tz = leadZ;
        heli.x += (tx - heli.x) * Math.min(1, dt * 0.7);
        heli.z += (tz - heli.z) * Math.min(1, dt * 0.7);
        heli.y += (PHYSICS.heliHeight - heli.y) * Math.min(1, dt);
        heli.group.position.set(heli.x, heli.y, heli.z);
        heli.group.rotation.y = Math.atan2(tx - heli.x, tz - heli.z) + Math.PI;
        heli.rotor.rotation.y += dt * 24;
        // Searchlight follows the player on the ground.
        heli.spotTarget.position.set(player.x - heli.x, -heli.y, player.z - heli.z);
        heli.spot.intensity = 160;
        heli.cone.lookAt(player.x, 0, player.z);
        heli.cone.position.set(0, -heli.y / 2 + 1, 0);
        // Line of sight: hugging a tall building the heli cannot see the player.
        const hidden = nearBuilding(player.x, player.z, 5);
        const fast = player.speed && Math.abs(player.speed) > 30;
        if (hidden) heli.lock -= 14 * dt;
        else if (fast) heli.lock -= 4 * dt;
        else heli.lock += 14 * dt;
        heli.lock = Math.max(0, Math.min(100, heli.lock));
        heli.cone.material.opacity = 0.14 + (heli.lock / 100) * 0.14;
      }
      return null;
    },
  };
}
