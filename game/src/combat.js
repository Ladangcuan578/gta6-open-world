// Combat: a weapon wheel (fists, pistol, SMG, shotgun), raycast shooting with
// tracers and muzzle flash, and the enemies missions spawn — guards and gang
// members who shoot back, miss a lot, and drop ammo when they fall.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { makePersonModel } from './player.js';

const ENEMY_JACKETS = [0xc0392b, 0x8e44ad, 0x2471a3];

export function createCombat(scene, rng, callbacks) {
  const raycaster = new THREE.Raycaster();
  const enemies = [];
  const tracers = [];
  const flashes = [];
  let weapon = 'fists';
  const ammo = {
    pistol: { mag: 12, reserve: 96 },
    smg: { mag: 30, reserve: 180 },
    shotgun: { mag: 6, reserve: 36 },
  };
  let cooldown = 0;
  let reloadTimer = 0;

  const muzzle = new THREE.PointLight(0xffc36b, 0, 18, 1.5);
  scene.add(muzzle);

  function makeTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }

  function burst(point, color) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(24 * 3);
    for (let i = 0; i < 24; i += 1) {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 0.9 }));
    scene.add(points);
    flashes.push({ points, life: 0.3, velocities: Array.from({ length: 24 }, () => new THREE.Vector3(rng.range(-3, 3), rng.range(0, 4), rng.range(-3, 3))) });
  }

  function shootRay(origin, direction, targets, damage, spread) {
    const dir = direction.clone();
    dir.x += (rng.next() - 0.5) * spread * 2;
    dir.y += (rng.next() - 0.5) * spread * 2;
    dir.z += (rng.next() - 0.5) * spread * 2;
    dir.normalize();
    raycaster.set(origin, dir);
    raycaster.far = 80;
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) {
      makeTracer(origin, origin.clone().add(dir.multiplyScalar(60)));
      return null;
    }
    const hit = hits[0];
    makeTracer(origin, hit.point);
    burst(hit.point, 0xffc36b);
    return hit;
  }

  return {
    enemies,
    get weapon() {
      return weapon;
    },
    get ammo() {
      return ammo[weapon] || { mag: Infinity, reserve: Infinity };
    },
    select(id) {
      if (WEAPONS[id]) {
        weapon = id;
        reloadTimer = 0;
        callbacks.onWeapon?.(id);
        return true;
      }
      return false;
    },
    reload() {
      if (weapon === 'fists') return;
      const def = WEAPONS[weapon];
      const slot = ammo[weapon];
      if (slot.mag === def.mag || slot.reserve === 0) return;
      reloadTimer = 0.9;
      callbacks.onReload?.();
    },
    fire(origin, direction, heli) {
      if (cooldown > 0 || reloadTimer > 0) return false;
      // The raycast reads world matrices: refresh them so a shot lands even
      // before the next rendered frame (headless stepping, first frame).
      scene.updateMatrixWorld(true);
      const def = WEAPONS[weapon];
      cooldown = def.rate;
      if (weapon === 'fists') {
        // A swing: short range, no tracer.
        for (const e of enemies) {
          if (e.health > 0 && Math.hypot(e.x - origin.x, e.z - origin.z) < def.range) {
            e.health -= def.damage;
            burst(new THREE.Vector3(e.x, 1.4, e.z), 0xff6a5e);
            if (e.health <= 0) this.kill(e);
          }
        }
        return true;
      }
      const slot = ammo[weapon];
      if (slot.mag <= 0) {
        this.reload();
        return false;
      }
      slot.mag -= 1;
      muzzle.position.copy(origin).add(direction.clone().multiplyScalar(1.2));
      muzzle.intensity = 60;
      const targets = [];
      for (const e of enemies) if (e.health > 0) targets.push(e.model.group);
      if (heli && heli.health > 0 && !heli.retreating) {
        heli.group.userData.heli = heli;
        targets.push(heli.group);
      }
      const pellets = def.pellets || 1;
      let hitEnemy = null;
      for (let p = 0; p < pellets; p += 1) {
        const hit = shootRay(origin, direction, targets, def.damage, def.spread);
        if (hit) {
          let obj = hit.object;
          while (obj && !obj.userData.enemy && !obj.userData.heli) obj = obj.parent;
          if (obj?.userData.enemy) hitEnemy = obj.userData.enemy;
          if (obj?.userData.heli) callbacks.onHeliHit?.(def.damage);
        }
      }
      if (hitEnemy) {
        hitEnemy.health -= def.damage;
        if (hitEnemy.health <= 0) this.kill(hitEnemy);
      }
      callbacks.onShot?.();
      return true;
    },
    kill(enemy) {
      enemy.health = 0;
      enemy.dead = 2.5;
      enemy.model.group.rotation.x = -Math.PI / 2;
      enemy.model.group.position.y = 0.3;
      ammo.pistol.reserve += 6;
      ammo.smg.reserve += 12;
      callbacks.onKill?.(enemy);
    },
    spawn(positions, weaponId = 'pistol') {
      const spawned = [];
      for (const pos of positions) {
        const model = makePersonModel(rng.pick(ENEMY_JACKETS), 0x22242e, rng.pick([0xc98d64, 0x8a5a3a]));
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x111114 }));
        gun.position.set(0.42, 1.25, 0.3);
        model.group.add(gun);
        model.group.position.set(pos.x, 0, pos.z);
        model.group.userData.enemy = null;
        const enemy = {
          model,
          x: pos.x,
          z: pos.z,
          heading: rng.range(0, Math.PI * 2),
          health: 60,
          weapon: weaponId,
          shootTimer: rng.range(0.5, 1.5),
          dead: 0,
        };
        model.group.userData.enemy = enemy;
        scene.add(model.group);
        enemies.push(enemy);
        spawned.push(enemy);
      }
      return spawned;
    },
    clear() {
      for (const e of enemies) scene.remove(e.model.group);
      enemies.length = 0;
    },
    aliveCount() {
      return enemies.filter((e) => e.health > 0).length;
    },
    update(dt, playerPos, heli) {
      cooldown = Math.max(0, cooldown - dt);
      if (reloadTimer > 0) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) {
          const def = WEAPONS[weapon];
          const slot = ammo[weapon];
          const need = def.mag - slot.mag;
          const take = Math.min(need, slot.reserve);
          slot.mag += take;
          slot.reserve -= take;
        }
      }
      muzzle.intensity = Math.max(0, muzzle.intensity - dt * 500);
      for (const t of tracers) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) {
          scene.remove(t.line);
          t.line.geometry.dispose();
        }
      }
      for (let i = tracers.length - 1; i >= 0; i -= 1) if (tracers[i].life <= 0) tracers.splice(i, 1);
      for (const f of flashes) {
        f.life -= dt;
        const pos = f.points.geometry.attributes.position;
        for (let i = 0; i < 24; i += 1) {
          pos.array[i * 3] += f.velocities[i].x * dt;
          pos.array[i * 3 + 1] += f.velocities[i].y * dt;
          pos.array[i * 3 + 2] += f.velocities[i].z * dt;
        }
        pos.needsUpdate = true;
        f.points.material.opacity = Math.max(0, f.life / 0.3) * 0.9;
        if (f.life <= 0) scene.remove(f.points);
      }
      for (let i = flashes.length - 1; i >= 0; i -= 1) if (flashes[i].life <= 0) flashes.splice(i, 1);
      // Enemies shoot back at the player on foot.
      for (const e of enemies) {
        if (e.health <= 0) {
          if (e.dead > 0) {
            e.dead -= dt;
            if (e.dead <= 0) {
              scene.remove(e.model.group);
              enemies.splice(enemies.indexOf(e), 1);
            }
          }
          continue;
        }
        const dx = playerPos.x - e.x;
        const dz = playerPos.z - e.z;
        const dist = Math.hypot(dx, dz);
        e.heading = Math.atan2(dx, dz);
        e.model.group.rotation.y = e.heading;
        if (dist > 26) {
          e.x += Math.sin(e.heading) * 3.2 * dt;
          e.z += Math.cos(e.heading) * 3.2 * dt;
          e.model.group.position.set(e.x, 0, e.z);
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && dist < 42) {
          e.shootTimer = rng.range(0.7, 1.6);
          const origin = new THREE.Vector3(e.x, 1.4, e.z);
          const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
          shootRay(origin, dir, [], 0, 0.06);
          // Hit chance falls with distance; a hit hurts.
          if (rng.next() < Math.max(0.08, 0.42 - dist * 0.008)) {
            callbacks.onPlayerDamage?.(rng.int(5, 11), e.x, e.z);
          }
        }
      }
    },
  };
}
