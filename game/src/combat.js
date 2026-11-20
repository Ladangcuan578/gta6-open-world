// Solstice City v4 — combat. Mouse aim, bullets, and damage. Shooting
// works on foot and as a drive-by from a car. Bullets are plain objects in
// g.bullets; a shot is counted the moment it is pushed.

import * as THREE from '../vendor/three.module.min.js';
import { SPEED } from './config.js';
import { isBlocked } from './city.js';
import { addWanted } from './player.js';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// Convert a screen pixel into a point on the ground plane (y = 0).
// The canvas fills the window, so window size is the right frame.
export function screenToGround(g, screenX, screenY) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ndc.set((screenX / w) * 2 - 1, -(screenY / h) * 2 + 1);
  raycaster.setFromCamera(ndc, g.camera);
  const origin = raycaster.ray.origin;
  const dir = raycaster.ray.direction;
  if (dir.y >= -0.05) {
    // Aiming at the sky: pick a point ahead of the player instead.
    const p = g.player;
    return { x: p.x + Math.cos(p.heading) * 120, y: p.y + Math.sin(p.heading) * 120 };
  }
  const t = -origin.y / dir.y;
  return { x: origin.x + dir.x * t, y: origin.z + dir.z * t };
}

export function shootAt(g, screenX, screenY) {
  const p = g.player;
  const origin = p.driving && p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
  const target = screenToGround(g, screenX, screenY);
  const heading = Math.atan2(target.y - origin.y, target.x - origin.x);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd21f }),
  );
  mesh.position.set(origin.x, p.driving ? 3 : 6, origin.y);
  g.scene.add(mesh);
  const bullet = {
    x: origin.x,
    y: origin.y,
    heading,
    speed: SPEED.bullet,
    life: 1.2,
    mesh,
    fromPlayer: true,
  };
  g.bullets.push(bullet);
  g.lastShot = { x: origin.x, y: origin.y, time: g.time };
  g.audio.gunshot();
}

export function updateBullets(g, dt) {
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    b.x += Math.cos(b.heading) * b.speed * dt;
    b.y += Math.sin(b.heading) * b.speed * dt;
    b.life -= dt;
    b.mesh.position.set(b.x, b.mesh.position.y, b.y);
    let dead = b.life <= 0;
    // Walls stop bullets.
    if (!dead && isBlocked(g.city, b.x, b.y, 0)) dead = true;
    // Cars take damage.
    if (!dead) {
      for (const car of g.cars) {
        if (car.wreck) continue;
        if (Math.hypot(car.x - b.x, car.y - b.y) < 6.5) {
          car.health -= 34;
          dead = true;
          if (car.driver === 'police' && b.fromPlayer) {
            addWanted(g, 1);
            g.hud.toast('You shot a cop — the heat is on');
          }
          if (car.health <= 0) {
            car.wreck = true;
            car.speed = 0;
            car.group.rotation.z = 0.12;
            if (car.driver === 'player') {
              g.player.inCar = null;
              g.player.driving = false;
              g.player.group.visible = true;
            }
            car.driver = null;
          }
          break;
        }
      }
    }
    // Pedestrians take damage.
    if (!dead) {
      for (const ped of g.peds.list) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 5) {
          ped.state = 'down';
          ped.downTimer = 3;
          if (b.fromPlayer) addWanted(g, 1);
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      g.scene.remove(b.mesh);
      g.bullets.splice(i, 1);
    }
  }
}
