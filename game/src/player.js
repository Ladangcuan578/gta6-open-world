// Dante Vega on foot: a simple articulated figure with a walk cycle, who can run,
// steal cars, fight and take damage. The camera-relative movement keeps WASD
// intuitive from the chase camera.
import * as THREE from 'three';
import { WORLD, PHYSICS } from './config.js';

export function makePersonModel(jacket, pants, skin = 0xc98d64) {
  const group = new THREE.Group();
  const jacketMat = new THREE.MeshLambertMaterial({ color: jacket });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x1c1410 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacketMat);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), hairMat);
  hair.position.y = 1.98;
  group.add(hair);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const armGeo = new THREE.BoxGeometry(0.16, 0.66, 0.16);
  const armLm = new THREE.Mesh(armGeo, jacketMat);
  armLm.position.y = -0.33;
  armL.add(armLm);
  const armRm = new THREE.Mesh(armGeo, jacketMat);
  armRm.position.y = -0.33;
  armR.add(armRm);
  armL.position.set(-0.4, 1.48, 0);
  armR.position.set(0.4, 1.48, 0);
  group.add(armL);
  group.add(armR);
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.2);
  const legLm = new THREE.Mesh(legGeo, pantsMat);
  legLm.position.y = -0.39;
  legL.add(legLm);
  const legRm = new THREE.Mesh(legGeo, pantsMat);
  legRm.position.y = -0.39;
  legR.add(legRm);
  legL.position.set(-0.17, 0.78, 0);
  legR.position.set(0.17, 0.78, 0);
  group.add(legL);
  group.add(legR);
  return { group, armL, armR, legL, legR };
}

export function createPlayer(scene) {
  const model = makePersonModel(0x14b8a6, 0x22242e);
  scene.add(model.group);
  const player = {
    model,
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    health: 100,
    money: 250,
    inCar: false,
    walkPhase: 0,
    setPose(x, z, heading) {
      player.x = x;
      player.z = z;
      player.heading = heading;
      player.speed = 0;
      model.group.position.set(x, 0, z);
      model.group.rotation.y = heading;
    },
    update(dt, input, cameraHeading, colliders) {
      const fwdX = Math.sin(cameraHeading);
      const fwdZ = Math.cos(cameraHeading);
      const rightX = -fwdZ;
      const rightZ = fwdX;
      const ix = input.throttle();
      const iz = input.steer();
      let mx = fwdX * ix + rightX * iz;
      let mz = fwdZ * ix + rightZ * iz;
      const len = Math.hypot(mx, mz);
      const running = input.is('run');
      const targetSpeed = len > 0 ? (running ? PHYSICS.runSpeed : PHYSICS.walkSpeed) : 0;
      if (len > 0) {
        mx /= len;
        mz /= len;
        const wantHeading = Math.atan2(mx, mz);
        let d = (wantHeading - player.heading) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        player.heading += d * Math.min(1, dt * 10);
      }
      player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 8);
      const nx = player.x + Math.sin(player.heading) * player.speed * dt;
      const nz = player.z + Math.cos(player.heading) * player.speed * dt;
      let blocked = false;
      for (const box of colliders) {
        const cx = Math.max(box.minX, Math.min(nx, box.maxX));
        const cz = Math.max(box.minZ, Math.min(nz, box.maxZ));
        if (Math.hypot(nx - cx, nz - cz) < 0.5) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        player.x = Math.max(-WORLD.HALF - 20, Math.min(WORLD.HALF + 20, nx));
        player.z = Math.max(-WORLD.HALF - 20, Math.min(WORLD.HALF + 40, nz));
      } else {
        player.speed *= 0.4;
      }
      // Walk cycle: arms and legs swing with speed.
      player.walkPhase += dt * player.speed * 1.6;
      const swing = Math.min(0.7, player.speed * 0.09) * Math.sin(player.walkPhase);
      model.legL.rotation.x = swing;
      model.legR.rotation.x = -swing;
      model.armL.rotation.x = -swing * 0.8;
      model.armR.rotation.x = swing * 0.8;
      model.group.position.set(player.x, 0, player.z);
      model.group.rotation.y = player.heading;
    },
  };
  return player;
}
