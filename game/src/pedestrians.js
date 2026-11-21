// Pedestrians: people walking the sidewalks, waiting at bus stops, and fleeing
// when shots ring out or a car mounts the kerb. They give the city life and give
// the wanted system something to react to.
import { WORLD, roadLines } from './config.js';
import { makePersonModel } from './player.js';

const JACKETS = [0xc22e2e, 0x2e6fc2, 0xe8c33a, 0x2ec27a, 0x8a2ec2, 0xe8e4da, 0xff6a00, 0x00b8a9, 0x5a5a66];
const PANTS = [0x22242e, 0x3a2e22, 0x2e3a4a, 0x4a4a52];

export function createPedestrians(scene, rng, count = 42) {
  const peds = [];
  const lines = roadLines();
  for (let i = 0; i < count; i += 1) {
    const model = makePersonModel(rng.pick(JACKETS), rng.pick(PANTS), rng.pick([0xc98d64, 0x8a5a3a, 0xe8b88a, 0x6e4530]));
    const line = rng.pick(lines);
    const along = rng.range(-WORLD.HALF + 20, WORLD.HALF - 20);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const ped = {
      model,
      x: horizontal ? along : line + side * (WORLD.ROAD / 2 + 2),
      z: horizontal ? line + side * (WORLD.ROAD / 2 + 2) : along,
      heading: horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      speed: rng.range(1.1, 1.9),
      state: 'walk',
      fleeX: 0,
      fleeZ: 0,
      phase: rng.range(0, 6),
      down: 0,
      wait: rng.chance(0.15) ? rng.range(2, 8) : 0,
    };
    model.group.position.set(ped.x, 0, ped.z);
    model.group.rotation.y = ped.heading;
    scene.add(model.group);
    peds.push(ped);
  }
  return {
    peds,
    update(dt, danger) {
      for (const ped of peds) {
        if (ped.down > 0) {
          ped.down -= dt;
          if (ped.down <= 0) {
            ped.model.group.rotation.x = 0;
            ped.model.group.position.y = 0;
            ped.state = 'walk';
          }
          continue;
        }
        if (danger && ped.state !== 'flee') {
          const dx = ped.x - danger.x;
          const dz = ped.z - danger.z;
          if (Math.hypot(dx, dz) < 26) {
            ped.state = 'flee';
            ped.fleeX = dx;
            ped.fleeZ = dz;
          }
        }
        if (ped.wait > 0) {
          ped.wait -= dt;
          continue;
        }
        let moveX = 0;
        let moveZ = 0;
        if (ped.state === 'flee') {
          if (!danger) {
            ped.state = 'walk';
          } else {
            const len = Math.hypot(ped.fleeX, ped.fleeZ) || 1;
            moveX = (ped.fleeX / len) * 4.2;
            moveZ = (ped.fleeZ / len) * 4.2;
            ped.heading = Math.atan2(moveX, moveZ);
            if (Math.hypot(ped.x - danger.x, ped.z - danger.z) > 40) ped.state = 'walk';
          }
        } else {
          moveX = Math.sin(ped.heading) * ped.speed;
          moveZ = Math.cos(ped.heading) * ped.speed;
        }
        ped.x += moveX * dt;
        ped.z += moveZ * dt;
        // Turn around at the city edge.
        if (Math.abs(ped.x) > WORLD.HALF + 14 || Math.abs(ped.z) > WORLD.HALF + 34) {
          ped.heading += Math.PI;
          ped.x = Math.max(-WORLD.HALF - 14, Math.min(WORLD.HALF + 14, ped.x));
          ped.z = Math.max(-WORLD.HALF - 14, Math.min(WORLD.HALF + 34, ped.z));
        }
        ped.phase += dt * (ped.state === 'flee' ? 9 : 4);
        const swing = Math.sin(ped.phase) * 0.55;
        ped.model.legL.rotation.x = swing;
        ped.model.legR.rotation.x = -swing;
        ped.model.armL.rotation.x = -swing * 0.7;
        ped.model.armR.rotation.x = swing * 0.7;
        ped.model.group.position.set(ped.x, 0, ped.z);
        ped.model.group.rotation.y = ped.heading;
      }
    },
    knockDown(x, z, radius) {
      let hit = 0;
      for (const ped of peds) {
        if (ped.down > 0) continue;
        if (Math.hypot(ped.x - x, ped.z - z) < radius) {
          ped.down = 2.5;
          ped.model.group.rotation.x = -Math.PI / 2;
          ped.model.group.position.y = 0.25;
          hit += 1;
        }
      }
      return hit;
    },
    fleeFrom(x, z) {
      for (const ped of peds) {
        const dx = ped.x - x;
        const dz = ped.z - z;
        if (Math.hypot(dx, dz) < 26 && ped.state !== 'flee') {
          ped.state = 'flee';
          ped.fleeX = dx;
          ped.fleeZ = dz;
        }
      }
    },
  };
}
